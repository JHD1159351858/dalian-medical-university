import treatmentPresets from '../../shared/treatment-presets.json'

export interface TreatmentRow { id: string; category: string; item: string }
export interface MedicationRow { id: string; name: string; route: string; dose: string }
export interface TreatmentPlan { treatments: TreatmentRow[]; medications: MedicationRow[] }

export function createInitialTreatmentPlan(): TreatmentPlan {
  return {
    treatments: treatmentPresets.map((row) => ({ ...row, item: '' })),
    medications: [{ id: 'medication-initial', name: '', route: '', dose: '' }],
  }
}
