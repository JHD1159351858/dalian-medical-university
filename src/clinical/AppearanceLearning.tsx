import { useEffect, useRef, useState } from 'react'
import { Maximize2, X } from 'lucide-react'
import { useTrainingCase } from '../cases/selectedCase'
import { PatientPortrait } from '../exam/ExamScene'
import { CASE_APPEARANCE } from './caseData'
import './appearanceLearning.css'

function AppearancePortrait() {
  const patient = useTrainingCase()
  return patient.id === 'wang-xu'
    ? <img src={CASE_APPEARANCE.src} alt={CASE_APPEARANCE.alt} width={CASE_APPEARANCE.width} height={CASE_APPEARANCE.height} />
    : <div className="appearance-case-portrait" role="img" aria-label={`${patient.name}的患者状态`}><PatientPortrait /></div>
}

function AppearanceImage({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return <dialog ref={dialogRef} className="appearance-image-dialog" aria-labelledby="appearance-image-title" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose() }} onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onClose() }}>
    <header><h3 id="appearance-image-title">患者状态</h3><button type="button" aria-label="关闭望诊大图" onClick={onClose}><X size={21} /></button></header>
    <figure><AppearancePortrait /></figure>
  </dialog>
}

export function AppearanceLearning({ finding }: { finding?: string } = {}) {
  const [zoomed, setZoomed] = useState(false)
  return <section className="appearance-learning" aria-labelledby="appearance-learning-title">
    <header><h3 id="appearance-learning-title">望诊图谱</h3></header>
    <div className="appearance-learning-cards"><button type="button" aria-label="放大查看患者状态" aria-haspopup="dialog" onClick={() => setZoomed(true)}><AppearancePortrait /><span><strong>患者状态</strong><Maximize2 size={15} aria-hidden="true" /></span></button></div>
    {finding && <details><summary>查看望诊所见</summary><p>{finding}</p></details>}
    {zoomed && <AppearanceImage onClose={() => setZoomed(false)} />}
  </section>
}
