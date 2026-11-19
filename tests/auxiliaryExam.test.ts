import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { publicCases } from '../server/trainingCases.mjs'
import * as caseContext from '../src/cases/selectedCase'
import { ClinicalModulePage } from '../src/clinical/ClinicalModulePage'
import { moduleItems } from '../src/clinical/caseData'
import { auxiliaryReports, getAuxiliaryExams } from '../src/clinical/auxiliaryExamData'
import { AuxiliaryReportViewer, LaboratoryTable } from '../src/clinical/AuxiliaryReportViewer'

vi.mock('../src/exam/ExamScene', () => ({ PatientPortrait: () => createElement('canvas', { 'aria-label': '项目卡通患者模型' }) }))
const noop = () => {}
afterEach(() => vi.restoreAllMocks())
const render = (records: Record<string, string> = {}, orderedIds: string[] = []) => renderToStaticMarkup(createElement(ClinicalModulePage, {
  module: 'auxiliaryExam', onBack: noop, onNext: noop, onReset: noop,
  auxiliaryExam: { records, orderedIds, onRecordChange: noop, onBack: noop, onNext: noop, onNavigate: noop },
}))

it('lists the same seven orders and opens only a requested report for Wang Xu', () => {
  const initial = render()
  expect(initial).toContain('开具心电图')
  expect(initial).not.toContain('窦速')
  expect(initial).not.toContain('胰腺炎征象。')
  expect(initial).toMatch(/<textarea[^>]*disabled/)
  const html = render({}, ['abdomen-ct'])
  expect(html.match(/role="tab"/g)).toHaveLength(7)
  expect(html).toContain('胰腺炎征象。')
  expect(html).toContain('腹腔、盆腔积液。')
  expect(html).toContain('查看腹部 CT影像')
  expect(html).toContain('/auxiliary-exam-images/abdomen-ct.png')
  expect(html).toContain('项目卡通患者模型')
  expect(html).toContain('进入诊断')
  expect(html).toContain('已开 1 项 · 已记录 0 项')
  expect(html).not.toContain('临床问诊实训')
})

it('counts filled records, preserves the selected record and shows it in the summary', () => {
  const html = render({ 'abdomen-ct': '腹腔、盆腔积液。', enzymes: '胰酶结果已记录。', blood: '  ' })
  expect(html).toContain('已开 2 项 · 已记录 2 项')
  expect(html).toContain('aria-valuenow="2"')
  expect(html).toMatch(/<textarea[^>]*>腹腔、盆腔积液。<\/textarea>/)
  expect(html).toContain('胰酶结果已记录。')
})

it('retains supplied laboratory precision, reference values and separate PCT meanings', () => {
  expect(auxiliaryReports.enzymes.values).toEqual([
    { label: '脂肪酶', code: 'Lipase', value: '4278', unit: 'U/L', flag: 'H', reference: '23–300' },
    { label: '淀粉酶', code: 'AMY', value: '670', unit: 'U/L', flag: 'H', reference: '30–110' },
  ])
  expect(auxiliaryReports['liver-kidney'].values).toHaveLength(26)
  expect(auxiliaryReports['liver-kidney'].values?.find((entry) => entry.code === 'Urea')).toMatchObject({ value: '24.09', unit: 'mmol/L', flag: 'H', reference: '2.90–8.20' })
  expect(auxiliaryReports.blood.values).toHaveLength(25)
  expect(auxiliaryReports.blood.values?.find((entry) => entry.code === 'HCT')).toMatchObject({ value: '39.100', flag: 'L', reference: '40–50' })
  expect(auxiliaryReports.blood.values?.find((entry) => entry.code === 'PCT')).toMatchObject({ label: '血小板压积', value: '0.150', unit: '', reference: '0.1–2.0' })
  const procalcitonin = auxiliaryReports.blood.values?.find((entry) => entry.label === '降钙素原')
  expect(procalcitonin).toMatchObject({ value: '＞100', unit: 'ng/mL' })
  expect(procalcitonin?.reference).toBeUndefined()
  expect(auxiliaryReports.ecg.findings?.[0]).toContain('窦速')
})

it('renders abnormal flags and leaves unspecified units and reference values blank', () => {
  const html = renderToStaticMarkup(createElement(LaboratoryTable, { values: auxiliaryReports.blood.values! }))
  expect(html).toContain('参考值')
  expect(html).toContain('↑ 偏高')
  expect(html).toContain('↓ 偏低')
  expect(html).toContain('正常')
  expect(html).toContain('血小板压积<small>PCT</small></th><td>0.150</td><td>—</td>')
  expect(html).toContain('PCT（降钙素原）</small></th><td>＞100</td><td>ng/mL</td><td><span class="aux-lab-flag">—</span></td><td>—</td>')
})

it.each(publicCases)('requires an order and shows seven reports belonging to $name', (entry) => {
  const patient: caseContext.TrainingCase = { ...entry, number: '02' }
  vi.spyOn(caseContext, 'useTrainingCase').mockReturnValue(patient)
  const exams = getAuxiliaryExams(patient)
  expect(exams.map(({ id, label }) => ({ id, label }))).toEqual(moduleItems.auxiliaryExam.map(({ id, label }) => ({ id, label })))
  const beforeOrder = render()
  expect(beforeOrder).toContain('开具心电图')
  expect(beforeOrder).not.toContain(entry.auxiliary[0].result)
  for (const [index, { id, label, report }] of exams.entries()) {
    const source = entry.auxiliary[index]
    expect(source.id).toBe(id)
    expect(report.simulated).toBe(true)
    expect(report.unavailable).toBeUndefined()
    const page = render({}, [id])
    expect(page).toContain(source.result)
    expect(page).toContain('教学模拟报告')
    expect(page).not.toMatch(/<textarea[^>]*disabled/)
    const viewer = renderToStaticMarkup(createElement(AuxiliaryReportViewer, { title: label, report, onClose: noop }))
    expect(viewer).toContain(`<b>${patient.name}</b>`)
    expect(viewer).toContain(`<b>${patient.sex}</b>`)
    expect(viewer).toContain(`<b>${patient.age} 岁</b>`)
    expect(viewer).toContain('教学模拟报告')
    expect(viewer).toContain('返回并记录')
    expect(viewer).not.toContain('王旭')
    expect(viewer).not.toContain('/auxiliary-exam-images/')
    expect(viewer).toContain(source.result)
    if (['blood', 'enzymes', 'liver-kidney'].includes(id)) {
      expect(viewer).toContain('<table')
      expect(report.values!.length).toBeGreaterThan(1)
      for (const row of report.values!) expect(viewer).toContain(row.value)
    }
  }
  const restored = render({ [exams[1].id]: '学生保存的检查记录' })
  expect(restored).toContain('已开 1 项 · 已记录 1 项')
  expect(restored).toContain('学生保存的检查记录')
  expect(restored).toContain(entry.auxiliary[1].result)
})
