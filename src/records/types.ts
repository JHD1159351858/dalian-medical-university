import type { ChatMessage } from '../diagnosis/chat'
import type { PalpationResponse } from '../exam/palpation'
import type { TreatmentPlan } from '../clinical/treatmentPlan'

export interface PhysicalExamRecord {
  orderedIds: string[]
  notes: Record<string, string>
  submittedNotes: Record<string, string>
  history: Array<PalpationResponse & { at: number }>
}

export interface EncounterSnapshot {
  messages: ChatMessage[]
  fourDiagnosis: Record<string, string>
  auxiliaryExam: Record<string, string>
  clinicalDiagnosis: Record<string, string>
  treatment: TreatmentPlan
  physicalExam: PhysicalExamRecord | null
}

export type SubmissionKind = 'physical-exam' | 'tongue' | 'pulse' | 'treatment'
export interface EncounterSubmission {
  id: string
  kind: SubmissionKind
  at: string
  payload: Record<string, unknown>
}

export interface EncounterSummary {
  id: string
  caseId: string
  patient: { name: string; age: number; sex: string }
  startedAt: string
  endedAt: string | null
  status: 'in_progress' | 'completed' | 'ended'
  updatedAt?: string
}

export interface EncounterRecord extends EncounterSummary {
  snapshot: EncounterSnapshot
  submissions: EncounterSubmission[]
}

export interface EncounterList { records: EncounterSummary[]; hasMore: boolean }
export type RecordsAccess = 'loading' | 'unconfigured' | 'signed_out' | 'ready'
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
