import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PulseTeaching, TongueTeaching } from '../src/clinical/ExaminationTeaching'
it('renders the training patient and photographic pulse workspace without invented case findings', () => {
  const tongue = renderToStaticMarkup(createElement(TongueTeaching))
  const pulse = renderToStaticMarkup(createElement(PulseTeaching))
  expect(tongue).toContain('aria-label="舌诊观察实训"')
  expect(tongue).toContain('/four-exam-images/tongue-patient-portrait.png')
  expect(tongue).toContain('正在演示张口伸舌')
  expect(tongue).not.toContain('播放舌诊演示')
  expect(tongue).not.toContain('舌诊动作进度')
  expect(tongue).not.toContain('换一张')
  expect(pulse).toContain('aria-label="脉诊操作实训"')
  expect(pulse).toContain('/four-exam-images/realistic/pulse-arm.png')
  for (const count of [1, 2, 3]) expect(pulse).toContain(`/four-exam-images/realistic/doctor-hand-${count}.png`)
  expect(pulse).toContain('拖动练习')
  expect(pulse).toContain('学习提示')
  expect(pulse).toContain('中指定关')
  expect(pulse).not.toContain('沉滑数')
  expect(pulse).not.toContain('teaching-doctor-finger')
  expect(tongue).not.toContain('teaching-mouth-cavity')
})
