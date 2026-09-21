import { describe, expect, it, vi } from 'vitest'
import {
  CONTENT_ACTIVATION_STATE,
  focusContentActivationTarget,
  getContentActivationFocusTarget,
  resolveContentActivationFocus,
} from '../src/navigation/contentActivationFocus.js'

function focusTarget(name) {
  return { name, focus: vi.fn() }
}

function rootWith({ hero = null, nav = null, pageState = 'rows', pageMounted = true } = {}) {
  const page = pageMounted ? {
    querySelector: vi.fn(() => hero),
    getAttribute: vi.fn(() => pageState),
  } : null
  return {
    querySelector: vi.fn((selector) => (
      selector.startsWith('[data-content-page=') ? page : nav
    )),
  }
}

describe('Fokus nach bewusster Inhaltsseiten-Aktivierung', () => {
  it('fokussiert den vorhandenen Hero der Zielseite', () => {
    const hero = focusTarget('hero')
    const nav = focusTarget('movies-nav')
    const root = rootWith({ hero, nav })

    expect(getContentActivationFocusTarget('movies', root)).toBe(hero)
    expect(focusContentActivationTarget('movies', root)).toBe(hero)
    expect(hero.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(nav.focus).not.toHaveBeenCalled()
  })

  it('belässt den Fokus ohne Hero auf dem aktivierten Reiter', () => {
    const nav = focusTarget('tv-nav')
    const root = rootWith({ nav })

    expect(focusContentActivationTarget('tv', root)).toBe(nav)
    expect(nav.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('wartet auf einen Hero, solange die Zielseite noch aufgebaut wird', () => {
    const nav = focusTarget('tv-nav')
    const root = rootWith({ nav, pageState: 'hero' })

    expect(resolveContentActivationFocus('tv', root)).toEqual({
      state: CONTENT_ACTIVATION_STATE.WAITING,
      target: null,
    })
    expect(focusContentActivationTarget('tv', root)).toBeNull()
    expect(nav.focus).not.toHaveBeenCalled()
  })

  it('wartet, bis die Zielseite überhaupt montiert wurde', () => {
    const nav = focusTarget('movies-nav')
    const root = rootWith({ nav, pageMounted: false })

    expect(getContentActivationFocusTarget('movies', root)).toBeNull()
    expect(nav.focus).not.toHaveBeenCalled()
  })

  it('verwendet beim Logo-Aufruf dieselbe Home-Zielkette', () => {
    const homeNav = focusTarget('home-nav')
    const root = rootWith({ nav: homeNav })

    expect(focusContentActivationTarget('home', root)).toBe(homeNav)
  })

  it('ignoriert Ansichten außerhalb der fünf Inhaltsreiter', () => {
    const root = rootWith({ nav: focusTarget('search') })

    expect(focusContentActivationTarget('search', root)).toBeNull()
    expect(root.querySelector).not.toHaveBeenCalled()
  })
})
