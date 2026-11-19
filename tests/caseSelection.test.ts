import { expect, it } from 'vitest'
import { publicCases as patients } from '../server/trainingCases.mjs'
import { drawTrainingCase, wangXu } from '../src/cases/selectedCase'
import { getPatientVoiceProfile } from '../src/diagnosis/voiceProfiles'

const cases = [wangXu, ...patients.map((patient, i) => ({ ...patient, number: String(i + 2).padStart(2, '0') }))]

it('draws from six distinct patients and excludes only the previous patient on the next round', () => {
  const possible = (previous?: string) => {
    const count = previous ? cases.length - 1 : cases.length
    return Array.from({ length: count }, (_, i) => drawTrainingCase(cases, previous, () => (i + 0.5) / count).id)
  }
  expect(new Set(possible()).size).toBe(6)
  for (const patient of cases) {
    expect(possible(patient.id)).toEqual(cases.filter((other) => other !== patient).map((other) => other.id))
    expect(getPatientVoiceProfile(patient).voiceId).toBeTruthy()
  }
})

it('opens each encounter with a distinct patient complaint', () => {
  const openings = cases.map(({ opening }) => opening.trim())
  expect(openings.every(Boolean)).toBe(true)
  expect(new Set(openings).size).toBe(cases.length)
  expect(openings).not.toContain('医生，我身体不舒服。您帮我看看吧。')
})
