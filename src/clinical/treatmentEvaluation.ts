import type { TreatmentPlan } from './treatmentPlan'

export interface TreatmentSubmission { caseId: string; diagnosis: Record<string, string>; plan: TreatmentPlan }
export interface EvaluationCheck { id: string; label: string; outcome: 'met' | 'missing' | 'incorrect' | 'unreviewed'; studentText: string; reason: string; reference: string }
export interface TreatmentEvaluation {
  source: 'rules'
  teacherApproved: boolean
  rubricVersion: string
  status: 'pending_review' | 'passed' | 'needs_revision'
  message: string
  checks: EvaluationCheck[]
  ai: { status: 'awaiting_standard' | 'not_configured' | 'available' | 'unavailable'; notes?: { checkId: string; studentQuote: string; referenceQuote: string }[] }
}

function validResult(value: unknown): value is TreatmentEvaluation {
  if (!value || typeof value !== 'object') return false
  const result = value as TreatmentEvaluation
  if (result.source !== 'rules' || typeof result.teacherApproved !== 'boolean' || typeof result.rubricVersion !== 'string' || typeof result.message !== 'string' || !['pending_review', 'passed', 'needs_revision'].includes(result.status) || !Array.isArray(result.checks) || !result.checks.length) return false
  if (!result.checks.every((check) => check && ['id', 'label', 'studentText', 'reason', 'reference'].every((key) => typeof check[key as keyof EvaluationCheck] === 'string') && ['met', 'missing', 'incorrect', 'unreviewed'].includes(check.outcome))) return false
  if (result.status === 'passed' && (!result.teacherApproved || result.checks.some((check) => check.outcome !== 'met'))) return false
  if (!result.ai || !['awaiting_standard', 'not_configured', 'available', 'unavailable'].includes(result.ai.status)) return false
  if (result.ai.status === 'available' && (!Array.isArray(result.ai.notes) || !result.ai.notes.length || !result.ai.notes.every((note) => {
    if (!note || typeof note.studentQuote !== 'string' || typeof note.referenceQuote !== 'string' || !note.referenceQuote.trim()) return false
    const check = result.checks.find((check) => check.id === note.checkId)
    return !!check && check.studentText.includes(note.studentQuote) && (check.reason.includes(note.referenceQuote) || check.reference.includes(note.referenceQuote))
  }))) return false
  return true
}

export async function requestTreatmentEvaluation(submission: TreatmentSubmission, signal?: AbortSignal): Promise<TreatmentEvaluation> {
  const response = await fetch('/api/treatment-evaluation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(submission), signal })
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result ? result.error : null
    throw new Error(typeof message === 'string' ? message : '处置评价暂时不可用，请重新提交。')
  }
  if (!validResult(result)) throw new Error('评价结果格式异常，请重新提交。')
  return result
}
