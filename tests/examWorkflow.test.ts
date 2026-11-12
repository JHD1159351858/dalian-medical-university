import { describe, expect, it } from 'vitest'
import { getOrderedExamReports, updateOrderedExamIds } from '../src/exam/examWorkflow'
import { physicalExamItems } from '../src/exam/examData'

describe('physical exam order and report workflow', () => {
  it('keeps completed or started items on the order while applying new selections', () => {
    expect(updateOrderedExamIds(
      ['vitals', 'skin', 'inspection'],
      ['skin', 'bowel'],
      ['vitals', 'inspection'],
    )).toEqual(['vitals', 'skin', 'inspection', 'bowel'])
  })

  it('shows case reports for every ordered item without a separate examination-complete step', () => {
    const ordered = ['vitals', 'skin', 'inspection']

    expect(getOrderedExamReports([])).toEqual([])
    expect(getOrderedExamReports(ordered).map(({ id }) => id)).toEqual(ordered)
    expect(getOrderedExamReports(ordered)).toMatchObject([
      { id: 'vitals', report: '体温 37.5℃；脉搏 118 次/分；呼吸 32 次/分；血压 149/92 mmHg。' },
      { id: 'skin', report: expect.stringContaining('散在大片白色色素沉着') },
      { id: 'inspection', report: expect.stringContaining('左上腹压痛明显') },
    ])
  })

  it('provides the case report for all 11 physical examination items', () => {
    expect(physicalExamItems).toHaveLength(11)
    expect(physicalExamItems.every((item) => item.report.trim().length > 0)).toBe(true)
    expect(physicalExamItems.find((item) => item.id === 'skin')?.report)
      .toContain('散在大片白色色素沉着')
    expect(physicalExamItems.find((item) => item.id === 'bowel')?.report)
      .toBe('肠鸣音减弱，2 次/分。')
  })
})
