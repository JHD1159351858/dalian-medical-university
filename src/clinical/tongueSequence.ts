export const TONGUE_DURATION_MS = 8_000

export interface TongueSequence {
  progress: number
  playing: boolean
  sampleId: string
  photoRevealed: boolean
  answer: string
  submitted: boolean
}

export type TongueSequenceAction =
  | { type: 'play' | 'pause' | 'submit' }
  | { type: 'tick'; elapsedMs: number }
  | { type: 'seek'; progress: number }
  | { type: 'replay'; autoPlay: boolean }
  | { type: 'answer'; answer: string }
  | { type: 'next-photo'; sampleId: string }

export function createTongueSequence(sampleId: string): TongueSequence {
  return { progress: 0, playing: false, sampleId, photoRevealed: false, answer: '', submitted: false }
}

export function reduceTongueSequence(state: TongueSequence, action: TongueSequenceAction): TongueSequence {
  switch (action.type) {
    case 'play': return { ...state, progress: state.progress === 1 ? 0 : state.progress, playing: true }
    case 'pause': return { ...state, playing: false }
    case 'tick': {
      if (!state.playing) return state
      const progress = Math.min(1, state.progress + Math.max(0, action.elapsedMs) / TONGUE_DURATION_MS)
      return { ...state, progress, playing: progress < 1, photoRevealed: state.photoRevealed || progress === 1 }
    }
    case 'seek': {
      const progress = Math.min(1, Math.max(0, action.progress))
      return { ...state, progress, playing: false, photoRevealed: state.photoRevealed || progress === 1 }
    }
    case 'replay': return { ...state, progress: 0, playing: action.autoPlay }
    case 'answer': return state.photoRevealed ? { ...state, answer: action.answer, submitted: false } : state
    case 'submit': return state.photoRevealed && state.answer ? { ...state, submitted: true } : state
    case 'next-photo': return { ...createTongueSequence(action.sampleId), progress: 1, photoRevealed: true }
  }
}

export function tongueFrameBlend(progress: number): [number, number, number] {
  const firstFade = Math.min(1, Math.max(0, (progress - .25) / .2))
  const secondFade = Math.min(1, Math.max(0, (progress - .6) / .2))
  return [1 - firstFade, firstFade - secondFade, secondFade]
}
