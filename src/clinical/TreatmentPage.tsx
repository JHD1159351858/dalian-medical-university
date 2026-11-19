import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ClipboardList, FileCheck2, Pill, Plus, Stethoscope, Trash2 } from 'lucide-react'
import { useTrainingCase } from '../cases/selectedCase'
import { PatientPortrait } from '../exam/ExamScene'
import { clinicalModules, type ClinicalModuleId } from './caseData'
import type { MedicationRow, TreatmentPlan, TreatmentRow } from './treatmentPlan'
import { requestTreatmentEvaluation, type TreatmentEvaluation } from './treatmentEvaluation'
import { useEncounterRecords } from '../records/EncounterRecordsProvider'
import { requestCaseAssessment, type CaseAssessment } from './caseAssessment'
import { CaseAssessmentDialog } from './CaseAssessmentPanel'
import './treatmentEvaluation.css'

export interface TreatmentPageProps {
  plan: TreatmentPlan
  diagnosis?: Record<string, string>
  onPlanChange: (plan: TreatmentPlan) => void
  onBack: () => void
  onFinish: () => void
  onNavigate: (module: ClinicalModuleId) => void
}

export function TreatmentPage({ plan, diagnosis = {}, onPlanChange, onBack, onFinish, onNavigate }: TreatmentPageProps) {
  const patient = useTrainingCase()
  const { recordSubmission, getAssessmentSnapshot } = useEncounterRecords()
  const treatmentTableRef = useRef<HTMLDivElement>(null)
  const medicationTableRef = useRef<HTMLDivElement>(null)
  const pendingRowRef = useRef<{ kind: 'treatments' | 'medications'; id: string } | null>(null)
  const completedTreatments = plan.treatments.filter((row) => row.category.trim() && row.item.trim()).length
  const completedMedications = plan.medications.filter((row) => row.name.trim() && row.route.trim() && row.dose.trim()).length
  const completed = completedTreatments + completedMedications
  const total = plan.treatments.length + plan.medications.length
  const signature = JSON.stringify({ caseId: patient.id, plan, diagnosis })
  const activeSignature = useRef(signature)
  activeSignature.current = signature
  const assessmentRequest = useRef<{ controller: AbortController; kind: 'evaluation' | 'finish' } | null>(null)
  const evaluationPanel = useRef<HTMLElement>(null)
  const [assessmentOpen, setAssessmentOpen] = useState<'preview' | 'finish' | null>(null)
  const [evaluation, setEvaluation] = useState<{ signature: string; result: TreatmentEvaluation } | null>(null)
  const [pendingRequest, setPendingRequest] = useState<'evaluation' | 'finish' | null>(null)
  const [evaluationError, setEvaluationError] = useState('')
  const [caseAssessment, setCaseAssessment] = useState<{ signature: string; result: CaseAssessment } | null>(null)
  const [caseAssessmentError, setCaseAssessmentError] = useState('')
  const currentEvaluation = evaluation?.signature === signature ? evaluation.result : null
  const currentAssessment = caseAssessment?.signature === signature ? caseAssessment.result : null
  const caseReference = currentEvaluation?.basis === 'case_reference'
  const pendingLabel = caseReference ? '超出病例对照范围' : '待教师确认'
  const hasContent = plan.treatments.some((row) => row.item.trim()) || plan.medications.some((row) => [row.name, row.route, row.dose].some((value) => value.trim()))

  const finishCase = async () => {
    if (assessmentRequest.current?.kind === 'finish') return
    assessmentRequest.current?.controller.abort()
    const controller = new AbortController()
    assessmentRequest.current = { controller, kind: 'finish' }
    setPendingRequest('finish')
    setCaseAssessmentError('')
    setAssessmentOpen(null)
    try {
      const snapshot = getAssessmentSnapshot()
      if (!snapshot) throw new Error('Missing encounter snapshot')
      const result = await requestCaseAssessment({ ...snapshot, clinicalDiagnosis: diagnosis, treatment: plan }, controller.signal, patient.id)
      if (controller.signal.aborted || activeSignature.current !== signature) return
      setCaseAssessment({ signature, result })
      setAssessmentOpen('finish')
    } catch {
      if (!controller.signal.aborted && activeSignature.current === signature) {
        setCaseAssessmentError('暂时无法生成病例评分，请重新点击“完成病例”。')
      }
    } finally {
      if (assessmentRequest.current?.controller === controller) {
        assessmentRequest.current = null
        setPendingRequest(null)
      }
    }
  }

  const confirmFinish = () => {
    if (assessmentOpen !== 'finish' || !currentAssessment) return
    setAssessmentOpen(null)
    recordSubmission('treatment', {
      diagnosis, plan, completed: true, caseAssessment: currentAssessment,
      ...(currentEvaluation ? { result: currentEvaluation } : {}),
    })
    onFinish()
  }

  useEffect(() => {
    if (currentEvaluation) evaluationPanel.current?.scrollIntoView({ block: 'nearest' })
  }, [currentEvaluation])

  useEffect(() => {
    assessmentRequest.current?.controller.abort()
    assessmentRequest.current = null
    setPendingRequest(null)
    setEvaluationError('')
    setCaseAssessmentError('')
    setAssessmentOpen(null)
    return () => assessmentRequest.current?.controller.abort()
  }, [signature])

  const submitEvaluation = async () => {
    if (assessmentRequest.current || !hasContent) return
    const controller = new AbortController()
    assessmentRequest.current = { controller, kind: 'evaluation' }
    setPendingRequest('evaluation')
    setEvaluation(null)
    setCaseAssessment(null)
    setEvaluationError('')
    setCaseAssessmentError('')
    try {
      const result = await requestTreatmentEvaluation({ caseId: patient.id, diagnosis, plan }, controller.signal)
      if (!controller.signal.aborted && activeSignature.current === signature) {
        setEvaluation({ signature, result })
        const snapshot = getAssessmentSnapshot()
        let total: CaseAssessment | null = null
        if (snapshot) {
          try {
            total = await requestCaseAssessment({ ...snapshot, clinicalDiagnosis: diagnosis, treatment: plan }, controller.signal, patient.id)
            if (!controller.signal.aborted && activeSignature.current === signature) {
              setCaseAssessment({ signature, result: total })
              setAssessmentOpen('preview')
            }
          } catch (reason: unknown) {
            if (!controller.signal.aborted) setCaseAssessmentError(reason instanceof Error ? reason.message : '病例总分暂时无法核对。')
          }
        }
        if (!controller.signal.aborted && activeSignature.current === signature) recordSubmission('treatment', { diagnosis, plan, result, ...(total ? { caseAssessment: total } : {}) })
      }
    } catch (error) {
      if (!controller.signal.aborted) setEvaluationError(error instanceof Error ? error.message : '处置评价暂时不可用，请重新提交。')
    } finally {
      if (assessmentRequest.current?.controller === controller) {
        assessmentRequest.current = null
        setPendingRequest(null)
      }
    }
  }

  useEffect(() => {
    for (const table of [treatmentTableRef.current, medicationTableRef.current]) {
      table?.querySelectorAll('textarea').forEach((field) => {
        field.style.height = 'auto'
        field.style.height = `${field.scrollHeight}px`
      })
    }
    const pending = pendingRowRef.current
    if (!pending) return
    const table = pending.kind === 'treatments' ? treatmentTableRef.current : medicationTableRef.current
    const field = table?.querySelector<HTMLTextAreaElement>(`[data-row-id="${pending.id}"] textarea`)
    if (table && field) {
      table.scrollTop = table.scrollHeight
      field.focus({ preventScroll: true })
      pendingRowRef.current = null
    }
  }, [plan])

  const changeTreatment = (id: string, field: keyof Omit<TreatmentRow, 'id'>, value: string) => onPlanChange({ ...plan, treatments: plan.treatments.map((row) => row.id === id ? { ...row, [field]: value } : row) })
  const changeMedication = (id: string, field: keyof Omit<MedicationRow, 'id'>, value: string) => onPlanChange({ ...plan, medications: plan.medications.map((row) => row.id === id ? { ...row, [field]: value } : row) })
  const addTreatment = () => {
    const id = crypto.randomUUID()
    pendingRowRef.current = { kind: 'treatments', id }
    onPlanChange({ ...plan, treatments: [...plan.treatments, { id, category: '', item: '' }] })
  }
  const addMedication = () => {
    const id = crypto.randomUUID()
    pendingRowRef.current = { kind: 'medications', id }
    onPlanChange({ ...plan, medications: [...plan.medications, { id, name: '', route: '', dose: '' }] })
  }

  return <section className="treatment-workspace" aria-label="处置训练台">
    <aside className="four-rail">
      <div className="four-rail-heading"><strong>接诊流程</strong><span>CASE {patient.number}</span></div>
      <nav aria-label="病例模块">{clinicalModules.map((module, index) => <button key={module.id} type="button" className={module.id === 'treatment' ? 'is-active' : ''} aria-current={module.id === 'treatment' ? 'step' : undefined} onClick={() => onNavigate(module.id)}><b>{module.short}</b><span>{module.label}</span>{index < 5 && <Check size={18} />}</button>)}</nav>
      <div className="four-rail-caption"><ClipboardList size={20} /><span>临床综合实训</span></div>
    </aside>

    <div className="treatment-main">
      <header className="four-heading"><div className="four-title"><h1>处置</h1><p>治疗方案 · 用药清单</p></div><div className="four-patient-identity">{patient.name} <span>· {patient.sex} · {patient.age} 岁 · 门诊初诊</span></div><div className="four-progress"><span>{completed}/{total} 行已填写</span><div role="progressbar" aria-label="处置填写进度" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}><i style={{ width: `${total ? completed / total * 100 : 0}%` }} /></div></div></header>

      <div className="treatment-lists">
        <section className="treatment-list-card" aria-labelledby="treatment-list-title">
          <header><span className="treatment-list-icon"><ClipboardList size={23} /></span><h2 id="treatment-list-title">处置清单</h2><span className="treatment-row-count">{plan.treatments.length} 行</span><button type="button" className="treatment-add-row" onClick={addTreatment}><Plus size={18} />添加处置行</button></header>
          <div className="treatment-table-scroll" ref={treatmentTableRef}>
            <table className="treatment-table" aria-label="处置清单"><colgroup><col className="treatment-category-column" /><col /><col className="treatment-delete-column" /></colgroup><thead><tr><th scope="col">处置类别</th><th scope="col">处置项目</th><th scope="col"><span className="treatment-action-heading">操作</span></th></tr></thead><tbody>{plan.treatments.map((row, index) => <tr key={row.id} data-row-id={row.id}><td><textarea aria-label={`第${index + 1}行处置类别`} rows={1} placeholder="填写类别" value={row.category} onChange={(event) => changeTreatment(row.id, 'category', event.target.value)} /></td><td><textarea aria-label={`第${index + 1}行处置项目`} rows={1} placeholder="填写具体处置项目…" value={row.item} onChange={(event) => changeTreatment(row.id, 'item', event.target.value)} /></td><td><button type="button" className="treatment-delete-row" aria-label={`删除处置第${index + 1}行`} onClick={() => onPlanChange({ ...plan, treatments: plan.treatments.filter((item) => item.id !== row.id) })}><Trash2 size={18} /></button></td></tr>)}{!plan.treatments.length && <tr><td colSpan={3} className="treatment-empty">点击“添加处置行”，填写处置方案。</td></tr>}</tbody></table>
          </div>
        </section>

        <section className="treatment-list-card treatment-medication-card" aria-labelledby="medication-list-title">
          <header><span className="treatment-list-icon"><Pill size={23} /></span><h2 id="medication-list-title">用药清单</h2><span className="treatment-row-count">{plan.medications.length} 行</span><button type="button" className="treatment-add-row" onClick={addMedication}><Plus size={18} />添加用药行</button></header>
          <div className="treatment-table-scroll" ref={medicationTableRef}>
            <table className="treatment-table treatment-medication-table" aria-label="用药清单"><colgroup><col className="treatment-medication-name-column" /><col className="treatment-medication-route-column" /><col /><col className="treatment-delete-column" /></colgroup><thead><tr><th scope="col">药物名称</th><th scope="col">用药途径</th><th scope="col">用药剂量</th><th scope="col"><span className="treatment-action-heading">操作</span></th></tr></thead><tbody>{plan.medications.map((row, index) => <tr key={row.id} data-row-id={row.id}><td><textarea aria-label={`第${index + 1}行药物名称`} rows={3} placeholder="填写药物名称" value={row.name} onChange={(event) => changeMedication(row.id, 'name', event.target.value)} /></td><td><textarea aria-label={`第${index + 1}行用药途径`} rows={3} placeholder="填写用药途径" value={row.route} onChange={(event) => changeMedication(row.id, 'route', event.target.value)} /></td><td><textarea aria-label={`第${index + 1}行用药剂量`} rows={3} placeholder="填写剂量和频次；中药可逐行填写药味和剂量…" value={row.dose} onChange={(event) => changeMedication(row.id, 'dose', event.target.value)} /></td><td><button type="button" className="treatment-delete-row" aria-label={`删除用药第${index + 1}行`} onClick={() => onPlanChange({ ...plan, medications: plan.medications.filter((item) => item.id !== row.id) })}><Trash2 size={18} /></button></td></tr>)}{!plan.medications.length && <tr><td colSpan={4} className="treatment-empty">点击“添加用药行”，填写用药方案。</td></tr>}</tbody></table>
          </div>
        </section>
      </div>
    </div>

    <aside className="treatment-summary treatment-evaluation-summary" aria-label="患者与处置填写状态">
      <header className="treatment-summary-heading"><h2>当前患者</h2><span>SP {patient.number}</span></header>
      <section className="treatment-patient-card"><div className="treatment-patient-model"><PatientPortrait /></div><div className="treatment-patient-caption"><strong>{patient.name}</strong><span>{patient.sex} · {patient.age} 岁 · 门诊初诊</span><small><i />患者在场</small></div></section>
      <section className="treatment-summary-section"><h3>主诉</h3><p>{patient.chiefComplaint}</p></section>
      <section className="treatment-summary-section treatment-completion"><h3><FileCheck2 size={19} />清单填写状态</h3><dl><div><dt>处置项目</dt><dd><strong>{completedTreatments}</strong> / {plan.treatments.length} 行</dd></div><div><dt>用药方案</dt><dd><strong>{completedMedications}</strong> / {plan.medications.length} 行</dd></div></dl><p>一行中的全部内容填写后，计为已填写。</p></section>
      <div className="treatment-tip"><Stethoscope size={20} /><p>按当前训练病例填写处置与用药。同一类别有多项处置时可用分号或换行分隔，每种药单独填写一行。</p></div>
      {evaluationError && <p className="treatment-evaluation-error" role="alert">{evaluationError}</p>}
      {currentAssessment && <>
        <button type="button" className="case-assessment-reopen" disabled={pendingRequest !== null} onClick={() => setAssessmentOpen('preview')}>查看病例评分<strong>{currentAssessment.score}/100</strong></button>
        <CaseAssessmentDialog result={currentAssessment} open={assessmentOpen !== null} onClose={() => setAssessmentOpen(null)} onConfirm={assessmentOpen === 'finish' ? confirmFinish : undefined} />
      </>}
      {currentEvaluation && <section ref={evaluationPanel} className={`treatment-evaluation ${currentEvaluation.status}`} aria-label="处置评价结果" aria-live="polite">
        <h3>处置评价：{currentEvaluation.status === 'passed' ? '通过' : currentEvaluation.status === 'needs_revision' ? '需要修改' : pendingLabel}</h3>
        <p>{currentEvaluation.message}</p>
        <ul>{currentEvaluation.checks.map((check) => <li key={check.id}><strong>{check.label} · {{ met: '符合标准', missing: '需要补充', incorrect: '需要修改', unreviewed: caseReference ? '病例未覆盖' : '待确认' }[check.outcome]}</strong>{check.studentText && <blockquote>{check.studentText}</blockquote>}<p>{check.reason}</p><small>依据：{check.reference}</small></li>)}</ul>
        {caseReference ? null : currentEvaluation.ai.status === 'available' ? <div><strong>AI 辅助核对引用</strong>{currentEvaluation.ai.notes?.map((note, index) => <div key={`${note.checkId}-${index}`}><p>{currentEvaluation.checks.find((check) => check.id === note.checkId)?.label}</p>{note.studentQuote && <blockquote>学生原文：{note.studentQuote}</blockquote>}<small>对照依据：{note.referenceQuote}</small></div>)}</div> : <small>{currentEvaluation.ai.status === 'awaiting_standard' ? '教师标准未审核，当前不判通过。' : currentEvaluation.ai.status === 'unavailable' ? 'AI 辅助核对暂不可用，以上为教师标准规则检查结果。' : '以上为教师标准规则检查结果，未启用 AI 辅助核对。'}</small>}
      </section>}
    </aside>

    <footer className="four-footer">
      <button type="button" className="four-back" onClick={onBack}><ArrowLeft size={21} />返回上一步</button>
      {caseAssessmentError
        ? <p className="treatment-evaluation-error" role="alert">{caseAssessmentError}</p>
        : <span>可提交已填写的内容，确认评分后结束接诊</span>}
      <div className="treatment-evaluation-actions">
        <button type="button" className="treatment-evaluation-submit" disabled={!hasContent || pendingRequest !== null} onClick={() => void submitEvaluation()}>{pendingRequest === 'evaluation' ? '正在评价…' : '提交处置评价'}</button>
        <button type="button" className="four-next" disabled={pendingRequest === 'finish'} onClick={() => void finishCase()}>{pendingRequest === 'finish' ? '正在生成评分…' : '完成病例'}<Check size={22} /></button>
      </div>
    </footer>
  </section>
}
