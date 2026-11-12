import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ClinicalModulePage } from '../src/clinical/ClinicalModulePage'

vi.mock('../src/exam/ExamScene', () => ({ PatientPortrait: () => createElement('canvas', { 'aria-label': '项目卡通患者模型' }) }))
const noop = () => {}
const render = (records = {}) => renderToStaticMarkup(createElement(ClinicalModulePage, {
  module: 'clinicalDiagnosis', onBack: noop, onNext: noop, onReset: noop,
  clinicalDiagnosis: { records, onRecordChange: noop, onBack: noop, onNext: noop, onNavigate: noop },
}))

it('shows all four independently labelled diagnosis inputs without selecting a module first', () => {
  const html = render()
  expect(html.match(/<textarea/g)).toHaveLength(4)
  for (const label of ['西医主要诊断', '西医次要诊断', '中医诊断', '诊断总结']) {
    expect(html).toContain(`aria-label="${label}"`)
  }
  expect(html).toContain('项目卡通患者模型')
  expect(html).toContain('返回上一步')
  expect(html).toContain('进入处置')
  expect(html).not.toContain('临床问诊实训')
})

it('keeps each diagnosis in its own input and counts only nonempty entries', () => {
  const html = render({ primary: '学生填写的主要诊断', secondary: '  ', tcm: '学生填写的中医病名与证候依据', summary: '' })
  expect(html).toMatch(/<textarea[^>]*aria-label="西医主要诊断"[^>]*>学生填写的主要诊断<\/textarea>/)
  expect(html).toMatch(/<textarea[^>]*aria-label="中医诊断"[^>]*>学生填写的中医病名与证候依据<\/textarea>/)
  expect(html).toContain('aria-valuenow="2"')
  expect(html).toContain('aria-valuemax="4"')
})

it('starts with empty inputs and reports all four completed once they are filled', () => {
  expect(render().match(/<textarea[^>]*><\/textarea>/g)).toHaveLength(4)
  expect(render()).toContain('aria-valuenow="0"')
  const html = render({ primary: '主要诊断', secondary: '并存疾病', tcm: '中医诊断', summary: '诊断总结' })
  expect(html).toContain('aria-valuenow="4"')
})
