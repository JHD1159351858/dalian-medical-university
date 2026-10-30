export type PulseFinger = 'middle' | 'index' | 'ring'
export type FingerCount = 1 | 2 | 3
export interface ImagePoint { x: number; y: number }
interface HandGeometry { width: number; aspectRatio: number; tips: Partial<Record<PulseFinger, ImagePoint>> }

// All coordinates are percentages of the complete image, including each transparent hand canvas.
export const PULSE_GEOMETRY: {
  baseAspectRatio: number
  targets: Record<PulseFinger, ImagePoint>
  hands: Record<FingerCount, HandGeometry>
  tolerance: ImagePoint
} = {
  baseAspectRatio: 1.5,
  targets: { index: { x: 53.1, y: 45 }, middle: { x: 57, y: 45 }, ring: { x: 60.9, y: 45 } },
  hands: {
    1: { width: 46, aspectRatio: 1, tips: { middle: { x: 50.2, y: 92.3 } } },
    2: { width: 46, aspectRatio: 1, tips: { index: { x: 41.6, y: 90.5 }, middle: { x: 50.2, y: 92.3 } } },
    3: { width: 46, aspectRatio: 1, tips: { index: { x: 41.6, y: 90.5 }, middle: { x: 50.2, y: 92.3 }, ring: { x: 58.6, y: 91.6 } } },
  },
  tolerance: { x: 1.8, y: 2.5 },
}

export const PULSE_FINGER_ORDER: readonly PulseFinger[] = ['middle', 'index', 'ring']
export const PULSE_FINGER_LABELS: Record<PulseFinger, { finger: string; position: string; short: string }> = {
  middle: { finger: '中指', position: '关', short: '中' },
  index: { finger: '食指', position: '寸', short: '食' },
  ring: { finger: '无名指', position: '尺', short: '无' },
}

export function imagePointFromClient(point: ImagePoint, rect: { left: number; top: number; width: number; height: number }): ImagePoint {
  return { x: (point.x - rect.left) / rect.width * 100, y: (point.y - rect.top) / rect.height * 100 }
}

export function handHeight(count: FingerCount): number {
  const hand = PULSE_GEOMETRY.hands[count]
  return hand.width * PULSE_GEOMETRY.baseAspectRatio / hand.aspectRatio
}

export function clampHandPosition(position: ImagePoint, count: FingerCount): ImagePoint {
  const halfWidth = PULSE_GEOMETRY.hands[count].width / 2
  // The sleeve enters from above; clipping its upper half is intentional, never a crop of the wrist photo.
  return { x: Math.max(halfWidth, Math.min(100 - halfWidth, position.x)), y: Math.max(0, Math.min(100 - handHeight(count) / 2, position.y)) }
}

export function handFingertips(count: FingerCount, position: ImagePoint): Partial<Record<PulseFinger, ImagePoint>> {
  const hand = PULSE_GEOMETRY.hands[count]
  return Object.fromEntries(Object.entries(hand.tips).map(([finger, point]) => [finger, {
    x: position.x + (point!.x / 100 - .5) * hand.width,
    y: position.y + (point!.y / 100 - .5) * handHeight(count),
  }]))
}

export function idealHandPosition(count: FingerCount): ImagePoint {
  const hand = PULSE_GEOMETRY.hands[count]
  const middle = hand.tips.middle!
  return {
    x: PULSE_GEOMETRY.targets.middle.x - (middle.x / 100 - .5) * hand.width,
    y: PULSE_GEOMETRY.targets.middle.y - (middle.y / 100 - .5) * handHeight(count),
  }
}

interface PracticeFeedback { kind: 'idle' | 'info' | 'error' | 'success'; code: string; message: string }
export interface PulsePlacementState {
  count: FingerCount
  position: ImagePoint
  hasPositioned: boolean
  positionChecked: boolean
  confirmed: PulseFinger[]
  feedback: PracticeFeedback
}
export type PulsePlacementAction =
  | { type: 'select'; count: FingerCount }
  | { type: 'move'; position: ImagePoint }
  | { type: 'drop'; position: ImagePoint; moved: boolean }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'cancel'; previous: PulsePlacementState }
  | { type: 'confirm'; finger: PulseFinger }
  | { type: 'check' | 'reset' }

const idleFeedback: PracticeFeedback = { kind: 'idle', code: 'initial', message: '拖动医生手部到手腕，完成三指定位。' }

