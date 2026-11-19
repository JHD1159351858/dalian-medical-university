import type { EncounterSnapshot } from '../records/types'

export interface CaseAssessmentCheck { id: string; label: string; score: number; maxScore: number; feedback: string }
export interface CaseAssessmentModule { id: string; label: string; score: number; maxScore: number; checks: CaseAssessmentCheck[] }
export interface CaseAssessment {
  caseId: string
  version: string
  source: 'case_reference'
  teacherApproved: boolean
  score: number
  maxScore: 100
  modules: CaseAssessmentModule[]
  scopeNote: string
}

const scored = (value: unknown): value is { score: number; maxScore: number } => {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return typeof point.score === 'number' && Number.isFinite(point.score) && typeof point.maxScore === 'number' && Number.isFinite(point.maxScore) && point.maxScore > 0 && point.score >= 0 && point.score <= point.maxScore
}

export function validAssessment(value: unknown, expectedCaseId?: string): value is CaseAssessment {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<CaseAssessment>
  return typeof result.caseId === 'string' && result.caseId.length > 0 && (expectedCaseId === undefined || result.caseId === expectedCaseId) && result.source === 'case_reference' && typeof result.version === 'string' && typeof result.teacherApproved === 'boolean' && scored(result) && result.maxScore === 100 && typeof result.scopeNote === 'string' && Array.isArray(result.modules) && result.modules.length === 6 && result.modules.every((module) =>
    scored(module) && typeof module.id === 'string' && typeof module.label === 'string' && Array.isArray(module.checks) && module.checks.every((check) => scored(check) && typeof check.id === 'string' && typeof check.label === 'string' && typeof check.feedback === 'string'))
}

export async function requestCaseAssessment(snapshot: EncounterSnapshot, signal: AbortSignal, caseId = 'wang-xu'): Promise<CaseAssessment> {
  const response = await fetch('/api/case-assessment', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseId, snapshot }), signal,
  })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok || !validAssessment(data, caseId)) throw new Error('病例总分暂时无法核对，请重新提交评价。')
  return data
}
