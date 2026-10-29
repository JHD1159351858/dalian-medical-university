import type { PatientVoiceProfile } from './voiceProfiles'

export type SpeechEmotion = 'happy' | 'sad' | 'angry' | 'surprised' | 'fear' | 'neutral'

let activeAudio: HTMLAudioElement | null = null
let activeAudioCompletion: (() => void) | null = null
let activeBrowserCompletion: (() => void) | null = null
let activeUrl = ''
let activeRequest: AbortController | null = null
let speechRun = 0
let activeStreamCleanup: (() => void) | null = null
const audioCache = new Map<string, Blob>()
const pendingPreloads = new Map<string, Promise<boolean>>()

export type SpeechOptions = Pick<PatientVoiceProfile, 'patientId' | 'voiceId' | 'speed'> & { emotion?: SpeechEmotion }

export interface SpeechStreamController {
  push(text: string): void
  finish(): void
  stop(): void
}

function optionsWithDefaults(options: Partial<SpeechOptions> = {}): SpeechOptions {
  return {
    patientId: options.patientId ?? 'default-patient',
    voiceId: options.voiceId ?? '',
    speed: options.speed ?? 0.95,
    emotion: options.emotion ?? 'neutral',
  }
}

function cacheKey(text: string, options: Partial<SpeechOptions>): string {
  return JSON.stringify([text.trim(), optionsWithDefaults(options)])
}

async function requestAudio(text: string, options: Partial<SpeechOptions>, signal?: AbortSignal): Promise<Blob> {
  const request = optionsWithDefaults(options)
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, emotion: request.emotion, patientId: request.patientId, voiceId: request.voiceId || undefined, speed: request.speed }),
    signal,
  })
  if (!response.ok) throw new Error('tts unavailable')
  return response.blob()
}

export function stopSpeech(): void {
  speechRun += 1
  activeStreamCleanup?.()
  activeRequest?.abort()
  activeRequest = null
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.src = ''
  }
  activeAudioCompletion?.()
  activeAudio = null
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl)
    activeUrl = ''
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  activeBrowserCompletion?.()
}

/**
 * Sends incoming answer text to Coze's bidirectional TTS connection and
 * schedules the returned PCM fragments in order, independently of the log.
 */
export function startSpeechStream(
  options: Partial<SpeechOptions> = {},
  onStart?: () => void,
  onFinish?: () => void,
): SpeechStreamController {
  if (typeof window === 'undefined') return { push: () => undefined, finish: () => undefined, stop: () => undefined }

  stopSpeech()
  const run = speechRun
  const voiceOptions = optionsWithDefaults(options)
  const Context = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  let context: AudioContext
  try {
    context = new Context({ sampleRate: 24000 })
  } catch {
    queueMicrotask(() => { if (run === speechRun) onFinish?.() })
    return { push: () => undefined, finish: () => undefined, stop: () => undefined }
  }

  const sources = new Set<AudioBufferSourceNode>()
  let socket: WebSocket | null = null
  let pendingText = ''
  let inputFinished = false
  let synthesisFinished = false
  let closed = false
  let ready = false
  let sessionFinishing = false
  let sentBytes = 0
  let queuedAudio = 0
  let sampleRate = 24000
  let nextStart = 0
  let trailingByte: number | null = null
  let started = false
  const encoder = new TextEncoder()

  const dispose = () => {
    closed = true
    const connection = socket
    socket = null
    connection?.close()
    for (const source of sources) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    sources.clear()
    void context.close().catch(() => undefined)
    if (activeStreamCleanup === dispose) activeStreamCleanup = null
  }
  activeStreamCleanup = dispose

  const complete = () => {
    if (closed || run !== speechRun || !synthesisFinished || sources.size || queuedAudio) return
    dispose()
    onFinish?.()
  }
  const fail = () => {
    if (closed || run !== speechRun) return
    dispose()
    onFinish?.()
  }
  const playbackReady = context.resume()
  void playbackReady.catch(fail)

  const playPcm = (data: string) => {
    const decoded = atob(data)
    const bytes = new Uint8Array(decoded.length + (trailingByte === null ? 0 : 1))
    let offset = 0
    if (trailingByte !== null) bytes[offset++] = trailingByte
    for (let i = 0; i < decoded.length; i++) bytes[offset + i] = decoded.charCodeAt(i)
    trailingByte = bytes.length % 2 ? bytes[bytes.length - 1] : null
    const length = Math.floor(bytes.length / 2)
    if (!length) return
    const buffer = context.createBuffer(1, length, sampleRate)
    const samples = buffer.getChannelData(0)
    const view = new DataView(bytes.buffer)
    for (let i = 0; i < length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
    queuedAudio += 1
    void playbackReady.then(() => {
      if (closed || run !== speechRun) return
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      sources.add(source)
      source.onended = () => {
        sources.delete(source)
        source.disconnect()
        complete()
      }
      const startAt = Math.max(nextStart, context.currentTime + 0.06)
      source.start(startAt)
      nextStart = startAt + buffer.duration
      if (!started) {
        started = true
        onStart?.()
      }
    }).catch(fail).finally(() => {
      queuedAudio -= 1
      complete()
    })
  }

  const flushInput = () => {
    if (!ready || !socket || sessionFinishing || closed) return
    // The API's 1024-byte limit is conservatively applied per connection.
    let length = 0
    let bytes = 0
    for (const character of pendingText) {
      const size = encoder.encode(character).length
      if (sentBytes + bytes + size > 1024) break
      bytes += size
      length += character.length
    }
    if (length) {
      socket.send(JSON.stringify({ type: 'append', text: pendingText.slice(0, length) }))
      pendingText = pendingText.slice(length)
      sentBytes += bytes
    }
    if (pendingText || inputFinished) {
      if (!sentBytes) {
        const connection = socket
        socket = null
        connection.close()
        synthesisFinished = true
        complete()
        return
      }
      sessionFinishing = true
      socket.send(JSON.stringify({ type: 'finish' }))
    }
  }

  const connect = () => {
    if (closed || socket) return
    ready = false
    sessionFinishing = false
    sentBytes = 0
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const connection = new WebSocket(protocol + '//' + window.location.host + '/api/speech-stream')
    socket = connection
    connection.onopen = () => {
      if (closed || socket !== connection) return
      connection.send(JSON.stringify({ type: 'start', voiceId: voiceOptions.voiceId || undefined, speed: voiceOptions.speed, emotion: voiceOptions.emotion }))
    }
    connection.onmessage = (event) => {
      if (closed || socket !== connection || run !== speechRun) return
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'ready') {
          sampleRate = message.sampleRate
          ready = true
          flushInput()
        } else if (message.type === 'audio') {
          playPcm(message.data)
        } else if (message.type === 'done') {
          socket = null
          connection.close()
          trailingByte = null
          if (pendingText) connect()
          else if (inputFinished) {
            synthesisFinished = true
            complete()
          }
        } else if (message.type === 'error') fail()
      } catch {
        fail()
      }
    }
    connection.onerror = fail
    connection.onclose = () => { if (!closed && socket === connection) fail() }
  }

  try { connect() } catch { queueMicrotask(fail) }
  return {
    push(text) {
      if (closed || inputFinished || run !== speechRun) return
      pendingText += text
      try { if (!socket) connect(); flushInput() } catch { fail() }
    },
    finish() {
      if (closed || inputFinished || run !== speechRun) return
      inputFinished = true
      if (!socket && !pendingText) {
        synthesisFinished = true
        complete()
      } else {
        try { flushInput() } catch { fail() }
      }
    },
    stop() { if (!closed && run === speechRun) stopSpeech() },
  }
}

