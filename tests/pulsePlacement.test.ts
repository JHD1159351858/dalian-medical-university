import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PulsePalpationTrainer } from '../src/clinical/PulsePalpationTrainer'
import { PULSE_GEOMETRY, clampHandPosition, createPulsePlacement, handFingertips, idealHandPosition, imagePointFromClient, pulsePlacementReducer } from '../src/clinical/pulsePlacement'

const aligned = () => pulsePlacementReducer(createPulsePlacement(), { type: 'drop', position: idealHandPosition(3), moved: true })

describe('pulse photograph geometry', () => {
  it('keeps full-image coordinates identical when the canvas is resized', () => {
    const point = PULSE_GEOMETRY.targets.middle
    const small = imagePointFromClient({ x: 20 + point.x * 6, y: 50 + point.y * 4 }, { left: 20, top: 50, width: 600, height: 400 })
    const large = imagePointFromClient({ x: 40 + point.x * 12, y: 80 + point.y * 8 }, { left: 40, top: 80, width: 1200, height: 800 })
    expect(small.x).toBeCloseTo(point.x)
    expect(small.y).toBeCloseTo(point.y)
    expect(large).toEqual(small)
  })

  it('maps all three photographed fingertips to their named targets', () => {
    const tips = handFingertips(3, idealHandPosition(3))
    for (const finger of ['middle', 'index', 'ring'] as const) {
      expect(Math.abs(tips[finger]!.x - PULSE_GEOMETRY.targets[finger].x)).toBeLessThanOrEqual(PULSE_GEOMETRY.tolerance.x)
      expect(Math.abs(tips[finger]!.y - PULSE_GEOMETRY.targets[finger].y)).toBeLessThanOrEqual(PULSE_GEOMETRY.tolerance.y)
    }
  })

  it('uses each hand image’s middle fingertip to anchor placement at guan', () => {
    for (const count of [1, 2, 3] as const) {
      const middle = handFingertips(count, idealHandPosition(count)).middle!
      expect(middle.x).toBeCloseTo(PULSE_GEOMETRY.targets.middle.x)
      expect(middle.y).toBeCloseTo(PULSE_GEOMETRY.targets.middle.y)
    }
  })

  it('constrains dragging while allowing the doctor hand to enter from above the photograph', () => {
    const left = clampHandPosition({ x: -100, y: -100 }, 3)
    const right = clampHandPosition({ x: 200, y: 200 }, 3)
    const width = PULSE_GEOMETRY.hands[3].width
    const height = width * PULSE_GEOMETRY.baseAspectRatio / PULSE_GEOMETRY.hands[3].aspectRatio
    expect(left).toEqual({ x: width / 2, y: 0 })
    expect(right).toEqual({ x: 100 - width / 2, y: 100 - height / 2 })
    expect(clampHandPosition(idealHandPosition(3), 3)).toEqual(idealHandPosition(3))
    expect(idealHandPosition(3).y - height / 2).toBeLessThan(0)
  })
})

