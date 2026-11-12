export const TONGUE_DURATION_MS = 2_000

export interface TongueSequence {
  progress: number
  playing: boolean
  sampleId: string
  photoRevealed: boolean
  answer: string
  submitted: boolean
}

export type TongueSequenceAction =
  | { type: 'play' | 'complete' | 'submit' }
  | { type: 'tick'; elapsedMs: number }
  | { type: 'answer'; answer: string }

export function createTongueSequence(sampleId: string): TongueSequence {
  return { progress: 0, playing: false, sampleId, photoRevealed: false, answer: '', submitted: false }
}

export function reduceTongueSequence(state: TongueSequence, action: TongueSequenceAction): TongueSequence {
  switch (action.type) {
    case 'play': return state.photoRevealed ? state : { ...state, playing: true }
    case 'complete': return { ...state, progress: 1, playing: false, photoRevealed: true }
    case 'tick': {
      if (!state.playing) return state
      const progress = Math.min(1, state.progress + Math.max(0, action.elapsedMs) / TONGUE_DURATION_MS)
      return { ...state, progress, playing: progress < 1, photoRevealed: state.photoRevealed || progress === 1 }
    }
    case 'answer': return state.photoRevealed ? { ...state, answer: action.answer, submitted: false } : state
    case 'submit': return state.photoRevealed && state.answer ? { ...state, submitted: true } : state
  }
}

export function tongueFrameBlend(progress: number): [number, number, number] {
  const firstFade = Math.min(1, Math.max(0, (progress - .25) / .2))
  const secondFade = Math.min(1, Math.max(0, (progress - .6) / .2))
  return [1 - firstFade, firstFade - secondFade, secondFade]
}
