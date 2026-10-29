export const TONGUE_STEPS = [
  { title: '准备观察', detail: '请患者面向观察者，放松口面部。' },
  { title: '患者张口', detail: '患者自然张口，准备伸舌。' },
  { title: '患者伸舌', detail: '患者将舌体自然伸出口外，便于观察。' },
  { title: '保持观察', detail: '观察舌质、舌形与舌苔；本动画仅演示动作，不代表本病例舌象。' },
] as const

export const PULSE_STEPS = [
  { title: '准备诊脉', detail: '请患者放松手臂，准备将前臂放于脉枕上。' },
  { title: '患者伸手', detail: '患者伸出前臂，掌心向上，手腕自然放平。' },
  { title: '中指定关', detail: '先以中指在桡骨茎突内侧定位关部。' },
  { title: '食指定位寸', detail: '保持中指定关，将食指置于关前、靠近腕端的寸部。' },
  { title: '无名指定位尺', detail: '将无名指置于关后、靠近肘端的尺部。' },
  { title: '三指布指完成', detail: '食指对应寸，中指对应关，无名指对应尺；指目贴合脉动部位。' },
] as const

export interface TeachingPlayback { step: number; playing: boolean }
export type TeachingPlaybackAction = { type: 'play' | 'pause' | 'next' | 'previous' | 'tick' } | { type: 'replay'; autoPlay: boolean }

export function reduceTeachingPlayback(state: TeachingPlayback, action: TeachingPlaybackAction, stepCount: number): TeachingPlayback {
  const last = stepCount - 1
  switch (action.type) {
    case 'play': return { step: state.step === last ? 0 : state.step, playing: true }
    case 'pause': return { ...state, playing: false }
    case 'replay': return { step: 0, playing: action.autoPlay }
    case 'previous': return { step: Math.max(0, state.step - 1), playing: false }
    case 'next': return { step: Math.min(last, state.step + 1), playing: false }
    case 'tick': {
      if (!state.playing) return state
      const step = Math.min(last, state.step + 1)
      return { step, playing: step < last }
    }
  }
}
