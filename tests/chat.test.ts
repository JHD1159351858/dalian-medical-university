import { afterEach, expect, it, vi } from 'vitest'
import { requestReply } from '../src/diagnosis/chat'
import { PATIENT_OPENING } from '../src/clinical/caseData'

afterEach(() => vi.unstubAllGlobals())

it('sends a streaming request and reports SSE deltas before the completed reply', async () => {
  const encoder = new TextEncoder()
  let finish!: () => void
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('event: delta\ndata: {"text":"左"}\n\nevent: del'))
      finish = () => {
        controller.enqueue(encoder.encode('ta\ndata: {"text":"上腹"}\n\nevent: done\ndata: {"reply":"左上腹疼。"}\n\n'))
        controller.close()
      }
    },
  })
  const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
  vi.stubGlobal('fetch', fetchMock)
  const deltas: string[] = []
  const result = requestReply([{ role: 'assistant', content: PATIENT_OPENING }, { role: 'user', content: '哪里疼？' }], (text) => deltas.push(text))

  await vi.waitFor(() => expect(deltas).toEqual(['左']))
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    messages: [{ role: 'assistant', content: PATIENT_OPENING }, { role: 'user', content: '哪里疼？' }], stream: true,
  })
  finish()
  expect(await result).toBe('左上腹疼。')
  expect(deltas).toEqual(['左', '上腹'])
})

it('reports an SSE error rather than treating a partial answer as complete', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    'event: delta\ndata: {"text":"我"}\n\nevent: error\ndata: {"error":"测试：服务中断"}\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )))
  const deltas: string[] = []
  await expect(requestReply([{ role: 'user', content: '您好' }], (text) => deltas.push(text)))
    .rejects.toThrow('测试：服务中断')
  expect(deltas).toEqual(['我'])
})
