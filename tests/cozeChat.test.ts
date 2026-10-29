import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { createApp } from '../server/index.mjs'
import { PATIENT_OPENING } from '../src/clinical/caseData'

const servers: Server[] = []

async function listen(server: Server): Promise<string> {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Server did not bind')
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

it('returns the completed answer from the published Coze bot', async () => {
  let upstreamBody: any
  const upstream = await listen(createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    upstreamBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    response.setHeader('content-type', 'text/event-stream')
    response.end([
      'event: conversation.message.delta',
      'data: {"role":"assistant","type":"answer","content":"我左"}',
      '',
      'event: conversation.message.completed',
      'data: {"role":"assistant","type":"answer","content":"我左上腹疼。"}',
      '',
      'event: conversation.chat.completed',
      'data: {"status":"completed"}',
      '',
      'event: done',
      'data: [DONE]',
      '',
    ].join('\n'))
  }))
  const app = await listen(createServer(createApp({ env: {
    OPENAPI_BASE_URL: upstream,
    OPENAPI_TOKEN: 'test-token',
    PATIENT_BOT_ID: '7687864464020619300',
  } })))

  const response = await fetch(`${app}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'assistant', content: PATIENT_OPENING }, { role: 'user', content: '哪里疼？' }] }),
  })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ reply: '我左上腹疼。' })
  expect(upstreamBody).toMatchObject({
    bot_id: '7687864464020619300',
    stream: true,
    auto_save_history: false,
    additional_messages: [{ role: 'assistant', content: PATIENT_OPENING, content_type: 'text' }, { role: 'user', content: '哪里疼？', content_type: 'text' }],
  })
  expect(JSON.parse(upstreamBody.custom_variables.case_data)).toMatchObject({
    patient: { name: '王旭', age: 48 },
    chiefComplaint: expect.stringContaining('腹痛'),
  })
})

it('forwards Coze answer fragments before the reply is complete', async () => {
  let releaseUpstream!: () => void
  const upstreamComplete = new Promise<void>((resolve) => { releaseUpstream = resolve })
  const upstream = await listen(createServer(async (_request, response) => {
    response.setHeader('content-type', 'text/event-stream')
    response.write('event: conversation.message.delta\ndata: {"role":"assistant","type":"answer","content":"我左"}\n\n')
    await upstreamComplete
    response.end('event: conversation.message.completed\ndata: {"role":"assistant","type":"answer","content":"我左上腹疼。"}\n\nevent: conversation.chat.completed\ndata: {"status":"completed"}\n\n')
  }))
  const app = await listen(createServer(createApp({ env: {
    OPENAPI_BASE_URL: upstream,
    OPENAPI_TOKEN: 'test-token',
    PATIENT_BOT_ID: '7687864464020619300',
  } })))

  const firstRead = fetch(`${app}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: '哪里疼？' }] }),
  }).then(async (response) => {
    const reader = response.body!.getReader()
    const first = await reader.read()
    return { response, reader, first: new TextDecoder().decode(first.value) }
  })
  const early = await Promise.race([firstRead, new Promise<null>((resolve) => setTimeout(() => resolve(null), 300))])
  releaseUpstream()
  const result = await firstRead
  expect(early).not.toBeNull()
  expect(result.response.headers.get('content-type')).toContain('text/event-stream')
  expect(result.first).toContain('event: delta')
  expect(result.first).toContain('我左')
  let tail = ''
  for (;;) {
    const chunk = await result.reader.read()
    if (chunk.done) break
    tail += new TextDecoder().decode(chunk.value)
  }
  expect(tail).toContain('event: done')
  expect(tail).toContain('我左上腹疼。')
})
