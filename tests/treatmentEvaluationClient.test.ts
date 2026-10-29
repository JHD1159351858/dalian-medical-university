import { afterEach, expect, it, vi } from 'vitest'
import { requestTreatmentEvaluation } from '../src/clinical/treatmentEvaluation'

afterEach(() => vi.unstubAllGlobals())
const submission = { caseId: 'wang-xu', diagnosis: {}, plan: { treatments: [{ id: 'a', category: '学生方案', item: '学生表述' }], medications: [] } }
const pending = { source: 'rules', teacherApproved: false, rubricVersion: 'unreviewed', status: 'pending_review', message: '待教师确认', checks: [{ id: 'standard', label: '处置标准', outcome: 'unreviewed', studentText: '', reason: '教师未审核', reference: '教学材料' }], ai: { status: 'awaiting_standard' } }

it('submits the actual plan and preserves an unreviewed result without treating it as passing', async () => {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(pending)))
  vi.stubGlobal('fetch', mock)
  expect(await requestTreatmentEvaluation(submission)).toEqual(pending)
  expect(mock.mock.calls[0][0]).toBe('/api/treatment-evaluation')
  expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual(submission)
})
it('rejects failed, incomplete or contradictory evaluation output', async () => {
  for (const value of [{}, { ...pending, status: 'passed' }, { ...pending, checks: [{ id: 'a' }] }, { ...pending, ai: {} }]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value))))
    await expect(requestTreatmentEvaluation(submission)).rejects.toThrow('评价结果格式异常')
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '请补充处置' }), { status: 400 })))
  await expect(requestTreatmentEvaluation(submission)).rejects.toThrow('请补充处置')
})
