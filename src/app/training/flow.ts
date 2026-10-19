export type Phase =
  | 'loading'
  | 'ready'
  | 'walking'
  | 'waiting'
  | 'patientSpeech'
  | 'doctorDialog'
  | 'diagnosis'
  | 'physicalExam'
  | 'fourDiagnosis'
  | 'auxiliaryExam'
  | 'clinicalDiagnosis'
  | 'treatment'
  | 'exiting'
  | 'completed'

export interface FlowState {
  phase: Phase
  session: number
  hasConsulted: boolean
}

export type FlowEvent =
  | { type: 'WORLD_READY' }
  | { type: 'START' }
  | { type: 'ARRIVED' }
  | { type: 'INTERACT' }
  | { type: 'PATIENT_SPEECH_DONE' }
  | { type: 'BEGIN_DIAGNOSIS' }
  | { type: 'BEGIN_EXAM' }
  | { type: 'BEGIN_FOUR_DIAGNOSIS' }
  | { type: 'BEGIN_AUXILIARY_EXAM' }
  | { type: 'BEGIN_CLINICAL_DIAGNOSIS' }
  | { type: 'BEGIN_TREATMENT' }
  | { type: 'COMPLETE_CASE' }
  | { type: 'BACK' }
  | { type: 'FINISH' }
  | { type: 'DEPARTED' }
  | { type: 'REPLAY' }
  | { type: 'RESET' }

export const initialFlow: FlowState = { phase: 'loading', session: 0, hasConsulted: false }

export function transition(state: FlowState, event: FlowEvent): FlowState {
  if (event.type === 'REPLAY' || event.type === 'RESET') {
    return { ...initialFlow, session: state.session + 1 }
  }

  if (state.phase === 'waiting' && event.type === 'INTERACT') {
    return { ...state, phase: state.hasConsulted ? 'doctorDialog' : 'patientSpeech' }
  }

  const next: Partial<Record<Phase, Partial<Record<FlowEvent['type'], Phase>>>> = {
    loading: { WORLD_READY: 'ready' },
    ready: { START: 'walking' },
    walking: { ARRIVED: 'waiting' },
    patientSpeech: { PATIENT_SPEECH_DONE: 'doctorDialog' },
    doctorDialog: { BEGIN_DIAGNOSIS: 'diagnosis' },
    diagnosis: { BACK: 'waiting', FINISH: 'exiting', BEGIN_EXAM: 'physicalExam' },
    physicalExam: { BACK: 'diagnosis', FINISH: 'exiting', BEGIN_FOUR_DIAGNOSIS: 'fourDiagnosis' },
    fourDiagnosis: { BACK: 'physicalExam', BEGIN_AUXILIARY_EXAM: 'auxiliaryExam' },
    auxiliaryExam: { BACK: 'fourDiagnosis', BEGIN_CLINICAL_DIAGNOSIS: 'clinicalDiagnosis' },
    clinicalDiagnosis: { BACK: 'auxiliaryExam', BEGIN_TREATMENT: 'treatment' },
    treatment: { BACK: 'clinicalDiagnosis', COMPLETE_CASE: 'exiting' },
    exiting: { DEPARTED: 'completed' },
  }
  const phase = next[state.phase]?.[event.type]
  return phase ? { ...state, phase, hasConsulted: state.hasConsulted || phase === 'diagnosis' } : state
}
