import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import cases from '../server/training-cases.json'
import { wangXu, type TrainingCase } from '../src/cases/selectedCase'
import { hisCategories, patientExamItems } from '../src/exam/caseExamItems'
import { getOrderedExamReports, updateOrderedExamIds } from '../src/exam/examWorkflow'
import { ExamInteractionPanel } from '../src/exam/ExamInteractionPanel'
import { palpationSpeech, resolvePalpationResponse, type PalpationRegion } from '../src/exam/palpation'

const fixed = patientExamItems(wangXu)
const regions: PalpationRegion[] = ['right-upper', 'upper', 'left-upper', 'right-middle', 'center', 'left-middle', 'right-lower', 'lower', 'left-lower']
const expectedSites: Record<string, PalpationRegion> = { 'lin-yue': 'right-upper', 'chen-yang': 'right-lower', 'zhou-ning': 'upper', 'zhao-hang': 'center', 'sun-lan': 'right-middle' }
const controls = (patient: Pick<TrainingCase, 'id' | 'name' | 'physical'>, id: string) => {
  const item = patientExamItems(patient).find(entry => entry.id === id)!
  return renderToStaticMarkup(createElement(ExamInteractionPanel, {
    itemId: id, selectedRegion: '脐区', vitals: item.vitals, patientName: patient.name,
    enabled: true, children: null, onOpenComputer: () => {}, onObserve: () => {},
  }))
}

it.each(cases)('uses the same eleven orders, instruments and HIS categories with personal findings for $name', (row) => {
  const patient = { ...row, number: '02' }
  const items = patientExamItems(patient)
  const ids = fixed.map(item => item.id)
  expect(items.map(({ id, label, hint, category }) => ({ id, label, hint, category }))).toEqual(fixed.map(({ id, label, hint, category }) => ({ id, label, hint, category })))
  expect(updateOrderedExamIds([], ids, [], items)).toEqual(ids)
  expect(getOrderedExamReports(ids, items)).toEqual(items)
  expect(items.map(item => item.report)).toEqual(patient.physical.map(item => item.result))
  for (const item of items) {
    expect(hisCategories).toContain(item.category)
    const panel = controls(patient, item.id)
    expect(panel).not.toContain('王旭')
    expect(panel).not.toContain('选择一项已开具的检查')
    const source = controls(wangXu, item.id)
    expect(panel.match(/(?:src="[^"]+"|class="(?:monitor-scene|medical-illustration [^"]+|abdomen-map [^"]+|exam-report-screen)")/gu)).toEqual(source.match(/(?:src="[^"]+"|class="(?:monitor-scene|medical-illustration [^"]+|abdomen-map [^"]+|exam-report-screen)")/gu))
  }
  const { vitals, report } = items[0]
  expect(vitals).toBeDefined()
  for (const value of Object.values(vitals!)) {
    expect(report).toContain(String(value))
    expect(controls(patient, 'vitals')).toContain('<strong>' + value + '</strong>')
  }
})

it.each(cases)('distinguishes pressure, release and the independent teaching demonstration in all nine regions for $name', (row) => {
  const findings = patientExamItems(row).find(item => item.id === 'inspection')!.palpation!
  expect(findings).toBeDefined()
  for (const region of regions) {
    const pressure = resolvePalpationResponse(region, 200, false, findings)
    const rebound = resolvePalpationResponse(region, 1100, false, findings)
    const reboundExpected = row.id === 'chen-yang' && region === 'right-lower'
    expect(pressure.result).toBe(region === expectedSites[row.id] ? 'tender' : 'normal')
    expect(rebound).toMatchObject({ isTeachingDemo: false, result: reboundExpected ? 'rebound-positive' : 'no-rebound' })
    if (pressure.result === 'tender') expect(palpationSpeech(pressure, findings).text).toBe(findings.painSpeech)
    if (reboundExpected) expect(palpationSpeech(rebound, findings).text).toBe(findings.releaseSpeech)
    expect(resolvePalpationResponse(region, 1100, true, findings)).toMatchObject({ result: 'rebound-positive', isTeachingDemo: true })
  }
})
