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
      querySelector: vi.fn((selector) => {
        if (selector.startsWith('.hero-carousel')) return null
        if (selector.startsWith('main[')) return { id: 'ready-home' }
        return home
      }),
    }

    expect(getInitialHomeFocusTarget(root)).toBe(home)
  })

  it('wartet weiter, solange der Home-Hero noch geladen wird', () => {
    const root = {
      querySelector: vi.fn(() => null),
    }

    expect(getInitialHomeFocusTarget(root)).toBeNull()
    expect(root.querySelector).toHaveBeenCalledTimes(2)
  })
})
