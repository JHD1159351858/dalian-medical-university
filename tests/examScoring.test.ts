import { describe, expect, it } from 'vitest'
import { physicalExamItems, scoreExamItem, scoreExamSession, type ExamValues } from '../src/exam/examData'

const valuesFor = (id: string): ExamValues => {
  const item = physicalExamItems.find((entry) => entry.id === id)
  if (!item) throw new Error(`missing exam item ${id}`)
  return Object.fromEntries(item.fields.map((field) => [field.id, field.answer]))
}

describe('physical exam scoring', () => {
  it('defines the 11 case items with two points each', () => {
    expect(physicalExamItems).toHaveLength(11)
    expect(physicalExamItems.every((item) => item.maxScore === 2)).toBe(true)
  })

  it('awards all points when every required field matches the case', () => {
    for (const item of physicalExamItems) {
      expect(scoreExamItem(item, valuesFor(item.id))).toMatchObject({ score: 2, completed: true })
    }
  })

  it('awards only correct fields and never subtracts for incorrect values', () => {
    const item = physicalExamItems.find((entry) => entry.id === 'vitals')!
    const values = valuesFor(item.id)
    values.temperature = '38.8'
    expect(scoreExamItem(item, values)).toMatchObject({ score: 1.5, completed: true })
  })

  it('does not award points for blank required fields', () => {
    const item = physicalExamItems.find((entry) => entry.id === 'heart')!
    expect(scoreExamItem(item, {})).toMatchObject({ score: 0, completed: false })
  })

  it('sums a session to 22 points when every item is correct', () => {
    const values = Object.fromEntries(physicalExamItems.map((item) => [item.id, valuesFor(item.id)]))
    expect(scoreExamSession(values)).toMatchObject({ score: 22, maxScore: 22, completed: 11 })
  })
})
