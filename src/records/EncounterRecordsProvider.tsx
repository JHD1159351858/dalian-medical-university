import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createEncounterRecorder } from './recorder'
import { listEncounters, loadEncounter, saveEncounter } from './recordsApi'
import { getStudentClient, RecordsError, studentIdentity } from './studentSession'
import type { EncounterList, EncounterRecord, EncounterSnapshot, PhysicalExamRecord, RecordsAccess, SaveState, SubmissionKind } from './types'

interface RecordsContext {
  access: RecordsAccess
  studentId: string | null
  saveState: SaveState
  error: string
  physicalExam: PhysicalExamRecord | null
  updatePhysicalExam: (record: PhysicalExamRecord) => void
  recordSubmission: (kind: SubmissionKind, payload: Record<string, unknown>) => void
  loadList: (offset?: number) => Promise<EncounterList>
  loadRecord: (id: string) => Promise<EncounterRecord>
  retrySave: () => void
  getAssessmentSnapshot: () => EncounterSnapshot | null
}

const signInRequired = () => Promise.reject(new RecordsError('请先登录后查看自己的接诊记录。', 401))
const context = createContext<RecordsContext>({
  access: 'signed_out', studentId: null, saveState: 'idle', error: '', physicalExam: null,
  updatePhysicalExam: () => {}, recordSubmission: () => {},
  loadList: signInRequired, loadRecord: signInRequired, retrySave: () => {},
  getAssessmentSnapshot: () => null,
})

export const useEncounterRecords = () => useContext(context)

const trainingPhases = new Set(['patientSpeech', 'doctorDialog', 'diagnosis', 'physicalExam', 'fourDiagnosis', 'auxiliaryExam', 'clinicalDiagnosis', 'treatment'])

export function EncounterRecordsProvider({ snapshot, phase, session, onIdentityChange, children }: {
  snapshot: Omit<EncounterSnapshot, 'physicalExam'>
  phase: string
  session: number
  onIdentityChange: () => void
  children: ReactNode
}) {
  const [access, setAccess] = useState<RecordsAccess>('loading')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState('')
  const [physicalExam, setPhysicalExam] = useState<PhysicalExamRecord | null>(null)
  const [recorder] = useState(() => createEncounterRecorder(saveEncounter))
  const ownerRef = useRef<string | null>(null)
  const identityChangeRef = useRef(onIdentityChange)
  const previous = useRef({ phase, session })

  useEffect(() => { identityChangeRef.current = onIdentityChange }, [onIdentityChange])

  useEffect(() => {
    let cancelled = false
    try { recorder.useStorage(window.localStorage) } catch { recorder.useStorage(null) }
    let unsubscribe: (() => void) | undefined
    let previousOwner: string | null | undefined
    const applyIdentity = (identity: { userId: string } | null) => {
      if (cancelled) return
      const nextOwner = identity?.userId ?? null
      if (previousOwner !== undefined && previousOwner !== nextOwner) identityChangeRef.current()
      if (ownerRef.current !== nextOwner) {
        recorder.setOwner(nextOwner)
        ownerRef.current = nextOwner
        setPhysicalExam(null)
        setSaveState('idle')
        setError('')
      }
      previousOwner = nextOwner
      setStudentId(nextOwner)
      setAccess(nextOwner ? 'ready' : 'signed_out')
    }
    void getStudentClient().then(async (client) => {
      const { data, error: sessionError } = await client.auth.getSession()
      if (sessionError) throw new RecordsError('学生登录已失效，请重新登录。', 401)
      if (cancelled) return
      applyIdentity(studentIdentity(data.session))
      const subscription = client.auth.onAuthStateChange((_event, nextSession) => applyIdentity(studentIdentity(nextSession)))
      unsubscribe = () => subscription.data.subscription.unsubscribe()
    }).catch((reason: unknown) => {
      if (cancelled) return
      setAccess(reason instanceof RecordsError && reason.status === 401 ? 'signed_out' : 'unconfigured')
      setError(reason instanceof Error ? reason.message : '接诊记录暂不可用。')
    })
    return () => { cancelled = true; unsubscribe?.() }
  }, [recorder])

  const flush = useCallback(async () => {
    const owner = ownerRef.current
    if (!owner || !recorder.hasPending()) return
    setSaveState('saving')
    try {
      await recorder.flush()
      if (ownerRef.current === owner) {
        setSaveState('saved')
        setError('')
      }
    } catch (reason: unknown) {
      if (ownerRef.current === owner) {
        setSaveState('error')
        setError(reason instanceof Error ? reason.message : '记录保存失败，请重试。')
      }
    }
  }, [recorder])

  useEffect(() => {
    const last = previous.current
    previous.current = { phase, session }
    if (last.session !== session) {
      recorder.finish('ended')
      setPhysicalExam(null)
      void flush()
      return
    }
    if (access !== 'ready') return
    const nextSnapshot = { ...snapshot, physicalExam }
    if (trainingPhases.has(phase)) recorder.begin(nextSnapshot)
    recorder.update(nextSnapshot)
    if (phase === 'exiting' || phase === 'completed') {
      recorder.finish(last.phase === 'treatment' ? 'completed' : 'ended')
      void flush()
      return
    }
    if (!recorder.hasPending()) return
    setSaveState('saving')
    const timer = window.setTimeout(() => { void flush() }, 800)
    return () => window.clearTimeout(timer)
  }, [snapshot, physicalExam, phase, session, access, recorder, flush])

  useEffect(() => {
    const saveBeforeLeaving = () => { void flush() }
    const warnIfPending = (event: BeforeUnloadEvent) => {
      if (!recorder.hasPending()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('pagehide', saveBeforeLeaving)
    window.addEventListener('beforeunload', warnIfPending)
    return () => {
      window.removeEventListener('pagehide', saveBeforeLeaving)
      window.removeEventListener('beforeunload', warnIfPending)
      void flush()
    }
  }, [flush, recorder])

  const updatePhysicalExam = useCallback((value: PhysicalExamRecord) => { setPhysicalExam(value) }, [])
  const recordSubmission = useCallback((kind: SubmissionKind, payload: Record<string, unknown>) => {
    const latestSnapshot = { ...snapshot, physicalExam }
    recorder.begin(latestSnapshot)
    recorder.update(latestSnapshot)
    recorder.submit(kind, payload)
    void flush()
  }, [recorder, flush, snapshot, physicalExam])

  const loadList = useCallback(async (offset = 0) => {
    const owner = ownerRef.current
    if (!owner) return signInRequired()
    await flush()
    return listEncounters(owner, offset)
  }, [flush])
  const loadRecord = useCallback(async (id: string) => {
    const owner = ownerRef.current
    if (!owner) return signInRequired()
    return loadEncounter(owner, id)
  }, [])

  const getAssessmentSnapshot = useCallback((): EncounterSnapshot => structuredClone({ ...snapshot, physicalExam }), [snapshot, physicalExam])

  return <context.Provider value={{ access, studentId, saveState, error, physicalExam, updatePhysicalExam, recordSubmission, loadList, loadRecord, getAssessmentSnapshot, retrySave: () => { void flush() } }}>{children}</context.Provider>
}
