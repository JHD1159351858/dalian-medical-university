import type { PulseFinger } from './pulsePlacement'

export interface PulseCaseData {
  caseId: string
  positions: Record<PulseFinger, { label: string; light: string; deep: string }>
  options: string[]
}

export interface PulseAssessment {
  correct: boolean
  standardAnswer: string[]
  studentAnswer: string[]
  missed: string[]
  extra: string[]
  explanation: Record<string, string>
}

const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

export async function loadPulseCase(caseId: string, signal: AbortSignal): Promise<PulseCaseData> {
  const response = await fetch(`/api/pulse-exam?caseId=${encodeURIComponent(caseId)}`, { signal })
  const data: Partial<PulseCaseData> | null = await response.json().catch(() => null)
  if (!response.ok || !data || data.caseId !== caseId || !stringList(data.options) || !data.options.length ||
    !(['index', 'middle', 'ring'] as const).every((finger) => {
      const position = data.positions?.[finger]
      return position && [position.label, position.light, position.deep].every((text) => typeof text === 'string')
    })) throw new Error('病例脉诊资料暂不可用，请关闭后重试。')
  return data as PulseCaseData
}

export async function submitPulseAnswer(caseId: string, selected: string[], signal: AbortSignal): Promise<PulseAssessment> {
  const response = await fetch('/api/pulse-exam', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caseId, selected }), signal,
  })
  const data: Partial<PulseAssessment> | null = await response.json().catch(() => null)
  if (!response.ok || !data || typeof data.correct !== 'boolean' || !stringList(data.standardAnswer) || !data.standardAnswer.length ||
    !stringList(data.studentAnswer) || !stringList(data.missed) || !stringList(data.extra) ||
    !data.explanation || !data.standardAnswer.every((item) => typeof data.explanation?.[item] === 'string')) {
    throw new Error('脉象判断暂时无法核对，请重试。')
  }
  return data as PulseAssessment
}
