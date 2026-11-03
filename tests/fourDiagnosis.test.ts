import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ClinicalModulePage } from '../src/clinical/ClinicalModulePage'
import { FourExaminationViewer } from '../src/clinical/FourExaminationViewer'
import { nextListeningSample } from '../src/clinical/PatientListening'

vi.mock('../src/exam/ExamScene', () => ({
  PatientPortrait: () => createElement('canvas', { 'aria-label': '项目卡通患者模型' }),
}))

const noop = () => {}
const fourDiagnosis = {
  messages: [], draft: '', status: 'input' as const, error: '', muted: true, records: {},
  onDraftChange: noop, onSend: noop, onStopReading: noop, onBack: noop,
  onNext: noop, onReset: noop, onNavigate: noop, onRecordChange: noop,
}
const render = (overrides = {}) => renderToStaticMarkup(createElement(ClinicalModulePage, {
  module: 'fourDiagnosis', onBack: noop, onNext: noop, onReset: noop,
  fourDiagnosis: { ...fourDiagnosis, ...overrides },
}))

it('shows four-diagnosis tools, empty record progress and an AI patient composer', () => {
  const html = render()
  expect(html).toContain('AI 患者 · 王旭')
  expect(html).toContain('aria-label="四诊项目"')
  expect(html.match(/role="tab"/g)).toHaveLength(5)
  expect(html).toContain('0/5 已记录')
  expect(html).toContain('aria-valuenow="0"')
  expect(html).toContain('placeholder="向王旭提问…"')
  expect(html).toContain('项目卡通患者模型')
  expect(html).not.toContain('左上腹疼了两天')
})

it('counts filled examination records rather than visited tools', () => {
  const html = render({ records: { look: '意识清楚，观察神色。', ask: '饮食后腹痛。', listen: '  ' } })
  expect(html).toContain('2/5 已记录')
  expect(html).toContain('aria-valuenow="2"')
  expect(html).toContain('意识清楚，观察神色。')
})

it('makes unavailable patient chat explicit and prevents sending', () => {
  const html = render({ status: 'unavailable', draft: '哪里疼？' })
  expect(html).toContain('模拟患者暂不可用')
  expect(html).toMatch(/<textarea[^>]*id="four-patient-question"[^>]*disabled=""/)
  expect(html).toMatch(/<button[^>]*aria-label="发送问题"[^>]*disabled=""/)
})

it('preserves the existing auxiliary examination page', () => {
  const html = renderToStaticMarkup(createElement(ClinicalModulePage, {
    module: 'auxiliaryExam', onBack: noop, onNext: noop, onReset: noop,
  }))
  expect(html).toContain('进入诊断')
  expect(html).toContain('腹部 CT')
  expect(html).not.toContain('AI 患者 · 王旭')
})

it('offers inspection material categories while keeping unconfirmed patient findings explicit', () => {
  const html = renderToStaticMarkup(createElement(FourExaminationViewer, { kind: 'look', muted: true, onStopReading: noop, onClose: noop }))
  expect(html).toContain('巩膜黄染')
  expect(html).toContain('面色红')
  expect(html).toContain('阳黄')
  expect(html).toContain('阴黄')
  expect(html).toContain('病例原始照片待教师提供')
  expect(html).toContain('舌诊观察实训')
  expect(html).toContain('当前病例固定使用一张舌象教学配图')
  expect(html).not.toContain('换一张')
  expect(html).not.toContain('完整舌象图谱')
})

it('keeps the recorded pulse result hidden until the practice is completed', () => {
  const html = renderToStaticMarkup(createElement(FourExaminationViewer, { kind: 'feel', muted: true, onStopReading: noop, onClose: noop }))
  expect(html).not.toContain('沉滑数')
  expect(html).toContain('正确完成布指练习后，可查看王旭原病例记录的脉象')
})

it('lets students listen before judging without exposing listening categories or the latest reply', () => {
  const html = renderToStaticMarkup(createElement(FourExaminationViewer, { kind: 'listen', muted: true, onStopReading: noop, onClose: noop }))
  expect(html).toContain('播放患者声音')
  expect(html).toContain('合成练习语音')
  expect(html).not.toContain('声音洪亮')
  expect(html).not.toContain('声音低沉')
  expect(html).not.toContain('口臭')
  expect(html).not.toContain('左上腹痛。')
})

it('varies listening phrases and speeds without adjacent repeats across a full cycle', () => {
  let previous: ReturnType<typeof nextListeningSample> | undefined
  const samples = Array.from({ length: 7 }, () => previous = nextListeningSample(previous))
  expect(new Set(samples.map((sample) => sample.text)).size).toBeGreaterThan(1)
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].text).not.toBe(samples[index - 1].text)
    expect(samples[index].speed).not.toBe(samples[index - 1].speed)
  }
})

it('offers contextual interview questions without automatically sending them', () => {
  const html = render()
  expect(html).toContain('常用追问')
  expect(html).toContain('点击填入问题，核对后发送')
  expect(html).toContain('疼痛是什么感觉')
})
