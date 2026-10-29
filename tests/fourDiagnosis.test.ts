import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ClinicalModulePage } from '../src/clinical/ClinicalModulePage'

vi.mock('../src/exam/ExamScene', () => ({
  PatientPortrait: () => createElement('canvas', { 'aria-label': '项目卡通患者模型' }),
}))

const noop = () => {}
const fourDiagnosis = {
  messages: [], draft: '', status: 'input' as const, error: '', muted: true, records: {},
  onDraftChange: noop, onSend: noop, onStopReading: noop, onBack: noop,
  onNext: noop, onReset: noop, onNavigate: noop, onRecordChange: noop,
}
const render = (overrides = {}) => renderToStaticMarkup(createElement(ClinicalModulePage, {
  module: 'fourDiagnosis', onBack: noop, onNext: noop, onReset: noop,
  fourDiagnosis: { ...fourDiagnosis, ...overrides },
}))

it('shows four-diagnosis tools, empty record progress and an AI patient composer', () => {
  const html = render()
  expect(html).toContain('AI 患者 · 王旭')
  expect(html).toContain('aria-label="四诊项目"')
  expect(html.match(/role="tab"/g)).toHaveLength(5)
  expect(html).toContain('0/5 已记录')
  expect(html).toContain('aria-valuenow="0"')
  expect(html).toContain('placeholder="向王旭提问…"')
  expect(html).toContain('项目卡通患者模型')
  expect(html).not.toContain('左上腹疼了两天')
})

it('counts filled examination records rather than visited tools', () => {
  const html = render({ records: { look: '意识清楚，观察神色。', ask: '饮食后腹痛。', listen: '  ' } })
  expect(html).toContain('2/5 已记录')
  expect(html).toContain('aria-valuenow="2"')
  expect(html).toContain('意识清楚，观察神色。')
})

it('makes unavailable patient chat explicit and prevents sending', () => {
  const html = render({ status: 'unavailable', draft: '哪里疼？' })
  expect(html).toContain('模拟患者暂不可用')
  expect(html).toMatch(/<textarea[^>]*id="four-patient-question"[^>]*disabled=""/)
  expect(html).toMatch(/<button[^>]*aria-label="发送问题"[^>]*disabled=""/)
})

it('preserves the existing auxiliary examination page', () => {
  const html = renderToStaticMarkup(createElement(ClinicalModulePage, {
    module: 'auxiliaryExam', onBack: noop, onNext: noop, onReset: noop,
  }))
  expect(html).toContain('进入诊断')
  expect(html).toContain('腹部 CT')
  expect(html).not.toContain('AI 患者 · 王旭')
})
