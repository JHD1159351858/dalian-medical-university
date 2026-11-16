import { expect, it } from 'vitest'
import { createEncounterRecorder } from '../src/records/recorder'
import { createInitialTreatmentPlan } from '../src/clinical/treatmentPlan'
import type { EncounterRecord, EncounterSnapshot } from '../src/records/types'

const snapshot = (): EncounterSnapshot => ({ messages: [], fourDiagnosis: {}, auxiliaryExam: {}, clinicalDiagnosis: {}, treatment: createInitialTreatmentPlan(), physicalExam: null })

it('keeps distinct encounters and all submissions while updating the same encounter id', async () => {
  const saved: EncounterRecord[] = []
  const recorder = createEncounterRecorder(async (_owner, record) => { saved.push(record) })
  recorder.setOwner('student-a')
  recorder.begin(snapshot())
  const first = recorder.current()!.id
  recorder.submit('pulse', { selected: ['沉'] })
  recorder.submit('pulse', { selected: ['沉', '滑', '数'] })
  recorder.finish('completed')
  await recorder.flush()
  expect(saved.at(-1)).toMatchObject({ id: first, status: 'completed', submissions: [{ payload: { selected: ['沉'] } }, { payload: { selected: ['沉', '滑', '数'] } }] })
  recorder.begin(snapshot())
  await recorder.flush()
  expect(saved.at(-1)!.id).not.toBe(first)
})

it('serializes writes so an earlier snapshot cannot overwrite the final submission', async () => {
  let release: (() => void) | undefined
  const saved: EncounterRecord[] = []
  const recorder = createEncounterRecorder(async (_owner, record) => {
    if (!saved.length) await new Promise<void>((resolve) => { release = resolve })
    saved.push(record)
  })
  recorder.setOwner('student-a')
  recorder.begin(snapshot())
  const writing = recorder.flush()
  recorder.update({ ...snapshot(), fourDiagnosis: { feel: '深取清楚' } })
  recorder.finish('completed')
  release?.()
  await writing
  expect(saved).toHaveLength(2)
  expect(saved.at(-1)).toMatchObject({ status: 'completed', snapshot: { fourDiagnosis: { feel: '深取清楚' } } })
})

it('retains failed saves for retry and never assigns an old record to a new student', async () => {
  let fail = true
  const saved: Array<{ owner: string; record: EncounterRecord }> = []
  const recorder = createEncounterRecorder(async (owner, record) => {
    if (fail) throw new Error('断网')
    saved.push({ owner, record })
  })
  expect(recorder.begin(snapshot())).toBeNull()
  recorder.setOwner('student-a')
  recorder.begin(snapshot())
  await expect(recorder.flush()).rejects.toThrow('断网')
  fail = false
  await recorder.flush()
  expect(saved).toHaveLength(1)
  recorder.submit('tongue', { answer: '红舌' })
  recorder.setOwner('student-b')
  expect(recorder.current()).toBeNull()
  await recorder.flush()
  expect(saved).toHaveLength(1)
})

it('recovers unsent records after a reload only for their original student', async () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const first = createEncounterRecorder(async () => { throw new Error('断网') })
  first.useStorage(storage)
  first.setOwner('student-a')
  const id = first.begin(snapshot())!.id
  first.submit('pulse', { selected: ['沉'] })
  await expect(first.flush()).rejects.toThrow('断网')
  first.setOwner(null)

  const saved: EncounterRecord[] = []
  const restored = createEncounterRecorder(async (_owner, record) => { saved.push(record) })
  restored.useStorage(storage)
  restored.setOwner('student-b')
  await restored.flush()
  expect(saved).toHaveLength(0)
  restored.setOwner('student-a')
  await restored.flush()
  expect(saved[0]).toMatchObject({ id, submissions: [{ payload: { selected: ['沉'] } }] })
  expect(values.size).toBe(0)
})

it('preserves pending encounters created by another tab for the same student', async () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const tabA = createEncounterRecorder(async () => {})
  const tabB = createEncounterRecorder(async () => {})
  for (const tab of [tabA, tabB]) { tab.useStorage(storage); tab.setOwner('student-a') }
  const first = tabA.begin(snapshot())!.id
  const second = tabB.begin(snapshot())!.id
  const saved: string[] = []
  const restored = createEncounterRecorder(async (_owner, record) => { saved.push(record.id) })
  restored.useStorage(storage)
  restored.setOwner('student-a')
  await restored.flush()
  expect(new Set(saved)).toEqual(new Set([first, second]))
})
