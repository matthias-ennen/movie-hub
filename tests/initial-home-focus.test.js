import { describe, expect, it, vi } from 'vitest'
import { getInitialHomeFocusTarget } from '../src/components/InitialHomeFocus.jsx'

describe('initialer Home-Fokus', () => {
  it('bevorzugt den Hero vor dem Home-Menüpunkt', () => {
    const hero = { id: 'hero' }
    const home = { id: 'home' }
    const root = {
      querySelector: vi.fn((selector) => (
        selector.startsWith('.hero-carousel') ? hero : home
      )),
    }

    expect(getInitialHomeFocusTarget(root)).toBe(hero)
    expect(root.querySelector).toHaveBeenCalledTimes(1)
  })

  it('verwendet Home als Rückfall, wenn kein Hero vorhanden ist', () => {
    const home = { id: 'home' }
    const root = {
      querySelector: vi.fn((selector) => (
        selector.startsWith('.hero-carousel') ? null : home
      )),
    }

    expect(getInitialHomeFocusTarget(root)).toBe(home)
  })
})
