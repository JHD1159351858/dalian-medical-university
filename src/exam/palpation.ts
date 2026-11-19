import type { SpeechEmotion } from '../diagnosis/speech'
import { wangPalpation, type PalpationFindings } from './caseExamItems'

export type PalpationRegion = 'right-upper' | 'upper' | 'left-upper' | 'right-middle' | 'center' | 'left-middle' | 'right-lower' | 'lower' | 'left-lower'

export type PalpationResponse = {
  type: 'pressure' | 'rebound'
  region: PalpationRegion
  expression: 'neutral' | 'pain' | 'severe-pain'
  result: 'normal' | 'tender' | 'no-rebound' | 'rebound-positive'
  isTeachingDemo: boolean
}

export function palpationSpeech(response: PalpationResponse, findings = wangPalpation): { text: string; emotion: SpeechEmotion } {
  if (response.result === 'tender') return { text: findings.painSpeech, emotion: 'sad' }
  if (response.result === 'rebound-positive') return { text: (!response.isTeachingDemo && findings.releaseSpeech) || '松开时剧烈疼痛。', emotion: 'sad' }
  return { text: '这里没有明显不适。', emotion: 'neutral' }
}

export function resolvePalpationResponse(region: PalpationRegion, holdDurationMs: number, teachingDemo = false, findings: PalpationFindings = wangPalpation): PalpationResponse {
  const tender = findings.tender.includes(region)
  if (holdDurationMs >= 1000) {
    const positive = teachingDemo || findings.rebound.includes(region)
    return {
      type: 'rebound', region, isTeachingDemo: teachingDemo,
      result: positive ? 'rebound-positive' : 'no-rebound',
      expression: positive || (findings === wangPalpation && tender) ? 'severe-pain' : tender || findings === wangPalpation ? 'pain' : 'neutral',
    }
  }
  return { type: 'pressure', region, expression: tender ? 'pain' : 'neutral', result: tender ? 'tender' : 'normal', isTeachingDemo: false }
}
