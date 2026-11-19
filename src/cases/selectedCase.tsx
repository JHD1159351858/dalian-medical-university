import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { CASE_CHIEF_COMPLAINT, PATIENT_OPENING } from '../clinical/caseData'
import type { LaboratoryResult } from '../clinical/auxiliaryExamData'

export interface CaseFinding {
  id?: string
  label: string
  result: string
  tongueSampleId?: string
}
export interface TrainingCase {
  id: string
  number: string
  name: string
  sex: string
  age: number
  opening: string
  interviewQuestions?: string[]
  chiefComplaint: string
  physical: Array<CaseFinding & {
    vitals?: { pulse: number; respiration: number; bloodPressure: string; temperature: number }
    palpation?: { tender: readonly string[]; rebound: readonly string[]; painSpeech: string; releaseSpeech?: string }
  }>
  four: CaseFinding[]
  auxiliary: Array<CaseFinding & { values?: LaboratoryResult[] }>
}

export const wangXu: TrainingCase = {
  id: 'wang-xu', number: '01', name: '王旭', sex: '男', age: 48,
  opening: PATIENT_OPENING, chiefComplaint: CASE_CHIEF_COMPLAINT, physical: [], four: [], auxiliary: [],
}

const currentCase = createContext<TrainingCase>(wangXu)
export const useTrainingCase = () => useContext(currentCase)

export function drawTrainingCase(cases: TrainingCase[], previousId?: string, random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000) {
  const available = cases.length > 1 ? cases.filter((item) => item.id !== previousId) : cases
  return available[Math.floor(random() * available.length)]
}

export function TrainingCaseProvider({ children }: { children: (redraw: () => void) => ReactNode }) {
  const [catalog, setCatalog] = useState<TrainingCase[]>([])
  const [selected, setSelected] = useState<TrainingCase | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    async function loadCases() {
      try {
        const response = await fetch('/api/training-cases', { signal: controller.signal })
        if (!response.ok) throw new Error()
        const { cases } = await response.json() as { cases: Omit<TrainingCase, 'number'>[] }
        if (!Array.isArray(cases) || !cases.length) throw new Error()
        const all = [wangXu, ...cases.map((item, index) => ({ ...item, number: String(index + 2).padStart(2, '0') }))]
        if (controller.signal.aborted) return
        setCatalog(all)
        setSelected(drawTrainingCase(all))
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }
    void loadCases()
    return () => controller.abort()
  }, [attempt])

  if (!selected) return <main className="app-shell"><div className="prompt-card" role={failed ? 'alert' : 'status'}>
    <p>{failed ? '病例库加载失败，请重试。' : '正在准备接诊病例…'}</p>
    {failed && <button className="primary-button" onClick={() => { setFailed(false); setAttempt(attempt + 1) }}>重新加载病例</button>}
  </div></main>

  const redraw = () => setSelected(drawTrainingCase(catalog, selected.id))
  return <currentCase.Provider value={selected}>{children(redraw)}</currentCase.Provider>
}
