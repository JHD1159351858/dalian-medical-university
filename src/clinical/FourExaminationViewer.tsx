import { useEffect, useRef, useState } from 'react'
import { Play, Square, X } from 'lucide-react'
import { playCachedSpeech, preloadSpeech, stopSpeech } from '../diagnosis/speech'
import { PATIENT_VOICE_PROFILE } from '../diagnosis/voiceProfiles'
import { TongueTeaching, PulseTeaching } from './ExaminationTeaching'
import './fourDiagnosisTeaching.css'

export type FourExaminationKind = 'look' | 'listen' | 'feel'

export const fourExaminations = {
  look: { button: '查看舌苔', title: '望诊观察与舌象学习' },
  listen: { button: '听取声音', title: '闻诊观察' },
  feel: { button: '查看脉象', title: '脉诊教学与检查' },
}

const inspectionTopics = [
  { id: 'tongue', label: '舌象' },
  { id: 'sclera', label: '巩膜黄染' },
  { id: 'face-red', label: '面色红' },
  { id: 'yang-yellow', label: '皮肤黄染 · 阳黄' },
  { id: 'yin-yellow', label: '皮肤黄染 · 阴黄' },
]

const listeningTopics = [
  { id: 'loud', label: '声音洪亮', detail: '声音洪亮的教师标准录音尚未提供，当前患者语音不能替代该样本。' },
  { id: 'low', label: '声音低沉', detail: '声音低沉的教师标准录音尚未提供，当前患者语音不能替代该样本。' },
  { id: 'odor', label: '口臭', detail: '口臭需在检查后以文字反馈呈现；王旭病例是否存在口臭，待教师确认。' },
]

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
  const [inspectionTopic, setInspectionTopic] = useState('tongue')
  const [listeningTopic, setListeningTopic] = useState('loud')
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

  return <dialog ref={dialogRef} className={`four-examination-dialog four-teaching-dialog ${kind === 'look' || kind === 'feel' ? 'four-realistic-dialog' : ''}`} aria-labelledby="four-examination-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <header><div><span>检查交互 · 教学资料</span><h2 id="four-examination-title">{item.title}</h2></div><button type="button" aria-label="关闭检查展示" onClick={onClose}><X size={22} /></button></header>
    <div className="four-examination-content">
      {kind === 'look' && <>
        <nav className="four-material-topics" aria-label="望诊素材分类">{inspectionTopics.map((topic) => <button key={topic.id} type="button" aria-pressed={inspectionTopic === topic.id} onClick={() => setInspectionTopic(topic.id)}>{topic.label}</button>)}</nav>
        {inspectionTopic === 'tongue' ? <>
          <TongueTeaching />
        </> : <div className="four-case-pending" role="status"><strong>{inspectionTopics.find((topic) => topic.id === inspectionTopic)!.label} · 待补充</strong><p>待教师提供对应图片及观察要点；王旭病例是否存在这一表现也尚未确认。</p><small>这是学习素材分类，不代表当前患者有该表现。</small></div>}
      </>}
      {kind === 'feel' && <>
        <PulseTeaching />
        <p className="four-realistic-case-note">王旭病例脉象待教师确认，当前练习用于学习布指手法，不提供病例脉象结论。</p>
      </>}
      {kind === 'listen' && <>
        <nav className="four-material-topics" aria-label="闻诊素材分类">{listeningTopics.map((topic) => <button key={topic.id} type="button" aria-pressed={listeningTopic === topic.id} onClick={() => setListeningTopic(topic.id)}>{topic.label}</button>)}</nav>
        <div className="four-case-pending" role="status"><strong>{listeningTopics.find((topic) => topic.id === listeningTopic)!.label} · 待补充</strong><p>{listeningTopics.find((topic) => topic.id === listeningTopic)!.detail}</p></div>
        <div className="four-examination-audio"><div><strong>患者最近回答 · 合成播放</strong><p>{voiceText}</p><small>用于回听问答，不是教师标准声音样本；不能据此自动认定本病例语声类型。</small></div><button type="button" disabled={muted || playback === 'loading'} onClick={() => void playVoice()}>{playback === 'playing' ? <Square size={18} /> : <Play size={18} />}{playback === 'loading' ? '准备语音…' : playback === 'playing' ? '停止播放' : '播放患者声音'}</button>{muted && <small>当前已静音，请关闭窗口后在顶栏开启语音。</small>}{playback === 'error' && <small role="alert">语音暂不可用，请稍后重试。</small>}</div>
      </>}
    </div>
    <footer><button type="button" onClick={onClose}>返回检查并记录</button></footer>
  </dialog>
}