export function emotionForSpeech(text: string): SpeechEmotion {
  if (/剧烈|很疼|明显疼|痛苦|难受/.test(text)) return 'sad'
  if (/害怕|喘不上气|呼吸困难/.test(text)) return 'fear'
  if (/谢谢|好多了|舒服/.test(text)) return 'happy'
  if (/怎么会|真的吗|没想到/.test(text)) return 'surprised'
  return 'neutral'
}

export function preloadSpeech(text: string, options: Partial<SpeechOptions> = {}): Promise<boolean> {
  if (typeof window === 'undefined' || !window.fetch || !text.trim()) return Promise.resolve(false)
  const key = cacheKey(text, options)
  if (audioCache.has(key)) return Promise.resolve(true)
  const pending = pendingPreloads.get(key)
  if (pending) return pending
  const request = requestAudio(text, options).then((blob) => {
    audioCache.set(key, blob)
    return true
  }).catch(() => false).finally(() => {
    pendingPreloads.delete(key)
  })
  pendingPreloads.set(key, request)
  return request
}

export function playCachedSpeech(text: string, options: Partial<SpeechOptions> = {}, onEnd?: () => void): boolean {
  if (typeof window === 'undefined') return false
  const blob = audioCache.get(cacheKey(text, options))
  if (!blob || typeof Audio === 'undefined') return false
  stopSpeech()
  const run = speechRun
  activeUrl = URL.createObjectURL(blob)
  const audio = new Audio(activeUrl)
  activeAudio = audio
  let finished = false
  const finish = () => {
    if (finished || run !== speechRun) return
    finished = true
    onEnd?.()
  }
  audio.onended = finish
  audio.onerror = finish
  void audio.play().catch(finish)
  return true
}

function speakWithBrowser(text: string, onEnd?: () => void): boolean {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 0.94
  const voices = window.speechSynthesis.getVoices()
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith('zh')) ?? null
  if (onEnd) {
    let finished = false
    let fallbackTimer = 0
    const finish = () => {
      if (finished) return
      finished = true
      if (activeBrowserCompletion === finish) activeBrowserCompletion = null
      window.clearTimeout(fallbackTimer)
      onEnd()
    }
    utterance.onend = finish
    utterance.onerror = finish
    fallbackTimer = window.setTimeout(finish, Math.max(2500, Math.min(12000, text.length * 320)))
    activeBrowserCompletion = finish
  }
  try {
    window.speechSynthesis.speak(utterance)
  } catch {
    if (onEnd) {
      utterance.onerror?.(new Event('error') as SpeechSynthesisErrorEvent)
    }
    return false
  }
  return true
}

export function speakChinese(text: string, onEnd?: () => void, emotion = emotionForSpeech(text), voice?: Partial<PatientVoiceProfile>): boolean {
  if (typeof window === 'undefined') return false
  stopSpeech()
  const voiceOptions = { ...voice, emotion }
  if (audioCache.has(cacheKey(text, voiceOptions)) && playCachedSpeech(text, voiceOptions, onEnd)) return true
  const run = speechRun
  let finished = false
  const finish = () => {
    if (finished || run !== speechRun) return
    finished = true
    onEnd?.()
  }
  const fallback = () => {
    if (run !== speechRun) return
    speakWithBrowser(text, finish)
  }

  if (!window.fetch || typeof Audio === 'undefined') return speakWithBrowser(text, onEnd)
  const controller = new AbortController()
  activeRequest = controller
  requestAudio(text, voiceOptions, controller.signal).then((blob) => {
    if (run !== speechRun) return
    activeUrl = URL.createObjectURL(blob)
    const audio = new Audio(activeUrl)
    activeAudio = audio
    audio.onended = finish
    audio.onerror = fallback
    return audio.play().catch(fallback)
  }).catch(fallback)
  return true
}
