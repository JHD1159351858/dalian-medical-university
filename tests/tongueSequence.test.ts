import { expect, it } from 'vitest'
import { createTongueSequence, reduceTongueSequence, tongueFrameBlend, TONGUE_DURATION_MS } from '../src/clinical/tongueSequence'
import { isTongueAnswerCorrect, selectTongueQuestion } from '../src/clinical/tongueSamples'

it('reveals the teacher photo only when the action finishes and stops at the end', () => {
  let state = createTongueSequence('tongue-2')
  expect(state.photoRevealed).toBe(false)
  state = reduceTongueSequence(state, { type: 'play' })
  state = reduceTongueSequence(state, { type: 'tick', elapsedMs: TONGUE_DURATION_MS / 2 })
  expect(state.progress).toBe(.5)
  expect(state.photoRevealed).toBe(false)
  state = reduceTongueSequence(state, { type: 'tick', elapsedMs: TONGUE_DURATION_MS })
  expect(state.progress).toBe(1)
  expect(state.photoRevealed).toBe(true)
  expect(state.playing).toBe(false)
})

it('keeps a question stable throughout playback, pause, seeking and replay', () => {
  let state = createTongueSequence('tongue-9')
  state = reduceTongueSequence(state, { type: 'play' })
  state = reduceTongueSequence(state, { type: 'pause' })
  const paused = reduceTongueSequence(state, { type: 'tick', elapsedMs: 2000 })
  expect(paused.progress).toBe(state.progress)
  state = reduceTongueSequence(state, { type: 'seek', progress: 1 })
  state = reduceTongueSequence(state, { type: 'answer', answer: '黄腻苔' })
  state = reduceTongueSequence(state, { type: 'submit' })
  state = reduceTongueSequence(state, { type: 'replay', autoPlay: true })
  expect(state.sampleId).toBe('tongue-9')
  expect(state.answer).toBe('黄腻苔')
  expect(state.submitted).toBe(true)
  expect(state.progress).toBe(0)
  expect(state.photoRevealed).toBe(true)
})

it('allows manual completion and clamps progress without requiring animation', () => {
  let state = createTongueSequence('tongue-3')
  state = reduceTongueSequence(state, { type: 'seek', progress: -.4 })
  expect(state.progress).toBe(0)
  state = reduceTongueSequence(state, { type: 'seek', progress: .5 })
  state = reduceTongueSequence(state, { type: 'seek', progress: 1.5 })
  expect(state.progress).toBe(1)
  expect(state.photoRevealed).toBe(true)
  expect(state.playing).toBe(false)
  state = reduceTongueSequence(state, { type: 'replay', autoPlay: false })
  expect(state.playing).toBe(false)
})

it('does not allow submission before observation or with an empty selection', () => {
  let state = createTongueSequence('tongue-1')
  state = reduceTongueSequence(state, { type: 'answer', answer: '薄白苔' })
  expect(state.answer).toBe('')
  state = reduceTongueSequence(state, { type: 'submit' })
  expect(state.submitted).toBe(false)
  state = reduceTongueSequence(state, { type: 'seek', progress: 1 })
  state = reduceTongueSequence(state, { type: 'submit' })
  expect(state.submitted).toBe(false)
})

it('resets answers and feedback for a new photo while preserving the completed observation pose', () => {
  let state = createTongueSequence('tongue-1')
  state = reduceTongueSequence(state, { type: 'seek', progress: 1 })
  state = reduceTongueSequence(state, { type: 'answer', answer: '薄白苔' })
  state = reduceTongueSequence(state, { type: 'submit' })
  const sample = selectTongueQuestion(state.sampleId, () => 0)
  state = reduceTongueSequence(state, { type: 'next-photo', sampleId: sample.id })
  expect(state.sampleId).not.toBe('tongue-1')
  expect(state.answer).toBe('')
  expect(state.submitted).toBe(false)
  expect(state.photoRevealed).toBe(true)
  expect(state.progress).toBe(1)
})

it('uses the existing source-label checks including the shared-photo alternative label', () => {
  const sample = selectTongueQuestion(undefined, () => 0)
  let state = createTongueSequence(sample.id)
  state = reduceTongueSequence(state, { type: 'seek', progress: 1 })
  state = reduceTongueSequence(state, { type: 'answer', answer: '薄白苔' })
  state = reduceTongueSequence(state, { type: 'submit' })
  expect(isTongueAnswerCorrect(sample, state.answer)).toBe(true)
  state = reduceTongueSequence(state, { type: 'answer', answer: '黄腻苔' })
  expect(state.submitted).toBe(false)
  expect(isTongueAnswerCorrect(sample, state.answer)).toBe(false)
})

it('crossfades between three realistic frames without changing their composition', () => {
  expect(tongueFrameBlend(0)).toEqual([1, 0, 0])
  expect(tongueFrameBlend(.5)).toEqual([0, 1, 0])
  expect(tongueFrameBlend(1)).toEqual([0, 0, 1])
  for (const progress of [.32, .39, .66, .72]) {
    expect(tongueFrameBlend(progress).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
  }
})
