import { useEffect, useRef, useState } from 'react'
import { Maximize2, X } from 'lucide-react'
import './appearanceLearning.css'

export const CASE_APPEARANCE = {
  src: '/four-exam-images/tongue-patient-portrait.png',
  alt: '王旭：眉头微蹙、面露不适的卡通患者',
  width: 960,
  height: 720,
} as const

function AppearanceImage({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return <dialog ref={dialogRef} className="appearance-image-dialog" aria-labelledby="appearance-image-title" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose() }} onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onClose() }}>
    <header><h3 id="appearance-image-title">患者状态</h3><button type="button" aria-label="关闭望诊大图" onClick={onClose}><X size={21} /></button></header>
    <figure><img src={CASE_APPEARANCE.src} alt={CASE_APPEARANCE.alt} width={CASE_APPEARANCE.width} height={CASE_APPEARANCE.height} /></figure>
  </dialog>
}

export function AppearanceLearning() {
  const [zoomed, setZoomed] = useState(false)
  return <section className="appearance-learning" aria-labelledby="appearance-learning-title">
    <header><h3 id="appearance-learning-title">望诊图谱</h3></header>
    <div className="appearance-learning-cards"><button type="button" aria-label="放大查看患者状态" aria-haspopup="dialog" onClick={() => setZoomed(true)}><img src={CASE_APPEARANCE.src} alt={CASE_APPEARANCE.alt} width={CASE_APPEARANCE.width} height={CASE_APPEARANCE.height} loading="lazy" /><span><strong>患者状态</strong><Maximize2 size={15} aria-hidden="true" /></span></button></div>
    {zoomed && <AppearanceImage onClose={() => setZoomed(false)} />}
  </section>
}
