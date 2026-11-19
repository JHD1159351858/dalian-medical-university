import { useEffect, useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'
import { playCachedSpeech, preloadSpeech, speakWithDeviceVoice, stopSpeech } from '../diagnosis/speech'
import { useTrainingCase } from '../cases/selectedCase'
import { getPatientVoiceProfile } from '../diagnosis/voiceProfiles'

const wangListeningOpening = '医生，我这儿疼。就是肚子左上边，您帮我看看吧。'
type ListeningSample = { text: string; speed: number }
const lastPlayedByPatient = new Map<string, ListeningSample>()

export function nextListeningSample(previous?: ListeningSample, opening = wangListeningOpening, speed = 0.94) {
  const phrases = [opening, '嗯，您问吧。我听着呢，知道的我就跟您说。', '好，我听明白了。您接着问，我跟您说。']
  const index = (phrases.indexOf(previous?.text ?? '') + 1) % phrases.length
  return { text: phrases[index], speed: Number((speed + 0.02 * index).toFixed(2)) }
}

export function PatientListening({ muted, onStopReading }: { muted: boolean; onStopReading: () => void }) {
  const patient = useTrainingCase()
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

    const profile = getPatientVoiceProfile(patient)
    const sample = nextListeningSample(lastPlayedByPatient.get(patient.id), patient.id === 'wang-xu' ? undefined : patient.opening, profile.speed)
    const options = { ...profile, speed: sample.speed }
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
        lastPlayedByPatient.set(patient.id, sample)
        return
      }
      ownsPlayback.current = false
    }

    ownsPlayback.current = true
    setPlayback('device')
    if (speakWithDeviceVoice(sample.text, options, finish, () => finish(true))) {
      lastPlayedByPatient.set(patient.id, sample)
    } else {
      finish(true)
    }
  }

  return <div className="four-examination-audio">
    <div>
      <strong>患者语声观察</strong>
      <p>请听患者说话，留意声音大小、语速和语调，听完后返回记录。</p>
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
