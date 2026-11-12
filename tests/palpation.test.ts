import { describe, expect, it } from 'vitest'
import { palpationSpeech, resolvePalpationResponse } from '../src/exam/palpation'

describe('abdominal palpation response', () => {
  it('reports pressure tenderness immediately for the case positive region', () => {
    expect(resolvePalpationResponse('left-upper', 240)).toMatchObject({
      type: 'pressure',
      region: 'left-upper',
      expression: 'pain',
      result: 'tender',
    })
  })

  it('keeps a short press from being mistaken for rebound tenderness', () => {
    expect(resolvePalpationResponse('left-upper', 800)).toMatchObject({ type: 'pressure', result: 'tender' })
  })

  it('records the separate rebound test after a long hold while preserving the negative case finding', () => {
    expect(resolvePalpationResponse('left-upper', 1000)).toMatchObject({
      type: 'rebound',
      expression: 'severe-pain',
      result: 'no-rebound',
      isTeachingDemo: false,
    })
  })

  it('can show a positive rebound teaching demonstration without changing the case result', () => {
    expect(resolvePalpationResponse('left-upper', 1200, true)).toMatchObject({
      type: 'rebound',
      result: 'rebound-positive',
      isTeachingDemo: true,
    })
  })

  it('maps local findings to short, cacheable patient reactions', () => {
    expect(palpationSpeech(resolvePalpationResponse('left-upper', 240))).toEqual({ text: '这里有点疼。', emotion: 'sad' })
    expect(palpationSpeech(resolvePalpationResponse('left-upper', 1200, true))).toEqual({ text: '松开时剧烈疼痛。', emotion: 'sad' })
    expect(palpationSpeech(resolvePalpationResponse('center', 240))).toEqual({ text: '这里没有明显不适。', emotion: 'neutral' })
  })
})
