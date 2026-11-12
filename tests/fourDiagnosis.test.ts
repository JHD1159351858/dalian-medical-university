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
const examinationProps = { muted: true, record: '', onRecordChange: noop, onStopReading: noop, onClose: noop }
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

it('opens tongue inspection directly with the fixed case photo', () => {
  const html = renderToStaticMarkup(createElement(FourExaminationViewer, { ...examinationProps, kind: 'look' }))
  expect(html).not.toMatch(/望诊素材分类|巩膜黄染|面色红|阳黄|阴黄/)
  expect(html).toContain('病例原始照片待教师提供')
  expect(html).toContain('舌诊观察实训')
  expect(html).toContain('当前病例固定使用一张舌象教学配图')
  expect(html).not.toContain('换一张')
  expect(html).not.toContain('完整舌象图谱')
})

it('keeps the recorded pulse result hidden until the practice is completed', () => {
  const html = renderToStaticMarkup(createElement(FourExaminationViewer, { ...examinationProps, kind: 'feel' }))
  expect(html).not.toContain('沉滑数')
  expect(html).toContain('正确完成布指练习后，可查看王旭原病例记录的脉象')
})

it('lets students listen before judging without exposing listening categories or the latest reply', () => {
  const html = renderToStaticMarkup(createElement(FourExaminationViewer, { ...examinationProps, kind: 'listen' }))
  expect(html).toContain('播放患者声音')
  expect(html).toContain('合成练习语音')
  expect(html).not.toContain('声音洪亮')
  expect(html).not.toContain('声音低沉')
  expect(html).not.toContain('口臭')
  expect(html).not.toContain('左上腹痛。')
})

it('varies listening phrases at conversational speeds without adjacent repeats', () => {
  let previous: ReturnType<typeof nextListeningSample> | undefined
  const samples = Array.from({ length: 7 }, () => previous = nextListeningSample(previous))
  expect(new Set(samples.map((sample) => sample.text)).size).toBeGreaterThan(1)
  expect(samples.every(({ speed }) => speed >= 0.92 && speed <= 1.04)).toBe(true)
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].text).not.toBe(samples[index - 1].text)
    expect(samples[index].speed).not.toBe(samples[index - 1].speed)
  }
})

it.each([
  ['look', '望诊观察记录', '你看到了哪些舌色、舌形和舌苔特征'],
  ['listen', '闻诊观察记录', '你听到的音量、语速和语调有什么特点'],
  ['feel', '切诊观察记录', '你如何定位寸、关、尺'],
  ['ask', '问诊要点记录', '患者对你的追问作出了哪些回答'],
] as const)('offers a mode-specific prompt and the current record in the %s dialog', (kind, label, prompt) => {
  const html = renderToStaticMarkup(createElement(FourExaminationViewer, { ...examinationProps, kind, record: '已填写的记录' }))
  expect(html).toContain(label)
  expect(html).toContain(prompt)
  expect(html).toContain('已填写的记录')
})

it('keeps symptom interview suggestions out of the default observation view', () => {
  expect(render()).not.toContain('常用追问')
})
