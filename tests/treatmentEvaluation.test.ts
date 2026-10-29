import { describe, expect, it } from 'vitest'
import { evaluateTreatment, validTreatmentSubmission } from '../server/treatmentEvaluation.mjs'
import { createInitialTreatmentPlan } from '../src/clinical/treatmentPlan'

const submission = (items = ['观察甲'], medications: any[] = []) => ({
  caseId: 'wang-xu', diagnosis: { primary: '训练诊断' },
  plan: { treatments: items.map((item, i) => ({ id: `t${i}`, category: '训练', item })), medications },
})
const rubric = {
  caseId: 'wang-xu', version: 'test-1', approved: true, exhaustive: true,
  approvedBy: '测试教师', reference: '仅供软件测试的非临床标准',
  required: [{ id: 'observe', label: '观察甲', target: 'treatment', accepted: ['观察甲', '甲项观察'], reason: '缺少甲项观察', reference: '测试标准第一条' }],
  forbidden: [{ id: 'wrong', label: '错误乙', target: 'treatment', accepted: ['执行乙'], reason: '本题明确排除乙', reference: '测试标准第二条' }],
  allowed: [{ id: 'diagnosis', label: '训练诊断', target: 'diagnosis', accepted: ['训练诊断'], reason: '测试诊断', reference: '仅供软件测试的非临床标准' }],
}

describe('teacher-grounded treatment evaluation', () => {
  it('never passes with an unapproved or missing teacher standard', () => {
    const result = evaluateTreatment(submission(), { ...rubric, approved: false })
    expect(result.status).toBe('pending_review')
    expect(result.checks.some((check: any) => check.outcome === 'unreviewed')).toBe(true)
    expect(result.message).toContain('教师')
    expect(evaluateTreatment(submission(), { ...rubric, approvedBy: '' }).status).toBe('pending_review')
    expect(evaluateTreatment(submission(), { ...rubric, reference: '' }).status).toBe('pending_review')
  })
  it('passes only covered, teacher-approved alternatives', () => {
    expect(evaluateTreatment(submission(['甲项观察']), rubric).status).toBe('passed')
    expect(evaluateTreatment(submission(['观察甲']), { ...rubric, exhaustive: false }).status).toBe('pending_review')
  })
  it('reports the exact missing and prohibited items with the teacher reference', () => {
    const result = evaluateTreatment(submission(['执行乙']), rubric)
    expect(result.status).toBe('needs_revision')
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'observe', outcome: 'missing', reason: '缺少甲项观察', reference: '测试标准第一条' }),
      expect.objectContaining({ id: 'wrong', outcome: 'incorrect', studentText: '执行乙', reason: '本题明确排除乙' }),
    ]))
  })
  it('does not pass negation, contradictions or unrecognized additions by keyword', () => {
    for (const items of [['不做观察甲'], ['观察甲，但不执行'], ['观察甲', '随意增加丙']]) {
      expect(evaluateTreatment(submission(items), rubric).status).not.toBe('passed')
    }
    expect(evaluateTreatment(submission(['观察甲', '不执行乙']), rubric).checks.some((check: any) => check.outcome === 'incorrect')).toBe(false)
  })
  it('keeps incomplete medication details visible without inventing doses', () => {
    const result = evaluateTreatment(submission([], [{ id: 'm', name: '学生用药', route: '', dose: '' }]), { ...rubric, approved: false })
    expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'missing', reason: expect.stringContaining('用药途径') })]))
    expect(result.status).toBe('needs_revision')
  })
  it('blocks an active treatment row with no category even before the clinical standard is reviewed', () => {
    const value = submission(); value.plan.treatments[0].category = ''
    const result = evaluateTreatment(value, { ...rubric, approved: false })
    expect(result.status).toBe('needs_revision')
    expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'missing', reason: expect.stringContaining('处置类别') })]))
  })
  it('blocks a custom category-only row but ignores untouched empty preset rows', () => {
    const value = submission(); value.plan.treatments.push({ id: 'custom', category: '其他', item: '' })
    expect(evaluateTreatment(value, rubric).status).toBe('needs_revision')
    expect(evaluateTreatment(value, { ...rubric, approved: false }).checks).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'missing', reason: expect.stringContaining('处置项目') })]))
    value.plan.treatments = [...submission().plan.treatments, ...createInitialTreatmentPlan().treatments]
    expect(evaluateTreatment(value, rubric).status).toBe('passed')
  })
  it('requires complete coverage and ignores a forged approval in student input', () => {
    expect(evaluateTreatment({ ...submission(), approved: true }, { ...rubric, approved: false }).status).toBe('pending_review')
    expect(evaluateTreatment(submission(), { ...rubric, caseId: 'another-case' }).status).toBe('pending_review')
    expect(evaluateTreatment(submission(), { ...rubric, required: [], allowed: [] }).status).not.toBe('passed')
  })
  it('validates real student content, row shape, length and duplicate IDs', () => {
    expect(validTreatmentSubmission(submission())).toBe(true)
    expect(validTreatmentSubmission(submission(['']))).toBe(false)
    expect(validTreatmentSubmission(submission(['x'.repeat(4001)]))).toBe(false)
    expect(validTreatmentSubmission({ ...submission(), caseId: 'other' })).toBe(false)
    expect(validTreatmentSubmission({ ...submission(), plan: { treatments: [{ item: '甲' }], medications: [] } })).toBe(false)
    const duplicate = submission(['观察甲', '观察乙']); duplicate.plan.treatments[1].id = 't0'
    expect(validTreatmentSubmission(duplicate)).toBe(false)
  })
})
