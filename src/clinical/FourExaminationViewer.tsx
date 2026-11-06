import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { PatientListening } from './PatientListening'
import { TongueTeaching, PulseTeaching } from './ExaminationTeaching'
import './fourDiagnosisTeaching.css'

export type FourExaminationKind = 'look' | 'listen' | 'ask' | 'feel'

export const fourExaminations = {
  look: { button: '查看舌苔', title: '望诊观察与舌象学习', recordLabel: '望诊观察记录', prompt: '观察固定舌象配图后，你看到了哪些舌色、舌形和舌苔特征？' },
  listen: { button: '听取声音', title: '闻诊观察', recordLabel: '闻诊观察记录', prompt: '听完患者语音后，你听到的音量、语速和语调有什么特点？' },
  ask: { button: '打开问诊对话', title: '四诊问诊', recordLabel: '问诊要点记录', prompt: '患者对你的追问作出了哪些回答？请整理与病情有关的要点。' },
  feel: { button: '查看脉象', title: '脉诊教学与检查', recordLabel: '切诊观察记录', prompt: '你如何定位寸、关、尺？完成布指后，病例记录显示怎样的脉象？' },
}

const inspectionTopics = [
  { id: 'tongue', label: '舌象' },
  { id: 'sclera', label: '巩膜黄染' },
  { id: 'face-red', label: '面色红' },
  { id: 'yang-yellow', label: '皮肤黄染 · 阳黄' },
  { id: 'yin-yellow', label: '皮肤黄染 · 阴黄' },
]

export function FourExaminationViewer({ kind, muted, record, onRecordChange, interview, onStopReading, onClose }: {
  kind: FourExaminationKind
  muted: boolean
  record: string
  onRecordChange: (value: string) => void
  interview?: ReactNode
  onStopReading: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [inspectionTopic, setInspectionTopic] = useState('tongue')
  const item = fourExaminations[kind]

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return <dialog ref={dialogRef} className={`four-examination-dialog four-teaching-dialog ${kind === 'look' || kind === 'feel' ? 'four-realistic-dialog' : ''}`} aria-labelledby="four-examination-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <header><div><span>{kind === 'ask' ? '同一病例 · 患者问答' : '检查交互 · 教学资料'}</span><h2 id="four-examination-title">{item.title}</h2></div><button type="button" aria-label="关闭检查展示" onClick={onClose}><X size={22} /></button></header>
    <div className="four-examination-content">
      {kind === 'look' && <>
        <nav className="four-material-topics" aria-label="望诊素材分类">{inspectionTopics.map((topic) => <button key={topic.id} type="button" aria-pressed={inspectionTopic === topic.id} onClick={() => setInspectionTopic(topic.id)}>{topic.label}</button>)}</nav>
        <div hidden={inspectionTopic !== 'tongue'}><TongueTeaching /></div>
        {inspectionTopic !== 'tongue' && <div className="four-case-pending" role="status"><strong>{inspectionTopics.find((topic) => topic.id === inspectionTopic)!.label} · 待补充</strong><p>待教师提供对应图片及观察要点；王旭病例是否存在这一表现也尚未确认。</p><small>这是学习素材分类，不代表当前患者有该表现。</small></div>}
      </>}
      {kind === 'feel' && <>
        <PulseTeaching />
        <p className="four-realistic-case-note">正确完成布指练习后，可查看王旭原病例记录的脉象。</p>
      </>}
      {kind === 'listen' && <PatientListening muted={muted} onStopReading={onStopReading} />}
      {kind === 'ask' && interview}
      <div className="four-dialog-record">
        <label htmlFor="four-dialog-record">{item.recordLabel}</label>
        <p id="four-dialog-record-prompt">{item.prompt}</p>
        <textarea id="four-dialog-record" aria-describedby="four-dialog-record-prompt" rows={3} value={record} onChange={(event) => onRecordChange(event.target.value)} />
      </div>
    </div>
    <footer><button type="button" onClick={onClose}>返回检查并记录</button></footer>
  </dialog>
}
