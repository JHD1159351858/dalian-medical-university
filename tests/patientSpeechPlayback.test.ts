import { afterEach, expect, it, vi } from 'vitest'
import { preloadSpeech, speakChinese, stopSpeech } from '../src/diagnosis/speech'
import { PATIENT_VOICE_PROFILE, selectMandarinVoice } from '../src/diagnosis/voiceProfiles'

function deviceVoice(name: string, lang = 'zh-CN'): SpeechSynthesisVoice {
  return { name, lang, voiceURI: name, default: false, localService: true }
}

afterEach(() => {
  if (typeof window !== 'undefined') stopSpeech()
  vi.unstubAllGlobals()
})

it('prefers the patient’s Mandarin voice and skips Cantonese or unrelated languages', () => {
  const voices = [
    deviceVoice('Xiaoyi Natural', 'zh-HK'), deviceVoice('Xiaoyi Natural'),
    deviceVoice('Kangkang'), deviceVoice('Yunyang Natural'), deviceVoice('Aria Natural', 'en-US'),
  ]
  expect(selectMandarinVoice(voices, PATIENT_VOICE_PROFILE.patientId)).toBe(voices[3])
  expect(selectMandarinVoice(voices, 'lin-yue')).toBe(voices[1])
  expect(selectMandarinVoice([voices[0], voices[4]], 'lin-yue')).toBeUndefined()
})

it.each(['play', 'cancel', 'unavailable'])('shares the in-flight opening preload on %s', async (mode) => {
  let reply!: (response: Response) => void
  const fetchAudio = vi.fn(() => new Promise<Response>(resolve => { reply = resolve }))
  const play = vi.fn(async () => undefined)
  vi.stubGlobal('fetch', fetchAudio)
  vi.stubGlobal('window', { fetch: fetchAudio })
  vi.stubGlobal('Audio', class { play = play; pause() {} })
  const text = '这一句用来验证首次开口。' + mode
  const finish = vi.fn()
  const ready = preloadSpeech(text, { ...PATIENT_VOICE_PROFILE, emotion: 'neutral' })
  expect(speakChinese(text, finish, 'neutral', PATIENT_VOICE_PROFILE)).toBe(true)
  expect(fetchAudio).toHaveBeenCalledOnce()
  if (mode === 'cancel') stopSpeech()
  reply(new Response(new Blob(['audio']), { status: mode === 'unavailable' ? 503 : 200 }))
  await ready
  await Promise.resolve()
  if (mode === 'play') expect(play).toHaveBeenCalledOnce()
  else expect(play).not.toHaveBeenCalled()
  expect(finish).toHaveBeenCalledTimes(mode === 'unavailable' ? 1 : 0)
})
