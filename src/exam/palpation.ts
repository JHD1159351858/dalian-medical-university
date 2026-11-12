import type { SpeechEmotion } from '../diagnosis/speech'

export type PalpationRegion = 'right-upper' | 'upper' | 'left-upper' | 'right-middle' | 'center' | 'left-middle' | 'right-lower' | 'lower' | 'left-lower'

export type PalpationResponse = {
  type: 'pressure' | 'rebound'
  region: PalpationRegion
  expression: 'neutral' | 'pain' | 'severe-pain'
  result: 'normal' | 'tender' | 'no-rebound' | 'rebound-positive'
  isTeachingDemo: boolean
}

export function palpationSpeech(response: PalpationResponse): { text: string; emotion: SpeechEmotion } {
  if (response.result === 'tender') return { text: '这里有点疼。', emotion: 'sad' }
  if (response.result === 'rebound-positive') return { text: '松开时剧烈疼痛。', emotion: 'sad' }
  return { text: '这里没有明显不适。', emotion: 'neutral' }
}

export function resolvePalpationResponse(region: PalpationRegion, holdDurationMs: number, teachingDemo = false): PalpationResponse {
  const isLeftUpper = region === 'left-upper'
  if (holdDurationMs >= 1000) {
    return {
      type: 'rebound',
      region,
      expression: teachingDemo ? 'severe-pain' : isLeftUpper ? 'severe-pain' : 'pain',
      result: teachingDemo ? 'rebound-positive' : 'no-rebound',
      isTeachingDemo: teachingDemo,
    }
  }
  return {
    type: 'pressure',
    region,
    expression: isLeftUpper ? 'pain' : 'neutral',
    result: isLeftUpper ? 'tender' : 'normal',
    isTeachingDemo: false,
  }
}
