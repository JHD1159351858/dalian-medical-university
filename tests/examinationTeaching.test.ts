import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PulseTeaching, TongueTeaching } from '../src/clinical/ExaminationTeaching'
import { PULSE_STEPS, TONGUE_STEPS, reduceTeachingPlayback } from '../src/clinical/teachingSteps'

it('pauses without advancing and resumes from the current teaching step', () => {
  const paused = reduceTeachingPlayback({ step: 2, playing: true }, { type: 'pause' }, PULSE_STEPS.length)
  expect(paused).toEqual({ step: 2, playing: false })
  expect(reduceTeachingPlayback(paused, { type: 'tick' }, PULSE_STEPS.length)).toEqual(paused)
  expect(reduceTeachingPlayback(paused, { type: 'play' }, PULSE_STEPS.length)).toEqual({ step: 2, playing: true })
})

it('advances in order and stops at the final step', () => {
  let state = { step: 0, playing: true }
  for (let step = 1; step < PULSE_STEPS.length; step++) {
    state = reduceTeachingPlayback(state, { type: 'tick' }, PULSE_STEPS.length)
    expect(state.step).toBe(step)
  }
  expect(state.playing).toBe(false)
  expect(reduceTeachingPlayback(state, { type: 'tick' }, PULSE_STEPS.length)).toEqual(state)
})

it('replays from the beginning and allows reduced-motion replay without autoplay', () => {
  const state = { step: PULSE_STEPS.length - 1, playing: false }
  expect(reduceTeachingPlayback(state, { type: 'replay', autoPlay: true }, PULSE_STEPS.length)).toEqual({ step: 0, playing: true })
  expect(reduceTeachingPlayback(state, { type: 'replay', autoPlay: false }, PULSE_STEPS.length)).toEqual({ step: 0, playing: false })
  expect(reduceTeachingPlayback(state, { type: 'play' }, PULSE_STEPS.length)).toEqual({ step: 0, playing: true })
})

it('supports manual steps in both directions without starting playback or crossing boundaries', () => {
  expect(reduceTeachingPlayback({ step: 0, playing: false }, { type: 'previous' }, TONGUE_STEPS.length)).toEqual({ step: 0, playing: false })
  expect(reduceTeachingPlayback({ step: 0, playing: true }, { type: 'next' }, TONGUE_STEPS.length)).toEqual({ step: 1, playing: false })
  expect(reduceTeachingPlayback({ step: 2, playing: true }, { type: 'previous' }, TONGUE_STEPS.length)).toEqual({ step: 1, playing: false })
  expect(reduceTeachingPlayback({ step: 3, playing: false }, { type: 'next' }, TONGUE_STEPS.length)).toEqual({ step: 3, playing: false })
})

it('places the middle finger before index and ring fingers and includes tongue extension', () => {
  expect(PULSE_STEPS.map((step) => step.title)).toEqual(['准备诊脉', '患者伸手', '中指定关', '食指定位寸', '无名指定位尺', '三指布指完成'])
  expect(TONGUE_STEPS.map((step) => step.title)).toEqual(['准备观察', '患者张口', '患者伸舌', '保持观察'])
})

it('renders realistic photographic workspaces and interactive controls without invented case findings', () => {
  const tongue = renderToStaticMarkup(createElement(TongueTeaching))
  const pulse = renderToStaticMarkup(createElement(PulseTeaching))
  expect(tongue).toContain('aria-label="舌诊观察实训"')
  for (const frame of ['ready', 'open', 'extended']) expect(tongue).toContain(`/four-exam-images/realistic/tongue-${frame}.png`)
  expect(tongue).toContain('先完成张口伸舌演示')
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
