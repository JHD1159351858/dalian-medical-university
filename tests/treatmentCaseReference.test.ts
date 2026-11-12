import { describe, expect, it } from 'vitest'
import { evaluateTreatment, validTreatmentSubmission } from '../server/treatmentEvaluation.mjs'

const rubric = {
  caseId: 'wang-xu', basis: 'case_reference', approved: false, version: 'test-reference',
  reference: '测试病例表',
  treatments: [
    { id: 'observe', category: '监测及支持', item: '观察甲', aliases: ['甲项观察'], reference: '测试处置第一项' },
    { id: 'support', category: '监测及支持', item: '支持乙', reference: '测试处置第二项' },
  ],
  medications: [
    { id: 'med-a', name: '甲药', nameAliases: ['甲样药'], route: '演示途径', routeAliases: ['示例途径'], dose: '12mg', frequency: 'bid', reference: '测试用药第一项' },
    { id: 'formula', name: '乙方', route: '演示途径', dose: '药材甲10 药材乙（后下）15', ingredients: [{ name: '药材甲', amount: '10' }, { name: '药材乙（后下）', amount: '15' }], reference: '测试用药第二项' },
  ],
}

function submission() {
  return {
    caseId: 'wang-xu', diagnosis: { primary: '自由填写的诊断' },
    plan: {
      treatments: [{ id: 't1', category: '监测支持', item: '甲项观察、支持乙' }],
      medications: [
        { id: 'm1', name: '甲样药', route: '示例途径', dose: '１２ mg，每天两次' },
        { id: 'm2', name: '乙方', route: '演示途径', dose: '药材乙(后下)15\n药材甲10' },
      ],
    },
  }
}

