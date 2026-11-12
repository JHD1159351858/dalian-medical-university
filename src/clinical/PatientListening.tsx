import { useEffect, useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'
import { playCachedSpeech, preloadSpeech, stopSpeech } from '../diagnosis/speech'
import { PATIENT_VOICE_PROFILE } from '../diagnosis/voiceProfiles'

const samples = [
  { text: '医生，我这儿疼。就是肚子左上边，您帮我看看吧。', speed: 0.94 },
  { text: '嗯，您问吧。我听着呢，知道的我就跟您说。', speed: 0.96 },
  { text: '好，我听明白了。您接着问，我跟您说。', speed: 0.98 },
]
type ListeningSample = (typeof samples)[number]
let lastPlayedSample: ListeningSample | undefined

export function nextListeningSample(previous?: ListeningSample) {
  const previousIndex = previous ? samples.indexOf(previous) : -1
  return samples[(previousIndex + 1) % samples.length]
}

export function PatientListening({ muted, onStopReading }: { muted: boolean; onStopReading: () => void }) {
  const playbackRun = useRef(0)
  const ownsPlayback = useRef(false)
  const [playback, setPlayback] = useState<'idle' | 'loading' | 'coze' | 'device' | 'error'>('idle')
  const active = playback === 'loading' || playback === 'coze' || playback === 'device'

  useEffect(() => {
    if (muted) setPlayback('idle')
    return () => {
      playbackRun.current += 1
      if (ownsPlayback.current) {
        ownsPlayback.current = false
        stopSpeech()
      }
    }
  }, [muted])

  const playVoice = async () => {
    const run = ++playbackRun.current
    if (active) {
      if (ownsPlayback.current) {
        ownsPlayback.current = false
        stopSpeech()
      }
      setPlayback('idle')
      return
    }

    const sample = nextListeningSample(lastPlayedSample)
    const options = { ...PATIENT_VOICE_PROFILE, speed: sample.speed }
    setPlayback('loading')
    const ready = await preloadSpeech(sample.text, options)
    if (run !== playbackRun.current) return

    const finish = (failed = false) => {
      if (run !== playbackRun.current) return
      ownsPlayback.current = false
      setPlayback(failed ? 'error' : 'idle')
    }

    onStopReading()
    if (ready) {
      ownsPlayback.current = true
      setPlayback('coze')
      if (playCachedSpeech(sample.text, options, finish)) {
        lastPlayedSample = sample
        return
      }
      ownsPlayback.current = false
    }

    const synthesis = window.speechSynthesis
    const voice = synthesis?.getVoices().find((item) => /^zh(-|_)/i.test(item.lang) || item.lang.toLowerCase() === 'zh')
    if (!voice || !('SpeechSynthesisUtterance' in window)) {
      finish(true)
      return
    }
    const utterance = new SpeechSynthesisUtterance(sample.text)
    utterance.lang = voice.lang
    utterance.voice = voice
    utterance.rate = sample.speed
    utterance.onend = () => finish()
    utterance.onerror = () => finish(true)
    ownsPlayback.current = true
    setPlayback('device')
    try {
      synthesis.speak(utterance)
      lastPlayedSample = sample
    } catch {
      finish(true)
    }
  }

  return <div className="four-examination-audio">
    <div>
      <strong>患者语声观察</strong>
      <p>请听患者说话，留意声音大小、语速和语调，听完后返回记录。</p>
      <small>合成练习语音会轮换门诊口语片段，用于练习描述听到的特征。教师录音和本病例闻诊结论待补充。</small>
    </div>
    <button type="button" disabled={muted} onClick={() => void playVoice()}>
      {active ? <Square size={18} /> : <Play size={18} />}
      {playback === 'loading' ? '取消准备' : active ? '停止播放' : '播放患者声音'}
    </button>
    {muted && <small>当前已静音，请关闭窗口后在顶栏开启语音。</small>}
    {playback === 'loading' && <small role="status">正在准备语音…</small>}
    {playback === 'coze' && <small role="status">正在播放患者合成音色。</small>}
    {playback === 'device' && <small role="status">正在使用设备的中文语音。</small>}
    {playback === 'error' && <small role="alert">语音暂不可用，请稍后重试。</small>}
  </div>
}
