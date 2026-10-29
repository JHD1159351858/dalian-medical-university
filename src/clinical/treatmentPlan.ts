export interface TreatmentRow { id: string; category: string; item: string }
export interface MedicationRow { id: string; name: string; route: string; dose: string }
export interface TreatmentPlan { treatments: TreatmentRow[]; medications: MedicationRow[] }

export function createInitialTreatmentPlan(): TreatmentPlan {
  return {
    treatments: [
      { id: 'nursing', category: '护理', item: '' },
      { id: 'nutrition', category: '饮食及营养', item: '' },
      { id: 'monitoring', category: '监测及支持', item: '' },
      { id: 'intervention', category: '介入及手术', item: '' },
      { id: 'tcm-treatment', category: '中医治疗', item: '' },
      { id: 'medication', category: '药物治疗', item: '' },
    ],
    medications: [{ id: 'medication-initial', name: '', route: '', dose: '' }],
  }
}
