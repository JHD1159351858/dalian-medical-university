import { afterEach, expect, it, vi } from 'vitest'
import { startSpeechStream, stopSpeech } from '../src/diagnosis/speech'

class FakeSocket {
  static instances: FakeSocket[] = []
  readyState = 0
  sent: Array<Record<string, unknown>> = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor(readonly url: string) { FakeSocket.instances.push(this) }
  send(data: string) { this.sent.push(JSON.parse(data)) }
  close() { this.readyState = 3; this.onclose?.() }
  ready() {
    this.readyState = 1
    this.onopen?.()
    this.receive({ type: 'ready', sampleRate: 24000 })
  }
  receive(data: object) { this.onmessage?.({ data: JSON.stringify(data) }) }
}

class FakeSource {
  buffer: { duration: number } | null = null
  onended: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  connect() {}
  disconnect() {}
}

class FakeContext {
  static instances: FakeContext[] = []
  currentTime = 10
  destination = {}
  sources: FakeSource[] = []
  samples: Float32Array[] = []
  resume = vi.fn(async () => undefined)
  close = vi.fn(async () => undefined)
  constructor() { FakeContext.instances.push(this) }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const samples = new Float32Array(length)
    this.samples.push(samples)
    return { duration: length / sampleRate, getChannelData: () => samples }
  }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source }
}

function setup() {
  vi.stubGlobal('window', {
    location: { protocol: 'http:', host: 'localhost:5173' },
    AudioContext: FakeContext,
    speechSynthesis: { cancel: vi.fn() },
  })
  vi.stubGlobal('WebSocket', FakeSocket)
}

const pcm = (values: number[]) => {
  const bytes = Buffer.alloc(values.length * 2)
  values.forEach((value, index) => bytes.writeInt16LE(value, index * 2))
  return bytes.toString('base64')
}

afterEach(() => {
  stopSpeech()
  vi.unstubAllGlobals()
  FakeSocket.instances = []
  FakeContext.instances = []
})

it('streams text after readiness and plays audio before the reply is complete', async () => {
  setup()
  const started = vi.fn()
  const finished = vi.fn()
  const stream = startSpeechStream({ voiceId: 'voice-a', speed: 0.95 }, started, finished)
  stream.push('左上')
  expect(FakeSocket.instances).toHaveLength(1)
  const socket = FakeSocket.instances[0]
  expect(socket.url).toBe('ws://localhost:5173/api/speech-stream')
  expect(socket.sent).toEqual([])
  socket.ready()
  expect(socket.sent).toEqual([
    { type: 'start', voiceId: 'voice-a', speed: 0.95, emotion: 'neutral' },
    { type: 'append', text: '左上' },
  ])
  stream.push('腹疼。')
  expect(socket.sent.at(-1)).toEqual({ type: 'append', text: '腹疼。' })
  socket.receive({ type: 'audio', data: pcm([0, 32767, -32768]) })
  await vi.waitFor(() => expect(started).toHaveBeenCalledOnce())
  const context = FakeContext.instances[0]
  expect(Array.from(context.samples[0])).toEqual([0, 32767 / 32768, -1])
  expect(context.sources[0].start).toHaveBeenCalledOnce()
  expect(finished).not.toHaveBeenCalled()
  stream.finish()
  expect(socket.sent.at(-1)).toEqual({ type: 'finish' })
  socket.receive({ type: 'done' })
  expect(finished).not.toHaveBeenCalled()
  context.sources[0].onended?.()
  expect(finished).toHaveBeenCalledOnce()
})

it('schedules consecutive PCM fragments without overlapping and preserves split samples', async () => {
  setup()
  const stream = startSpeechStream()
  const socket = FakeSocket.instances[0]
  socket.ready()
  const bytes = Buffer.from(pcm([100, -100, 200]), 'base64')
  socket.receive({ type: 'audio', data: bytes.subarray(0, 3).toString('base64') })
  socket.receive({ type: 'audio', data: bytes.subarray(3).toString('base64') })
  await vi.waitFor(() => expect(FakeContext.instances[0].sources).toHaveLength(2))
  const context = FakeContext.instances[0]
  expect(context.samples.flatMap((samples) => Array.from(samples))).toEqual([100 / 32768, -100 / 32768, 200 / 32768])
  const firstStart = context.sources[0].start.mock.calls[0][0]
  expect(context.sources[1].start.mock.calls[0][0]).toBeCloseTo(firstStart + 1 / 24000, 8)
  stream.stop()
})

it('stops scheduled audio and ignores late audio and completion from the canceled connection', async () => {
  setup()
  const finished = vi.fn()
  const stream = startSpeechStream({}, undefined, finished)
  const socket = FakeSocket.instances[0]
  socket.ready()
  socket.receive({ type: 'audio', data: pcm([100]) })
  await vi.waitFor(() => expect(FakeContext.instances[0].sources).toHaveLength(1))
  const context = FakeContext.instances[0]
  stream.stop()
  expect(socket.readyState).toBe(3)
  expect(context.sources[0].stop).toHaveBeenCalledOnce()
  expect(context.close).toHaveBeenCalledOnce()
  socket.receive({ type: 'audio', data: pcm([200]) })
  socket.receive({ type: 'done' })
  context.sources[0].onended?.()
  expect(context.sources).toHaveLength(1)
  expect(finished).not.toHaveBeenCalled()
})

it('ends unavailable speech once without preventing the text caller from finishing', async () => {
  setup()
  const finished = vi.fn()
  const stream = startSpeechStream({}, undefined, finished)
  const socket = FakeSocket.instances[0]
  socket.onerror?.()
  socket.onclose?.()
  stream.finish()
  expect(finished).toHaveBeenCalledOnce()
  expect(FakeContext.instances[0].close).toHaveBeenCalledOnce()
})

it('continues long UTF-8 replies across connections without losing text or overlapping audio', async () => {
  setup()
  const finished = vi.fn()
  const stream = startSpeechStream({}, undefined, finished)
  const text = '疼'.repeat(400) + '。'
  stream.push(text)
  stream.finish()
  const first = FakeSocket.instances[0]
  first.ready()
  const firstText = first.sent.filter((item) => item.type === 'append').map((item) => item.text).join('')
  expect(Buffer.byteLength(firstText)).toBeLessThanOrEqual(1024)
  expect(first.sent.at(-1)).toEqual({ type: 'finish' })
  first.receive({ type: 'audio', data: pcm([100, 100]) })
  first.receive({ type: 'done' })
  expect(FakeSocket.instances).toHaveLength(2)
  const second = FakeSocket.instances[1]
  second.ready()
  const secondText = second.sent.filter((item) => item.type === 'append').map((item) => item.text).join('')
  expect(firstText + secondText).toBe(text)
  expect(second.sent.at(-1)).toEqual({ type: 'finish' })
  second.receive({ type: 'audio', data: pcm([-100, -100]) })
  second.receive({ type: 'done' })
  await vi.waitFor(() => expect(FakeContext.instances[0].sources).toHaveLength(2))
  const sources = FakeContext.instances[0].sources
  expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(sources[0].start.mock.calls[0][0] + 2 / 24000, 8)
  sources[0].onended?.()
  expect(finished).not.toHaveBeenCalled()
  sources[1].onended?.()
  expect(finished).toHaveBeenCalledOnce()
})