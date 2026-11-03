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

it('preserves the sample and answer when the completed sequence receives another start', () => {
  let state = createTongueSequence('tongue-9')
  state = reduceTongueSequence(state, { type: 'complete' })
  state = reduceTongueSequence(state, { type: 'answer', answer: '黄腻苔' })
  state = reduceTongueSequence(state, { type: 'submit' })
  expect(reduceTongueSequence(state, { type: 'play' })).toEqual(state)
  expect(state.sampleId).toBe('tongue-9')
  expect(state.progress).toBe(1)
  expect(state.submitted).toBe(true)
})

it('does not allow submission before observation or with an empty selection', () => {
  let state = createTongueSequence('tongue-1')
  state = reduceTongueSequence(state, { type: 'answer', answer: '薄白苔' })
  expect(state.answer).toBe('')
  state = reduceTongueSequence(state, { type: 'submit' })
  expect(state.submitted).toBe(false)
  state = reduceTongueSequence(state, { type: 'complete' })
  state = reduceTongueSequence(state, { type: 'submit' })
  expect(state.submitted).toBe(false)
})

it('starts a fresh observation only on opening a new trainer', () => {
  const state = createTongueSequence('tongue-2')
  expect(state.sampleId).toBe('tongue-2')
  expect(state.answer).toBe('')
  expect(state.submitted).toBe(false)
  expect(state.photoRevealed).toBe(false)
  expect(state.progress).toBe(0)
})

it('uses the existing source-label checks including the shared-photo alternative label', () => {
  const sample = selectTongueQuestion(undefined, () => 0)
  let state = createTongueSequence(sample.id)
  state = reduceTongueSequence(state, { type: 'complete' })
  state = reduceTongueSequence(state, { type: 'answer', answer: '薄白苔' })
  state = reduceTongueSequence(state, { type: 'submit' })
  expect(isTongueAnswerCorrect(sample, state.answer)).toBe(true)
  state = reduceTongueSequence(state, { type: 'answer', answer: '黄腻苔' })
  expect(state.submitted).toBe(false)
  expect(isTongueAnswerCorrect(sample, state.answer)).toBe(false)
})

it('crossfades between three action phases without changing their composition', () => {
  expect(tongueFrameBlend(0)).toEqual([1, 0, 0])
  expect(tongueFrameBlend(.5)).toEqual([0, 1, 0])
  expect(tongueFrameBlend(1)).toEqual([0, 0, 1])
  for (const progress of [.32, .39, .66, .72]) {
    expect(tongueFrameBlend(progress).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
  }
})
