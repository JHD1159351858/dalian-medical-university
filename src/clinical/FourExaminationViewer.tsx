import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { PatientListening } from './PatientListening'
import { TongueTeaching, PulseTeaching } from './ExaminationTeaching'
import './fourDiagnosisTeaching.css'

export type FourExaminationKind = 'look' | 'listen' | 'ask' | 'feel'

export const fourExaminations = {
  look: { button: '查看舌苔', title: '望诊观察与舌象学习', recordLabel: '望诊观察记录', prompt: '观察固定舌象配图后，你看到了哪些舌色、舌形和舌苔特征？' },
  listen: { button: '听取声音', title: '闻诊观察', recordLabel: '闻诊观察记录', prompt: '听完患者语音后，你听到的音量、语速和语调有什么特点？' },
  ask: { button: '打开问诊对话', title: '四诊问诊', recordLabel: '问诊要点记录', prompt: '患者对你的追问作出了哪些回答？请整理与病情有关的要点。' },
  feel: { button: '查看脉象', title: '脉诊教学与检查', recordLabel: '切诊观察记录', prompt: '轻取、深取时分别感到什么？请结合触诊线索判断脉象。' },
}

export function FourExaminationViewer({ kind, muted, record, onRecordChange, interview, onStopReading, onClose, caseId }: {
  kind: FourExaminationKind
  muted: boolean
  record: string
  onRecordChange: (value: string) => void
  interview?: ReactNode
  onStopReading: () => void
  onClose: () => void
  caseId?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const item = fourExaminations[kind]

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return <dialog ref={dialogRef} className={`four-examination-dialog four-teaching-dialog ${kind === 'look' || kind === 'feel' ? 'four-realistic-dialog' : ''}`} aria-labelledby="four-examination-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <header><div><span>{kind === 'ask' ? '同一病例 · 患者问答' : '检查交互 · 教学资料'}</span><h2 id="four-examination-title">{item.title}</h2></div><button type="button" aria-label="关闭检查展示" onClick={onClose}><X size={22} /></button></header>
    <div className="four-examination-content">
      {kind === 'look' && <TongueTeaching />}
      {kind === 'feel' && <>
        <PulseTeaching caseId={caseId} />
        <p className="four-realistic-case-note">在各部位轻取、深取，完成判断后再核对病例参考。</p>
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
