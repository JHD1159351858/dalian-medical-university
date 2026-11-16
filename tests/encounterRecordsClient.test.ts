import { afterEach, expect, it, vi } from 'vitest'
import { getStudentIdentity } from '../src/records/studentSession'
import { listEncounters, saveEncounter } from '../src/records/recordsApi'
import { createEncounterRecorder } from '../src/records/recorder'

vi.mock('../src/records/studentSession', async (original) => ({
  ...await original<typeof import('../src/records/studentSession')>(), getStudentIdentity: vi.fn(),
}))

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it('refuses to transmit records when the current student differs from the encounter owner', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getStudentIdentity).mockResolvedValue({ userId: 'student-b', token: 'session-b' })
  await expect(listEncounters('student-a')).rejects.toMatchObject({ status: 401 })
  expect(fetchMock).not.toHaveBeenCalled()
})

it('sends the verified session token instead of a client supplied student id', async () => {
  vi.mocked(getStudentIdentity).mockResolvedValue({ userId: 'student-a', token: 'session-a' })
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ record: {} }))
  vi.stubGlobal('fetch', fetchMock)
  const recorder = createEncounterRecorder(async () => {})
  recorder.setOwner('student-a')
  const record = recorder.begin({ messages: [], fourDiagnosis: {}, auxiliaryExam: {}, clinicalDiagnosis: {}, treatment: { treatments: [], medications: [] }, physicalExam: null })!
  await saveEncounter('student-a', record)
  const [path, options] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(path).toBe('/api/encounters')
  expect(options).toMatchObject({ method: 'PUT', headers: { authorization: 'Bearer session-a' } })
  expect(JSON.parse(options.body as string)).not.toHaveProperty('studentId')
})

it('reports an expired login or cloud write failure without claiming a saved result', async () => {
  vi.mocked(getStudentIdentity).mockResolvedValue(null)
  await expect(listEncounters('student-a')).rejects.toMatchObject({ status: 401 })
  vi.mocked(getStudentIdentity).mockResolvedValue({ userId: 'student-a', token: 'session-a' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: '数据库暂不可用' }, { status: 503 })))
  await expect(listEncounters('student-a')).rejects.toMatchObject({ status: 503, message: '数据库暂不可用' })
})
