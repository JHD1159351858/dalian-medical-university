import { useEffect, useRef, useState } from 'react'
import { Play, Square, X } from 'lucide-react'
import { playCachedSpeech, preloadSpeech, stopSpeech } from '../diagnosis/speech'
import { PATIENT_VOICE_PROFILE } from '../diagnosis/voiceProfiles'

export type FourExaminationKind = 'look' | 'listen' | 'feel'

export const fourExaminations = {
  look: { button: '查看舌苔', title: '舌象观察', image: 'tongue-demo.png', alt: '舌体与舌苔教学示意图', hint: '放大观察舌体与舌苔的外观，再在望诊记录中填写所见。' },
  listen: { button: '听取声音', title: '声音观察', image: 'sound-demo.png', alt: '患者语声与呼吸观察教学示意图', hint: '点击播放患者语音，听取语声表现，再在闻诊记录中填写所见。' },
  feel: { button: '查看脉象', title: '脉象观察', image: 'pulse-demo.png', alt: '手腕切脉位置教学示意图', hint: '查看脉象检查结果，再在切诊记录中填写检查所见。' },
}

export function FourExaminationViewer({ kind, voiceText, muted, onStopReading, onClose }: {
  kind: FourExaminationKind
  voiceText: string
  muted: boolean
  onStopReading: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const playbackRun = useRef(0)
  const ownsPlayback = useRef(false)
  const [playback, setPlayback] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const item = fourExaminations[kind]

  useEffect(() => {
    dialogRef.current?.showModal()
    return () => {
      playbackRun.current += 1
      if (ownsPlayback.current) stopSpeech()
    }
  }, [])

  const playVoice = async () => {
    if (playback === 'playing') {
      stopSpeech()
      ownsPlayback.current = false
      setPlayback('idle')
      return
    }
    const run = ++playbackRun.current
    setPlayback('loading')
    const ready = await preloadSpeech(voiceText, PATIENT_VOICE_PROFILE)
    if (run !== playbackRun.current) return
    if (!ready) {
      setPlayback('error')
      return
    }
    onStopReading()
    ownsPlayback.current = true
    setPlayback('playing')
    playCachedSpeech(voiceText, PATIENT_VOICE_PROFILE, () => {
      ownsPlayback.current = false
      setPlayback('idle')
    })
  }

  return <dialog ref={dialogRef} className="four-examination-dialog" aria-labelledby="four-examination-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <header><div><span>{kind === 'feel' ? '教学模拟' : '教学示意'}</span><h2 id="four-examination-title">{item.title}</h2></div><button type="button" aria-label="关闭检查展示" onClick={onClose}><X size={22} /></button></header>
    <div className="four-examination-content">
      <img src={`/four-exam-images/${item.image}`} alt={item.alt} />
      {kind === 'feel' && <section className="four-pulse-result" aria-label="脉象检查结果"><span>脉象检查结果</span><strong>沉滑数</strong><small>本训练设置的教学模拟结果。</small></section>}
      <p>{item.hint}</p>
      {kind === 'listen' ? <div className="four-examination-audio"><div><strong>患者语音 · 合成播放</strong><p>{voiceText}</p></div><button type="button" disabled={muted || playback === 'loading'} onClick={() => void playVoice()}>{playback === 'playing' ? <Square size={18} /> : <Play size={18} />}{playback === 'loading' ? '准备语音…' : playback === 'playing' ? '停止播放' : '播放患者声音'}</button>{muted && <small>当前已静音，请关闭窗口后在顶栏开启语音。</small>}{playback === 'error' && <small role="alert">语音暂不可用，请稍后重试。</small>}</div> : <small>{kind === 'look' ? 'AI 生成的教学示意图，尚未绑定王旭病例的舌象检查结果。' : '图片为 AI 生成的切脉手法示意图。'}</small>}
    </div>
    <footer><button type="button" onClick={onClose}>返回检查并记录</button></footer>
  </dialog>
}