describe('adult three-finger placement practice', () => {
  it('does not pass a position check until the learner moves the hand', () => {
    const state = { ...createPulsePlacement(), position: idealHandPosition(3) }
    const checked = pulsePlacementReducer(state, { type: 'check' })
    expect(checked.positionChecked).toBe(false)
    expect(checked.feedback.code).toBe('not-positioned')
  })

  it('treats one and two fingers as incomplete for this adult three-finger task', () => {
    for (const count of [1, 2] as const) {
      const selected = pulsePlacementReducer(createPulsePlacement(), { type: 'select', count })
      const dropped = pulsePlacementReducer(selected, { type: 'drop', position: idealHandPosition(count), moved: true })
      const checked = pulsePlacementReducer(dropped, { type: 'check' })
      expect(checked.feedback.code).toBe('finger-count')
      expect(checked.positionChecked).toBe(false)
      expect(checked.feedback.message).not.toContain('非法')
      expect(checked.feedback.message).toContain('本练习考核成人三指布指')
      expect(checked.feedback.message).toContain('临床另有单按等指法')
    }
  })

  it('identifies misplaced fingers rather than accepting any dropped hand', () => {
    const dropped = pulsePlacementReducer(createPulsePlacement(), { type: 'drop', position: { x: 30, y: 35 }, moved: true })
    const checked = pulsePlacementReducer(dropped, { type: 'check' })
    expect(checked.positionChecked).toBe(false)
    expect(checked.feedback.code).toBe('position')
    expect(checked.feedback.message).toContain('中指')
  })

  it('requires a valid group position before any fingertip can be confirmed', () => {
    const state = pulsePlacementReducer(aligned(), { type: 'confirm', finger: 'middle' })
    expect(state.confirmed).toEqual([])
    expect(state.feedback.code).toBe('unchecked')
  })

  it('confirms the middle, index and ring fingers in order before showing success', () => {
    let state = pulsePlacementReducer(aligned(), { type: 'check' })
    expect(state.positionChecked).toBe(true)
    expect(state.feedback.code).toBe('ready')
    expect(state.feedback.kind).not.toBe('success')
    for (const finger of ['middle', 'index', 'ring'] as const) state = pulsePlacementReducer(state, { type: 'confirm', finger })
    expect(state.confirmed).toEqual(['middle', 'index', 'ring'])
    expect(state.feedback.kind).toBe('success')
    expect(state.feedback.code).toBe('complete')
    expect(state.feedback.message).toContain('成人三指布指练习完成')
  })

  it('explains an incorrect contact order and resets contact confirmations', () => {
    let state = pulsePlacementReducer(aligned(), { type: 'check' })
    state = pulsePlacementReducer(state, { type: 'confirm', finger: 'middle' })
    state = pulsePlacementReducer(state, { type: 'confirm', finger: 'ring' })
    expect(state.confirmed).toEqual([])
    expect(state.feedback.code).toBe('order')
    expect(state.feedback.message).toContain('食指')
    expect(state.feedback.message).toContain('中指')
  })

  it('invalidates confirmations when the hand is dragged, nudged, changed or reset', () => {
    let state = pulsePlacementReducer(aligned(), { type: 'check' })
    state = pulsePlacementReducer(state, { type: 'confirm', finger: 'middle' })
    const moved = pulsePlacementReducer(state, { type: 'move', position: { x: 60, y: 40 } })
    const nudged = pulsePlacementReducer(state, { type: 'nudge', dx: 1, dy: 0 })
    const changed = pulsePlacementReducer(state, { type: 'select', count: 2 })
    const reset = pulsePlacementReducer(state, { type: 'reset' })
    for (const next of [moved, nudged, changed, reset]) {
      expect(next.confirmed).toEqual([])
      expect(next.positionChecked).toBe(false)
      expect(next.feedback.kind).not.toBe('success')
    }
    expect(nudged.hasPositioned).toBe(true)
    expect(reset).toEqual(createPulsePlacement())
  })

  it('cancels a pointer gesture without confirming its drop', () => {
    const previous = createPulsePlacement()
    const moved = pulsePlacementReducer(previous, { type: 'move', position: idealHandPosition(3) })
    const cancelled = pulsePlacementReducer(moved, { type: 'cancel', previous })
    expect(cancelled.position).toEqual(previous.position)
    expect(cancelled.hasPositioned).toBe(false)
    expect(cancelled.positionChecked).toBe(false)
    expect(cancelled.confirmed).toEqual([])
  })
})

it('opens directly in the photographic drag workspace with three hand-image options', () => {
  const html = renderToStaticMarkup(createElement(PulsePalpationTrainer))
  expect(html).not.toContain('操作演示')
  expect(html).toContain('拖动练习')
  expect(html).toContain('学习提示')
  expect(html).toContain('/four-exam-images/realistic/pulse-arm.png')
  for (const count of [1, 2, 3]) expect(html).toContain(`/four-exam-images/realistic/doctor-hand-${count}.png`)
  expect(html).toContain('操作要点')
  expect(html).toContain('操作反馈')
  expect(html).toContain('按住医生手部拖到患者手腕')
  expect(html).toContain('aria-label="拖动医生手部"')
  expect(html).toContain('检查位置')
  expect(html).not.toContain('沉滑数')
})