describe('case reference treatment practice', () => {
  it('passes recognized bundled or split entries and marks the practice basis, ignoring diagnosis', () => {
    const result = evaluateTreatment(submission(), rubric)
    expect(result).toMatchObject({ status: 'passed', basis: 'case_reference', teacherApproved: false })
    expect(result.checks.every((check: any) => check.outcome === 'met')).toBe(true)
    const split = submission()
    split.plan.treatments = [{ id: 't1', category: '监测及支持', item: '观察甲' }, { id: 't2', category: '监测及支持', item: '支持乙' }]
    expect(evaluateTreatment(split, rubric).status).toBe('passed')
  })

  it('calls out the actual incorrect category and omitted treatment point', () => {
    const value = submission()
    value.plan.treatments = [{ id: 't1', category: '护理', item: '观察甲' }]
    const result = evaluateTreatment(value, rubric)
    expect(result.status).toBe('needs_revision')
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: 'incorrect', label: expect.stringContaining('处置第1行'), reason: expect.stringContaining('监测及支持'), studentText: expect.stringContaining('护理') }),
      expect.objectContaining({ outcome: 'missing', label: expect.stringContaining('支持乙'), reference: '测试处置第二项' }),
    ]))
  })

  it('never treats a negated or qualified statement as an exact positive match', () => {
    for (const item of ['不执行观察甲、支持乙', '观察甲，但不执行；支持乙']) {
      const value = submission()
      value.plan.treatments[0].item = item
      const result = evaluateTreatment(value, rubric)
      expect(result.status).toBe('needs_revision')
      expect(result.checks.some((check: any) => check.outcome === 'met' && check.label.includes('观察甲'))).toBe(false)
    }
  })

  it('gives distinct route, dose and frequency feedback for a recognized medication row', () => {
    const value = submission()
    value.plan.medications[0] = { id: 'm1', name: '甲药', route: '错误途径', dose: '13mg qd' }
    const result = evaluateTreatment(value, rubric)
    expect(result.status).toBe('needs_revision')
    for (const label of ['药物名称', '用药途径', '用药剂量', '用药频次']) {
      expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({
        label: expect.stringContaining(`用药第1行 · ${label}`),
        outcome: label === '药物名称' ? 'met' : 'incorrect',
      })]))
    }
  })

  it('treats a missing frequency and missing formula preparation note as revisions', () => {
    const value = submission()
    value.plan.medications[0].dose = '12mg'
    value.plan.medications[1].dose = '药材甲10 药材乙15'
    const result = evaluateTreatment(value, rubric)
    expect(result.status).toBe('needs_revision')
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '用药第1行 · 用药频次', outcome: 'missing' }),
      expect.objectContaining({ label: '用药第2行 · 用药剂量', outcome: 'incorrect', reason: expect.stringContaining('药材乙') }),
    ]))
  })

  it('keeps unlisted additions pending and does not infer clinical errors', () => {
    const value = submission()
    value.plan.treatments[0].item += '；其他项目'
    value.plan.medications.push({ id: 'extra', name: '额外药', route: '演示途径', dose: '额外内容' })
    const result = evaluateTreatment(value, rubric)
    expect(result.status).toBe('pending_review')
    expect(result.checks.filter((check: any) => check.outcome === 'unreviewed')).toHaveLength(2)
  })

  it('does not let a duplicate valid row hide a conflicting dose or frequency', () => {
    const value = submission()
    value.plan.medications.push({ ...value.plan.medications[0], id: 'm3' })
    const duplicate = evaluateTreatment(value, rubric)
    expect(duplicate.status).toBe('needs_revision')
    expect(duplicate.checks).toEqual(expect.arrayContaining([expect.objectContaining({
      label: '用药第3行 · 重复用药', outcome: 'incorrect', studentText: '甲样药',
    })]))
    value.plan.medications.pop()
    value.plan.medications.push({ ...value.plan.medications[0], id: 'm3', dose: '12mg tid' })
    expect(evaluateTreatment(value, rubric).status).toBe('needs_revision')
    const conflicting = submission()
    Object.assign(conflicting.plan.medications[0], { dose: '12mg bid', frequency: 'qd' })
    expect(validTreatmentSubmission(conflicting)).toBe(true)
    expect(evaluateTreatment(conflicting, rubric).status).toBe('needs_revision')
  })

  it('accepts exactly equivalent decimal masses without assigning an omitted unit', () => {
    const value = submission()
    value.plan.medications[0].dose = '0.012g bid'
    expect(evaluateTreatment(value, rubric).status).toBe('passed')
    for (const dose of ['0.012000000000000001g bid', '12 bid']) {
      value.plan.medications[0].dose = dose
      const result = evaluateTreatment(value, rubric)
      expect(result.status).toBe('needs_revision')
      expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ label: '用药第1行 · 用药剂量', outcome: 'incorrect' })]))
    }
  })

  it('leaves unparsed dose prose pending without reporting a missing frequency', () => {
    const value = submission()
    value.plan.medications[0].dose = '12mg bid，共3天'
    const result = evaluateTreatment(value, rubric)
    expect(result.status).toBe('pending_review')
    expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({
      label: '用药第1行 · 用药剂量', outcome: 'unreviewed', studentText: value.plan.medications[0].dose,
    })]))
    expect(result.checks.some((check: any) => check.label === '用药第1行 · 用药频次' && check.outcome === 'missing')).toBe(false)
    const formula = submission()
    formula.plan.medications[1].dose = '方药另行注明'
    expect(evaluateTreatment(formula, rubric)).toMatchObject({
      status: 'pending_review',
      checks: expect.arrayContaining([expect.objectContaining({ label: '用药第2行 · 用药剂量', outcome: 'unreviewed' })]),
    })
  })

  it('keeps malformed and cross-case references from passing', () => {
    for (const incomplete of [{ ...rubric, caseId: 'other-case' }, { ...rubric, treatments: [] }, { ...rubric, medications: [] }, { ...rubric, reference: '' }]) {
      const result = evaluateTreatment(submission(), incomplete)
      expect(result.status).toBe('pending_review')
      expect(result.checks).toEqual([expect.objectContaining({ id: 'case-reference', outcome: 'unreviewed' })])
    }
  })
})
