export type PulsePressure = 'light' | 'deep'
export const PULSE_DEEP_PRESS_MS = 600

export function createPulseTouch(onRead: (pressure: PulsePressure) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false
  let deep = false
  const cancel = () => {
    clearTimeout(timer)
    active = false
    deep = false
  }
  return {
    start() {
      cancel()
      active = true
      timer = setTimeout(() => {
        if (!active) return
        deep = true
        onRead('deep')
      }, PULSE_DEEP_PRESS_MS)
    },
    release() {
      if (!active) return
      clearTimeout(timer)
      active = false
      if (!deep) onRead('light')
    },
    cancel,
  }
}
