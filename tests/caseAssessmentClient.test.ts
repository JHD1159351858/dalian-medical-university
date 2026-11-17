import { afterEach, expect, it, vi } from 'vitest'
import { requestCaseAssessment, type CaseAssessment } from '../src/clinical/caseAssessment'
import type { EncounterSnapshot } from '../src/records/types'

afterEach(() => vi.unstubAllGlobals())
const snapshot: EncounterSnapshot = { messages: [], fourDiagnosis: {}, auxiliaryExam: {}, clinicalDiagnosis: {}, treatment: { treatments: [], medications: [] }, physicalExam: null }
const assessment = (): CaseAssessment => ({
  caseId: 'wang-xu', version: 'test', source: 'case_reference', teacherApproved: false, score: 100, maxScore: 100, scopeNote: '仅按病例参考核对。',
  modules: [20, 15, 15, 10, 20, 20].map((points, index) => ({ id: String(index), label: '环节' + index, score: points, maxScore: points, checks: [{ id: 'check-' + index, label: '核对项', score: points, maxScore: points, feedback: '符合病例资料。' }] })),
})

it('submits the complete training snapshot and returns the server six-module score', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(assessment()))
  vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()
  await expect(requestCaseAssessment(snapshot, controller.signal)).resolves.toMatchObject({ score: 100, maxScore: 100, teacherApproved: false })
  const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('/api/case-assessment')
  expect(JSON.parse(options.body as string)).toEqual({ caseId: 'wang-xu', snapshot })
  expect(options.signal).toBe(controller.signal)
})

it('does not display a score outside the server contract or claim success after an API error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ ...assessment(), score: 101 })).mockResolvedValueOnce(Response.json({ error: 'failed' }, { status: 503 })))
  await expect(requestCaseAssessment(snapshot, new AbortController().signal)).rejects.toThrow('暂时无法核对')
  await expect(requestCaseAssessment(snapshot, new AbortController().signal)).rejects.toThrow('暂时无法核对')
})
