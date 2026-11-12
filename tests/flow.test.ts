import { describe, expect, it } from 'vitest'
import { initialFlow, transition, type FlowState } from '../src/flow'

const arrive = () => transition(transition(transition(initialFlow, { type: 'WORLD_READY' }), { type: 'START' }), { type: 'ARRIVED' })

describe('player-controlled consultation flow', () => {
  it('stays waiting after arrival until a validated interaction', () => {
    const waiting = arrive()
    expect(waiting.phase).toBe('waiting')
    expect(transition(waiting, { type: 'ARRIVED' })).toBe(waiting)
    expect(transition(waiting, { type: 'BEGIN_DIAGNOSIS' })).toBe(waiting)
    const opening = transition(waiting, { type: 'INTERACT' })
    expect(opening.phase).toBe('patientSpeech')
    const dialog = transition(opening, { type: 'PATIENT_SPEECH_DONE' })
    expect(dialog.phase).toBe('doctorDialog')
    expect(transition(dialog, { type: 'BEGIN_DIAGNOSIS' })).toMatchObject({ phase: 'diagnosis', hasConsulted: true })
  })

  it('does not buffer interactions before the patient arrives', () => {
    for (const phase of ['loading', 'ready', 'walking', 'exiting', 'completed'] as const) {
      const state = { phase, session: 0, hasConsulted: false }
      expect(transition(state, { type: 'INTERACT' })).toBe(state)
    }
  })

  it('requires another interaction after return and skips the initial speech', () => {
    const state: FlowState = { phase: 'diagnosis', session: 3, hasConsulted: true }
    const returned = transition(state, { type: 'BACK' })
    expect(returned).toEqual({ phase: 'waiting', session: 3, hasConsulted: true })
    expect(transition(returned, { type: 'BEGIN_DIAGNOSIS' })).toBe(returned)
    expect(transition(returned, { type: 'INTERACT' }).phase).toBe('doctorDialog')
  })

  it('completes only after the patient physically departs', () => {
    const state: FlowState = { phase: 'diagnosis', session: 3, hasConsulted: true }
    const departing = transition(state, { type: 'FINISH' })
    expect(departing.phase).toBe('exiting')
    expect(transition(departing, { type: 'INTERACT' })).toBe(departing)
    expect(transition(departing, { type: 'DEPARTED' }).phase).toBe('completed')
    expect(transition(arrive(), { type: 'DEPARTED' }).phase).toBe('waiting')
  })

  it('opens physical examination from diagnosis and returns to diagnosis', () => {
    const state: FlowState = { phase: 'diagnosis', session: 3, hasConsulted: true }
    const exam = transition(state, { type: 'BEGIN_EXAM' })
    expect(exam).toEqual({ phase: 'physicalExam', session: 3, hasConsulted: true })
    expect(transition(exam, { type: 'BACK' })).toEqual(state)
    expect(transition(exam, { type: 'FINISH' }).phase).toBe('exiting')
  })

  it('continues through the complete clinical module sequence', () => {
    const state: FlowState = { phase: 'physicalExam', session: 3, hasConsulted: true }
    const fourDiagnosis = transition(state, { type: 'BEGIN_FOUR_DIAGNOSIS' })
    const auxiliaryExam = transition(fourDiagnosis, { type: 'BEGIN_AUXILIARY_EXAM' })
    const diagnosis = transition(auxiliaryExam, { type: 'BEGIN_CLINICAL_DIAGNOSIS' })
    const treatment = transition(diagnosis, { type: 'BEGIN_TREATMENT' })
    expect([fourDiagnosis.phase, auxiliaryExam.phase, diagnosis.phase, treatment.phase]).toEqual([
      'fourDiagnosis', 'auxiliaryExam', 'clinicalDiagnosis', 'treatment',
    ])
    expect(transition(treatment, { type: 'COMPLETE_CASE' }).phase).toBe('exiting')
    expect(transition(fourDiagnosis, { type: 'BACK' }).phase).toBe('physicalExam')
  })

  it('replay and reset require assets to become ready and reset consultation consent', () => {
    for (const type of ['RESET', 'REPLAY'] as const) {
      const reset = transition({ phase: 'diagnosis', session: 2, hasConsulted: true }, { type })
      expect(reset).toEqual({ phase: 'loading', session: 3, hasConsulted: false })
      expect(transition(reset, { type: 'WORLD_READY' }).phase).toBe('ready')
    }
  })
})
