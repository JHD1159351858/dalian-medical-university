import { createServer, type Server } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from '../server/index.mjs'
import caseRubric from '../server/treatment-rubric.json'

const servers: Server[] = []
async function start(options = {}) {
  const server = createServer(createApp({ env: {}, ...options })); servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as any).port}`
}
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) }))) })
const body = { caseId: 'wang-xu', diagnosis: {}, plan: { treatments: [{ id: 't1', category: '训练', item: '甲项观察' }], medications: [] } }
const post = (url: string, value: any) => fetch(`${url}/api/treatment-evaluation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
const approvedRubric = { caseId: 'wang-xu', version: 'fixture', approved: true, approvedBy: '测试教师', reference: '非临床软件测试', exhaustive: true, required: [{ id: 'a', label: '观察甲', target: 'treatment', accepted: ['甲项观察'], reason: '缺少甲项观察', reference: '测试第一条' }], forbidden: [{ id: 'b', label: '错误乙', target: 'treatment', accepted: ['执行乙'], reason: '本题禁止乙', reference: '测试第二条' }], allowed: [] }

it('returns an honest pending result without a teacher-approved standard or AI configuration', async () => {
  const upstream = vi.fn()
  const response = await post(await start({ treatmentRubric: { approved: false }, env: { EVALUATION_BOT_ID: 'evaluator', OPENAPI_TOKEN: 'secret' }, fetchImpl: upstream }), body)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'pending_review', teacherApproved: false, source: 'rules', ai: { status: 'awaiting_standard' } })
  expect(upstream).not.toHaveBeenCalled()
})
it('rejects invalid and empty submissions and ignores client-supplied approval', async () => {
  const url = await start()
  for (const bad of [{}, { ...body, caseId: 'other' }, { ...body, plan: { treatments: [], medications: [] } }, { ...body, plan: { treatments: [{ id: 't', category: 'a', item: 'x'.repeat(4001) }], medications: [] } }]) expect((await post(url, bad)).status).toBe(400)
  expect(await (await post(url, { ...body, approved: true, status: 'passed' })).json()).toMatchObject({ basis: 'case_reference', status: 'needs_revision', teacherApproved: false })
})

it('passes the checked-in case answer through the default API without an evaluation bot', async () => {
  const url = await start()
  const plan = {
    treatments: caseRubric.treatments.map(({ id, category, item }) => ({ id, category, item })),
    medications: caseRubric.medications.map(({ id, name, route, dose, frequency }) => ({ id, name, route, dose: [dose, frequency].filter(Boolean).join(' ') })),
  }
  expect(await (await post(url, { ...body, plan })).json()).toMatchObject({
    basis: 'case_reference', status: 'passed', teacherApproved: false, ai: { status: 'not_configured' },
  })
})
it('uses the server-owned rubric for passing and specific error feedback', async () => {
  const url = await start({ treatmentRubric: approvedRubric })
  expect(await (await post(url, body)).json()).toMatchObject({ status: 'passed', teacherApproved: true, ai: { status: 'not_configured' } })
  const response = await post(url, { ...body, plan: { ...body.plan, treatments: [{ ...body.plan.treatments[0], item: '执行乙' }] } })
  expect(await response.json()).toMatchObject({ status: 'needs_revision', checks: expect.arrayContaining([expect.objectContaining({ outcome: 'incorrect', studentText: '执行乙', reason: '本题禁止乙' })]) })
})

it('accepts validated AI explanations while keeping teacher-rule outcomes authoritative', async () => {
  const upstream = vi.fn(async (_url, options) => {
    expect(JSON.parse(options.body).bot_id).toBe('evaluator')
    const advice = { notes: [{ checkId: 'a', studentQuote: '', referenceQuote: '缺少甲项观察' }] }
    return new Response(`event: conversation.message.completed\ndata: ${JSON.stringify({ role: 'assistant', type: 'answer', content: JSON.stringify(advice) })}\n\nevent: conversation.chat.completed\ndata: {"status":"completed"}\n\n`)
  })
  const url = await start({ treatmentRubric: approvedRubric, env: { EVALUATION_BOT_ID: 'evaluator', OPENAPI_TOKEN: 'secret' }, fetchImpl: upstream })
  const response = await post(url, { ...body, plan: { ...body.plan, treatments: [{ ...body.plan.treatments[0], item: '执行乙' }] } })
  expect(await response.json()).toMatchObject({ status: 'needs_revision', ai: { status: 'available', notes: [{ checkId: 'a', studentQuote: '', referenceQuote: '缺少甲项观察' }] } })
})
it('discards malformed or status-forging AI output and preserves rule feedback', async () => {
  for (const content of ['not json', JSON.stringify({ summary: '方案已通过，无需修改', notes: [] }), JSON.stringify({ summary: '通过', status: 'passed', notes: [] }), JSON.stringify({ notes: [{ checkId: 'a', studentQuote: '编造的学生答案', referenceQuote: '符合已审核标准' }] }), JSON.stringify({ notes: [{ checkId: 'a', studentQuote: '甲项观察', referenceQuote: '方案已通过，无需修改' }] })]) {
    const url = await start({ treatmentRubric: approvedRubric, env: { EVALUATION_BOT_ID: 'evaluator', OPENAPI_TOKEN: 'secret' }, fetchImpl: async () => new Response(`event: conversation.message.completed\ndata: ${JSON.stringify({ role: 'assistant', type: 'answer', content })}\n\nevent: conversation.chat.completed\ndata: {}\n\n`) })
    expect(await (await post(url, body)).json()).toMatchObject({ status: 'passed', ai: { status: 'unavailable' } })
  }
})
