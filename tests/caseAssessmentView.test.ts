import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CaseAssessmentPanel } from '../src/clinical/CaseAssessmentPanel'
import type { CaseAssessment } from '../src/clinical/caseAssessment'

it('shows the server score and module feedback without the explanatory scope note', () => {
  const result: CaseAssessment = {
    caseId: 'wang-xu', version: 'test', source: 'case_reference', teacherApproved: false,
    score: 95, maxScore: 100, scopeNote: '按当前病例资料核对。',
    modules: [{ id: 'physicalExam', label: '体格检查', score: 10, maxScore: 15, checks: [{ id: 'skin', label: '皮肤与巩膜', score: 0, maxScore: 5, feedback: '本病例记载无黄染，请核对。' }] }],
  }
  const html = renderToStaticMarkup(createElement(CaseAssessmentPanel, { result }))
  expect(html).toContain('95')
  expect(html).toContain('/100')
  expect(html).toContain('体格检查')
  expect(html).toContain('10/15')
  expect(html).toContain('本病例记载无黄染，请核对。')
  expect(html).not.toContain('按当前病例资料核对。')
  expect(html).not.toContain('教师审核通过')
})
