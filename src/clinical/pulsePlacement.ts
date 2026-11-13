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

export function misplacedFingers(count: FingerCount, position: ImagePoint): PulseFinger[] {
  const tips = handFingertips(count, position)
  return PULSE_FINGER_ORDER.filter((finger) => {
    const tip = tips[finger]
    if (!tip) return false
    const target = PULSE_GEOMETRY.targets[finger]
    return Math.abs(tip.x - target.x) > PULSE_GEOMETRY.tolerance.x || Math.abs(tip.y - target.y) > PULSE_GEOMETRY.tolerance.y
  })
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
  feedback: PracticeFeedback
}
export type PulsePlacementAction =
  | { type: 'select'; count: FingerCount }
  | { type: 'move'; position: ImagePoint }
  | { type: 'drop'; position: ImagePoint; moved: boolean }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'cancel'; previous: PulsePlacementState }
  | { type: 'check' | 'reset' }

const idleFeedback: PracticeFeedback = { kind: 'idle', code: 'initial', message: '选择一指关部单按或三指寸关尺布指，拖动医生手部到手腕后检查位置。' }

export function createPulsePlacement(count: FingerCount = 3): PulsePlacementState {
  return { count, position: clampHandPosition({ x: 74, y: 12 }, count), hasPositioned: false, positionChecked: false, feedback: { ...idleFeedback } }
}

function unvalidatedPosition(state: PulsePlacementState, position: ImagePoint, hasPositioned: boolean): PulsePlacementState {
  return { ...state, position: clampHandPosition(position, state.count), hasPositioned, positionChecked: false, feedback: { kind: 'info', code: 'moved', message: '位置已调整，请重新检查位置后进行触诊。' } }
}

export function pulsePlacementReducer(state: PulsePlacementState, action: PulsePlacementAction): PulsePlacementState {
  switch (action.type) {
    case 'reset': return createPulsePlacement()
    case 'select': return createPulsePlacement(action.count)
    case 'move': return unvalidatedPosition(state, action.position, false)
    case 'drop': return action.moved ? unvalidatedPosition(state, action.position, true) : state
    case 'nudge': {
      const position = clampHandPosition({ x: state.position.x + action.dx, y: state.position.y + action.dy }, state.count)
      return unvalidatedPosition(state, position, state.hasPositioned || position.x !== state.position.x || position.y !== state.position.y)
    }
    case 'cancel': return action.previous
    case 'check': {
      if (state.count === 2) return { ...state, positionChecked: false, feedback: { kind: 'error', code: 'finger-count', message: '二指仅作为布指过渡。请选一指关部单按或三指寸关尺布指，再检查位置。' } }
      if (!state.hasPositioned) return { ...state, positionChecked: false, feedback: { kind: 'error', code: 'not-positioned', message: '请先拖动医生手部，或用方向键调整位置，再检查。' } }
      const misplaced = misplacedFingers(state.count, state.position)
      if (misplaced.length) return { ...state, positionChecked: false, feedback: { kind: 'error', code: 'position', message: `${misplaced.map((finger) => `${PULSE_FINGER_LABELS[finger].finger}需对准${PULSE_FINGER_LABELS[finger].position}位`).join('；')}。请调整手部后再次检查。` } }
      return { ...state, positionChecked: true, feedback: { kind: 'success', code: 'ready', message: '位置已对齐，可轻点或持续按住指尖进行触诊。' } }
    }
  }
}
