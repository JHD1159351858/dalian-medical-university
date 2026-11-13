import { afterEach, expect, it, vi } from 'vitest'
import { createPulseTouch, PULSE_DEEP_PRESS_MS } from '../src/clinical/pulseTouch'

afterEach(() => vi.useRealTimers())

it('treats a short click as one light palpation', () => {
  vi.useFakeTimers()
  const read = vi.fn()
  const touch = createPulseTouch(read)
  touch.start()
  vi.advanceTimersByTime(100)
  touch.release()
  vi.advanceTimersByTime(PULSE_DEEP_PRESS_MS)
  expect(read.mock.calls).toEqual([['light']])
})

it('reveals deep palpation while held without an additional light reading on release', () => {
  vi.useFakeTimers()
  const read = vi.fn()
  const touch = createPulseTouch(read)
  touch.start()
  vi.advanceTimersByTime(PULSE_DEEP_PRESS_MS)
  expect(read.mock.calls).toEqual([['deep']])
  touch.release()
  touch.release()
  expect(read).toHaveBeenCalledOnce()
})

it('does not record a canceled press or a late timeout after moving the hand', () => {
  vi.useFakeTimers()
  const read = vi.fn()
  const touch = createPulseTouch(read)
  touch.start()
  touch.cancel()
  vi.advanceTimersByTime(PULSE_DEEP_PRESS_MS)
  touch.release()
  expect(read).not.toHaveBeenCalled()
})
