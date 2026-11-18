import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import type { CaseAssessment } from '../src/clinical/caseAssessment'
import { EncounterRecordDetails, EncounterRecordsDialog, EncounterRecordsList } from '../src/records/EncounterRecordsDialog'
import type { EncounterRecord } from '../src/records/types'

const context = vi.hoisted(() => ({ access: 'signed_out' as 'signed_out' | 'unconfigured' }))
vi.mock('../src/records/EncounterRecordsProvider', () => ({
  useEncounterRecords: () => ({ access: context.access, studentId: null, saveState: 'idle', error: '', loadList: vi.fn(), loadRecord: vi.fn(), retrySave: vi.fn() }),
}))

afterEach(() => { context.access = 'signed_out' })
const noop = () => {}
const record: EncounterRecord = {
  id: 'encounter-a', caseId: 'wang-xu', patient: { name: '王旭', age: 48, sex: '男' },
  startedAt: '2026-11-12T10:00:00Z', endedAt: '2026-11-12T10:20:00Z', status: 'completed',
  snapshot: {
    messages: [{ role: 'user', content: '哪里不舒服？' }, { role: 'assistant', content: '我身体不舒服。' }],
    fourDiagnosis: { look: '学生记录的舌象。' }, auxiliaryExam: { blood: '学生记录的血常规。' },
    clinicalDiagnosis: { primary: '学生填写的主要诊断。' },
    treatment: { treatments: [{ id: 'nursing', category: '护理', item: '观察病情' }], medications: [{ id: 'med-a', name: '学生填写的药物', route: '口服', dose: '学生填写的剂量' }] },
    physicalExam: { orderedIds: ['inspection'], notes: { inspection: '学生填写的腹部检查。' }, submittedNotes: { inspection: '已提交的腹部所见。' }, history: [{ at: 500, region: 'left-upper', type: 'pressure', expression: 'pain', result: 'tender', isTeachingDemo: false }] },
  },
  submissions: [{ id: 'submission-a', kind: 'tongue', at: '2026-11-12T10:10:00Z', payload: { answer: '学生提交的舌象判断', observation: '学生提交的观察依据', correct: false } }],
}

it.each([
  ['signed_out', '请先登录学生账号'],
  ['unconfigured', '接诊记录服务尚未配置'],
] as const)('explains %s access without displaying invented records', (access, message) => {
  context.access = access
  const html = renderToStaticMarkup(createElement(EncounterRecordsDialog, { open: true, onClose: noop }))
  expect(html).toContain(message)
  expect(html).not.toContain('王旭')
  expect(html).not.toContain('查看详情')
})

it('lists patient identity, encounter status and pagination for saved records', () => {
  const html = renderToStaticMarkup(createElement(EncounterRecordsList, { records: [record], loading: false, hasMore: true, onSelect: noop, onLoadMore: noop }))
  expect(html).toContain('王旭')
  expect(html).toContain('48 岁')
  expect(html).toContain('已完成')
  expect(html).toContain('查看详情')
  expect(html).toContain('加载更多')
})

it('presents the saved clinical content and submissions as readable records', () => {
  const html = renderToStaticMarkup(createElement(EncounterRecordDetails, { record }))
  for (const text of ['问诊对话', '学生医生', '哪里不舒服？', '我身体不舒服。', '学生记录的舌象。', '学生记录的血常规。', '学生填写的主要诊断。', '观察病情', '学生填写的药物', '学生填写的腹部检查。', '已提交的腹部所见。', '左季肋区', '压痛', '历次提交', '学生提交的舌象判断', '学生提交的观察依据']) expect(html).toContain(text)
  expect(html).not.toContain('[object Object]')
  expect(html).not.toContain('&quot;fourDiagnosis&quot;')
  expect(html).toContain('这次接诊未保存整体评分。')
})

it('shows a saved zero-point final score once, with all six modules and feedback', () => {
  const result: CaseAssessment = {
    caseId: 'wang-xu', source: 'case_reference', teacherApproved: false, version: 'test', score: 0, maxScore: 100, scopeNote: '病例参考',
    modules: [
      { id: 'diagnosis', label: '问诊', score: 0, maxScore: 20, checks: [] },
      { id: 'physicalExam', label: '体格检查', score: 0, maxScore: 15, checks: [] },
      { id: 'fourDiagnosis', label: '中医四诊', score: 0, maxScore: 15, checks: [] },
      { id: 'auxiliaryExam', label: '辅助检查', score: 0, maxScore: 10, checks: [] },
      { id: 'clinicalDiagnosis', label: '诊断', score: 0, maxScore: 20, checks: [] },
      { id: 'treatment', label: '处置', score: 0, maxScore: 20, checks: [{ id: 'plan', label: '处置方案', score: 0, maxScore: 20, feedback: '尚未填写处置方案。' }] },
    ],
  }
  const submitted: EncounterRecord = {
    ...record,
    submissions: [
      { id: 'previous-completion', kind: 'treatment', at: '2026-11-12T10:19:00Z', payload: { completed: true } },
      { id: 'final', kind: 'treatment', at: '2026-11-12T10:20:00Z', payload: { completed: true, caseAssessment: result } },
    ],
  }
  const html = renderToStaticMarkup(createElement(EncounterRecordDetails, { record: submitted }))
  expect(html).toContain('<span>0</span>/100')
  expect(html.match(/<summary>/g)).toHaveLength(6)
  expect(html.match(/尚未填写处置方案。/g)).toHaveLength(1)
  expect(html).not.toContain('这次接诊未保存整体评分。')
})
