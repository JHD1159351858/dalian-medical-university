import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { CaseAssessment } from './caseAssessment'
import './caseAssessment.css'

export function CaseAssessmentPanel({ result }: { result: CaseAssessment }) {
  return <section className="case-assessment" aria-label="病例参考总分" aria-live="polite">
    <header><h3>病例参考评分</h3><strong><span>{result.score}</span>/100</strong></header>
    <div className="case-assessment-modules">{result.modules.map((module) => <details key={module.id}>
      <summary><span>{module.label}</span><b>{module.score}/{module.maxScore}</b></summary>
      <ul>{module.checks.map((check) => <li key={check.id} className={check.score === check.maxScore ? 'is-met' : 'needs-review'}><div><strong>{check.label}</strong><span>{check.score}/{check.maxScore}</span></div><p>{check.feedback}</p></li>)}</ul>
    </details>)}</div>
  </section>
}

export function CaseAssessmentDialog({ result, open, onClose }: { result: CaseAssessment; open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (open && !dialog?.open) dialog?.showModal()
    else if (!open && dialog?.open) dialog.close()
  }, [open])
  return <dialog ref={dialogRef} className="case-assessment-dialog" aria-label="病例参考评分" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <button type="button" className="case-assessment-close" aria-label="关闭评分" onClick={onClose}><X size={21} /></button>
    <CaseAssessmentPanel result={result} />
  </dialog>
}