export function createPulsePlacement(count: FingerCount = 3): PulsePlacementState {
  return { count, position: clampHandPosition({ x: 74, y: 12 }, count), hasPositioned: false, positionChecked: false, confirmed: [], feedback: { ...idleFeedback } }
}

function unconfirmedPosition(state: PulsePlacementState, position: ImagePoint, hasPositioned: boolean): PulsePlacementState {
  return { ...state, position: clampHandPosition(position, state.count), hasPositioned, positionChecked: false, confirmed: [], feedback: { kind: 'info', code: 'moved', message: '位置已调整，请检查三指位置后重新依次确认。' } }
}

export function pulsePlacementReducer(state: PulsePlacementState, action: PulsePlacementAction): PulsePlacementState {
  switch (action.type) {
    case 'reset': return createPulsePlacement()
    case 'select': return createPulsePlacement(action.count)
    case 'move': return unconfirmedPosition(state, action.position, false)
    case 'drop': return action.moved ? unconfirmedPosition(state, action.position, true) : state
    case 'nudge': {
      const position = clampHandPosition({ x: state.position.x + action.dx, y: state.position.y + action.dy }, state.count)
      return unconfirmedPosition(state, position, state.hasPositioned || position.x !== state.position.x || position.y !== state.position.y)
    }
    case 'cancel': return { ...action.previous, positionChecked: false, confirmed: [], feedback: { kind: 'info', code: 'cancelled', message: '已取消本次拖动，未确认落点。请重新检查位置。' } }
    case 'check': {
      if (state.count !== 3) return { ...state, positionChecked: false, confirmed: [], feedback: { kind: 'error', code: 'finger-count', message: `当前选择${state.count === 1 ? '一' : '二'}指。本任务为成人三指布指练习，请选择三指；一指或二指不作为本任务的完成条件。` } }
      if (!state.hasPositioned) return { ...state, positionChecked: false, confirmed: [], feedback: { kind: 'error', code: 'not-positioned', message: '请先拖动医生手部，或用方向键调整位置，再检查。' } }
      const tips = handFingertips(3, state.position)
      const misplaced = PULSE_FINGER_ORDER.filter((finger) => {
        const tip = tips[finger]!
        const target = PULSE_GEOMETRY.targets[finger]
        return Math.abs(tip.x - target.x) > PULSE_GEOMETRY.tolerance.x || Math.abs(tip.y - target.y) > PULSE_GEOMETRY.tolerance.y
      })
      if (misplaced.length) return { ...state, positionChecked: false, confirmed: [], feedback: { kind: 'error', code: 'position', message: `${misplaced.map((finger) => `${PULSE_FINGER_LABELS[finger].finger}需对准${PULSE_FINGER_LABELS[finger].position}位`).join('；')}。请调整手部后再次检查。` } }
      if (state.confirmed.length === 3) return state
      return { ...state, positionChecked: true, confirmed: [], feedback: { kind: 'info', code: 'ready', message: '三指位置已对齐。请先点按中指确认关位，再按食指、无名指的顺序下指。' } }
    }
    case 'confirm': {
      if (!state.positionChecked) return { ...state, feedback: { kind: 'error', code: 'unchecked', message: '请先移动手部并点击“检查位置”，再确认下指顺序。' } }
      if (state.confirmed.length === 3) return state
      const expected = PULSE_FINGER_ORDER[state.confirmed.length]
      if (action.finger !== expected) return { ...state, confirmed: [], feedback: { kind: 'error', code: 'order', message: `此步应由${PULSE_FINGER_LABELS[expected].finger}定位${PULSE_FINGER_LABELS[expected].position}位，您点击了${PULSE_FINGER_LABELS[action.finger].finger}。本轮下指确认已重置，请从中指定关重新开始。` } }
      const confirmed = [...state.confirmed, action.finger]
      return { ...state, confirmed, feedback: confirmed.length === 3
        ? { kind: 'success', code: 'complete', message: '布指完成：中指定关、食指定位寸、无名指定位尺，位置与下指顺序均正确。' }
        : { kind: 'info', code: 'confirmed', message: `${PULSE_FINGER_LABELS[action.finger].finger}${PULSE_FINGER_LABELS[action.finger].position}位已确认。下一步请用${PULSE_FINGER_LABELS[PULSE_FINGER_ORDER[confirmed.length]].finger}定位${PULSE_FINGER_LABELS[PULSE_FINGER_ORDER[confirmed.length]].position}位。` } }
    }
  }
}
