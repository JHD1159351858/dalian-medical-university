import type { TrainingCase } from '../cases/selectedCase'
import { physicalExamItems } from './examData'

type Finding = TrainingCase['physical'][number]
export type VitalReadings = NonNullable<Finding['vitals']>
export type PalpationFindings = NonNullable<Finding['palpation']>

export interface CaseExamItem {
  id: string
  label: string
  hint: string
  category: string
  report: string
  vitals?: VitalReadings
  palpation?: PalpationFindings
}

export const hisCategories = ['一般情况', '头颈部', '胸部', '心血管', '腹部', '四肢', '神经系统', '专科检查']
const categories: Record<string, string> = {
  nutrition: '一般情况', nodes: '头颈部', skin: '头颈部', respiration: '胸部', heart: '心血管', vitals: '心血管',
  inspection: '腹部', percussion: '腹部', bowel: '腹部', limbs: '四肢', neuro: '神经系统',
}

export const wangPalpation: PalpationFindings = { tender: ['left-upper'], rebound: [], painSpeech: '这里有点疼。' }
const wangVitals: VitalReadings = { pulse: 118, respiration: 32, bloodPressure: '149/92', temperature: 37.5 }

export function patientExamItems(patient: Pick<TrainingCase, 'id' | 'physical'>): CaseExamItem[] {
  return physicalExamItems.map(({ id, label, hint, report }) => {
    const common = { id, label, hint, category: categories[id] }
    if (patient.id === 'wang-xu') return {
      ...common, report, vitals: id === 'vitals' ? wangVitals : undefined,
      palpation: id === 'inspection' ? wangPalpation : undefined,
    }
    const finding = patient.physical.find(item => item.id === id)
    return { ...common, report: finding?.result ?? '本病例尚未提供本项检查结果。', vitals: finding?.vitals, palpation: finding?.palpation }
  })
}
