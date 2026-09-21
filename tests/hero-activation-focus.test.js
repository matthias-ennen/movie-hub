import { describe, expect, it, vi } from 'vitest'
import {
  HERO_ACTIVATION_FOCUS_ATTEMPTS,
  focusHeroAfterActivation,
} from '../src/navigation/heroActivationFocus.js'

function scheduler() {
  const frames = []
  const timers = []
  return {
    frames,
    timers,
    windowRef: {
      requestAnimationFrame: vi.fn((callback) => { frames.push(callback); return frames.length }),
      cancelAnimationFrame: vi.fn(),
      setTimeout: vi.fn((callback) => { timers.push(callback); return timers.length }),
      clearTimeout: vi.fn(),
    },
  }
}

describe('Hero-Fokus nach Inhaltsseiten-Aktivierung', () => {
  it('fokussiert erst nach dem auslösenden Eingabeereignis und bestätigt den Fokus', () => {
    const { frames, timers, windowRef } = scheduler()
    const documentRef = { activeElement: null }
    const target = {
      isConnected: true,
      focus: vi.fn(() => { documentRef.activeElement = target }),
    }
    const onSettled = vi.fn()

    focusHeroAfterActivation(target, { windowRef, documentRef, onSettled })
    expect(target.focus).not.toHaveBeenCalled()
    frames.shift()()
    expect(target.focus).not.toHaveBeenCalled()
    timers.shift()()

    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(onSettled).toHaveBeenCalledWith({ focused: true, attempts: 1 })
  })

  it('wiederholt eine von der WebView nicht übernommene Fokussierung nur begrenzt', () => {
    const { frames, timers, windowRef } = scheduler()
    const target = { isConnected: true, focus: vi.fn() }
    const onSettled = vi.fn()

    focusHeroAfterActivation(target, {
      windowRef,
      documentRef: { activeElement: null },
      onSettled,
    })
    frames.shift()()
    while (timers.length) timers.shift()()

    expect(target.focus).toHaveBeenCalledTimes(HERO_ACTIVATION_FOCUS_ATTEMPTS)
    expect(onSettled).toHaveBeenCalledWith({
      focused: false,
      attempts: HERO_ACTIVATION_FOCUS_ATTEMPTS,
    })
  })

  it('lässt einen noch nicht ausgeführten Fokusauftrag abbrechen', () => {
    const { frames, windowRef } = scheduler()
    const target = { isConnected: true, focus: vi.fn() }
    const onSettled = vi.fn()
    const cancel = focusHeroAfterActivation(target, {
      windowRef,
      documentRef: { activeElement: null },
      onSettled,
    })

    cancel()
    frames.shift()()

    expect(target.focus).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
  })
})
