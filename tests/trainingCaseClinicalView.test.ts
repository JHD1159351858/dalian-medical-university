import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import cases from '../server/training-cases.json'
import { publicCases } from '../server/trainingCases.mjs'
import { useTrainingCase } from '../src/cases/selectedCase'
import { FourExaminationViewer } from '../src/clinical/FourExaminationViewer'
import { AuxiliaryExamPage } from '../src/clinical/AuxiliaryExamPage'
import { PhysicalExamPage } from '../src/exam/PhysicalExamPage'
import { ClinicalDiagnosisPage } from '../src/clinical/ClinicalDiagnosisPage'
import { TreatmentPage } from '../src/clinical/TreatmentPage'
import { createInitialTreatmentPlan } from '../src/clinical/treatmentPlan'

vi.mock('../src/cases/selectedCase', () => ({ useTrainingCase: vi.fn() }))
const noop = () => {}
const navigation = { onBack: noop, onNext: noop, onNavigate: noop }

it.each(cases)('uses $name and their own examination materials throughout training', (patient) => {
  vi.mocked(useTrainingCase).mockReturnValue({ ...publicCases.find((entry) => entry.id === patient.id)!, number: '02' })
  const physical = renderToStaticMarkup(createElement(PhysicalExamPage, { muted: true, onBack: noop, onFinish: noop, onReset: noop }))
  const look = renderToStaticMarkup(createElement(FourExaminationViewer, { kind: 'look', record: '', muted: true, onRecordChange: noop, onStopReading: noop, onClose: noop }))
  const auxiliary = renderToStaticMarkup(createElement(AuxiliaryExamPage, { ...navigation, records: {}, onRecordChange: noop }))
  const diagnosis = renderToStaticMarkup(createElement(ClinicalDiagnosisPage, { ...navigation, records: {}, onRecordChange: noop }))
  const treatment = renderToStaticMarkup(createElement(TreatmentPage, { ...navigation, onFinish: noop, plan: createInitialTreatmentPlan(), onPlanChange: noop }))
  for (const page of [physical, look, auxiliary, diagnosis, treatment]) {
    expect(page).toContain(patient.name)
    expect(page).toContain(`data-patient-id="${patient.id}"`)
    expect(page).not.toContain('/case-portraits/')
    expect(page).not.toContain('王旭')
    expect(page).not.toContain('wang-xu')
  }
  for (const label of ['体格检查训练台', '开具检查', '查看电脑', '完成检查']) expect(physical).toContain(label)
  for (const field of ['primary', 'secondary', 'tcm', 'summary']) expect(diagnosis).toContain('clinical-diagnosis-input-' + field)
  for (const label of ['处置清单', '用药清单', '提交处置评价', '完成病例']) expect(treatment).toContain(label)
  for (const { label } of patient.auxiliary) expect(auxiliary).toContain(label)
  expect(auxiliary).toContain('开具心电图')
  for (const item of patient.auxiliary) expect(auxiliary).not.toContain(item.result)
  expect(look).toContain(`data-photo-id="${patient.four[0].tongueSampleId}"`)
  expect(diagnosis).not.toContain(patient.diagnosis)
  expect(treatment).not.toContain(patient.treatment[0])
})
