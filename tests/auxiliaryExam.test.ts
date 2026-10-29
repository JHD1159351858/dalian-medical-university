import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ClinicalModulePage } from '../src/clinical/ClinicalModulePage'
import { auxiliaryReports } from '../src/clinical/auxiliaryExamData'
import { LaboratoryTable } from '../src/clinical/AuxiliaryReportViewer'

vi.mock('../src/exam/ExamScene', () => ({ PatientPortrait: () => createElement('canvas', { 'aria-label': '项目卡通患者模型' }) }))
const noop = () => {}
const render = (records = {}) => renderToStaticMarkup(createElement(ClinicalModulePage, {
  module: 'auxiliaryExam', onBack: noop, onNext: noop, onReset: noop,
  auxiliaryExam: { records, onRecordChange: noop, onBack: noop, onNext: noop, onNavigate: noop },
}))

it('shows the seven reports, case findings and original cartoon patient', () => {
  const html = render()
  expect(html.match(/role="tab"/g)).toHaveLength(7)
  expect(html).toContain('胰腺炎征象。')
  expect(html).toContain('腹腔、盆腔积液。')
  expect(html).toContain('查看腹部 CT影像')
  expect(html).toContain('/auxiliary-exam-images/abdomen-ct.png')
  expect(html).toContain('项目卡通患者模型')
  expect(html).toContain('进入诊断')
  expect(html).toContain('0/7 已记录')
  expect(html).not.toContain('临床问诊实训')
})

it('counts filled records, preserves the selected record and shows it in the summary', () => {
  const html = render({ 'abdomen-ct': '腹腔、盆腔积液。', enzymes: '胰酶结果已记录。', blood: '  ' })
  expect(html).toContain('2/7 已记录')
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
