import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { PhysicalExamPage } from '../src/exam/PhysicalExamPage'
import type { PalpationResponse } from '../src/exam/palpation'

const records = vi.hoisted(() => ({
  physicalExam: null as null | {
    orderedIds: string[]
    notes: Record<string, string>
    submittedNotes: Record<string, string>
    history: Array<PalpationResponse & { at: number }>
  },
  recordSubmission: vi.fn(),
  updatePhysicalExam: vi.fn(),
}))

vi.mock('../src/records/EncounterRecordsProvider', () => ({ useEncounterRecords: () => records }))
vi.mock('../src/exam/ExamScene', () => ({ ExamScene: () => createElement('canvas') }))
const noop = () => {}
const render = () => renderToStaticMarkup(createElement(PhysicalExamPage, {
  muted: true, onBack: noop, onFinish: noop, onReset: noop,
}))

beforeEach(() => {
  records.physicalExam = null
  vi.clearAllMocks()
})

it('restores ordered examinations, submitted notes and palpation history when returning to the module', () => {
  records.physicalExam = {
    orderedIds: ['vitals', 'inspection'],
    notes: { vitals: '体温与脉搏已记录' },
    submittedNotes: { vitals: '体温与脉搏已记录' },
    history: [{ region: 'left-upper', type: 'pressure', result: 'tender', expression: 'pain', isTeachingDemo: false, at: 1_000 }],
  }
  const html = render()
  expect(html).toContain('已开具 2 项')
  expect(html).toContain('已填写 1 项')
  expect(html).toContain('体温与脉搏已记录')
  expect(html).toContain('本项记录已提交，可继续修改后再次提交')
  expect(html).toContain('左季肋区 · 压痛')
  expect(html).not.toContain('还没有触诊记录')
  expect(records.recordSubmission).not.toHaveBeenCalled()
})

it('starts with a blank physical examination when the encounter has no saved snapshot', () => {
  const html = render()
  expect(html).toContain('还没有开具检查')
  expect(html).toContain('还没有触诊记录')
  expect(records.recordSubmission).not.toHaveBeenCalled()
})
