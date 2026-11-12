import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ClinicalModulePage } from '../src/clinical/ClinicalModulePage'
import { createInitialTreatmentPlan, type TreatmentPlan } from '../src/clinical/treatmentPlan'

vi.mock('../src/exam/ExamScene', () => ({ PatientPortrait: () => createElement('canvas', { 'aria-label': '项目卡通患者模型' }) }))
const noop = () => {}
const render = (plan = createInitialTreatmentPlan()) => renderToStaticMarkup(createElement(ClinicalModulePage, {
  module: 'treatment', onBack: noop, onNext: noop, onReset: noop,
  treatment: { plan, onPlanChange: noop, onBack: noop, onFinish: noop, onNavigate: noop },
}))

it('shows separate treatment and medication checklists with blank student answers', () => {
  const html = render()
  for (const label of ['处置类别', '处置项目', '药物名称', '用药途径', '用药剂量', '添加处置行', '添加用药行']) expect(html).toContain(label)
  expect(html.match(/<table/g)).toHaveLength(2)
  expect(html).toContain('第6行处置类别')
  expect(html).toContain('第1行药物名称')
  expect(html).toContain('项目卡通患者模型')
  expect(html).toContain('完成病例')
  expect(html).not.toContain('临床问诊实训')
  expect(createInitialTreatmentPlan().treatments.every((row) => row.item === '')).toBe(true)
  expect(createInitialTreatmentPlan().medications[0]).toMatchObject({ name: '', route: '', dose: '' })
})

it('preserves independent rows and multiline dose information', () => {
  const plan: TreatmentPlan = {
    treatments: [{ id: 't1', category: '学生类别一', item: '学生处置一' }, { id: 't2', category: '学生类别二', item: '学生处置二' }],
    medications: [{ id: 'm1', name: '学生用药一', route: '学生途径一', dose: '第一行剂量\n第二行剂量' }, { id: 'm2', name: '学生用药二', route: '学生途径二', dose: '第二项剂量' }],
  }
  const html = render(plan)
  expect(html).toMatch(/<textarea[^>]*aria-label="第1行用药剂量"[^>]*>第一行剂量\n第二行剂量<\/textarea>/)
  expect(html).toMatch(/<textarea[^>]*aria-label="第2行药物名称"[^>]*>学生用药二<\/textarea>/)
  expect(html).toContain('删除处置第2行')
  expect(html).toContain('删除用药第2行')
})

it('creates fresh empty checklists when training is reset', () => {
  const previous = createInitialTreatmentPlan()
  previous.treatments[0].item = '之前的处置内容'
  previous.medications[0].dose = '之前的用药剂量'
  previous.medications.push({ id: 'added', name: '新增药物', route: '', dose: '' })
  const fresh = createInitialTreatmentPlan()
  expect(fresh.treatments[0].item).toBe('')
  expect(fresh.medications).toHaveLength(1)
  expect(fresh.medications[0].dose).toBe('')
})
