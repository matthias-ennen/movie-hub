import { describe, expect, it } from 'vitest'
import {
  consumeHeroAutoplayActivation,
  didTrailerComplete,
  getNextAutomaticHeroIndex,
  HERO_AUTOPLAY_ARM_ATTRIBUTE,
  HERO_AUTOPLAY_SESSION,
  HERO_AUTOPLAY_SESSION_EVENT,
  HERO_POST_TRAILER_DELAY_MS,
  listenForHeroAutoplayUserIntent,
  markHeroForAutoplayActivation,
  reduceHeroAutoplaySession,
  resolveHeroTimerAction,
  shouldPreserveHeroSessionOnBlur,
} from '../src/components/heroAutoplay.js'

describe('automatische Hero-Sequenz', () => {
  it('bleibt nach Nutzeraktivität entschärft, bis eine neue Aktivierung eintrifft', () => {
    let state = reduceHeroAutoplaySession(
      HERO_AUTOPLAY_SESSION.DISARMED,
      HERO_AUTOPLAY_SESSION_EVENT.ACTIVATE,
    )
    expect(state).toBe(HERO_AUTOPLAY_SESSION.ARMED)

    state = reduceHeroAutoplaySession(state, HERO_AUTOPLAY_SESSION_EVENT.USER_INTENT)
    expect(state).toBe(HERO_AUTOPLAY_SESSION.DISARMED)
    expect(reduceHeroAutoplaySession(state, 'focus-returned')).toBe(HERO_AUTOPLAY_SESSION.DISARMED)
    expect(reduceHeroAutoplaySession(state, HERO_AUTOPLAY_SESSION_EVENT.ACTIVATE))
      .toBe(HERO_AUTOPLAY_SESSION.ARMED)
  })

  it('übergibt die einmalige Startaktivierung ausschließlich an einen Hero', () => {
    const attributes = new Map()
    const hero = {
      matches: (selector) => selector === '.hero-carousel',
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name),
      removeAttribute: (name) => attributes.delete(name),
    }
    const nav = { matches: () => false }

    expect(markHeroForAutoplayActivation(hero)).toBe(true)
    expect(attributes.get(HERO_AUTOPLAY_ARM_ATTRIBUTE)).toBe('true')
    expect(consumeHeroAutoplayActivation(hero)).toBe(true)
    expect(consumeHeroAutoplayActivation(hero)).toBe(false)
    expect(markHeroForAutoplayActivation(nav)).toBe(false)
  })

  it('entschärft bei D-Pad, Touch, Pointer oder Mausrad genau einmal', () => {
    const listeners = new Map()
    const windowRef = {
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) listeners.delete(type)
      },
    }
    let intents = 0
    const stop = listenForHeroAutoplayUserIntent(() => { intents += 1 }, windowRef)

    expect([...listeners.keys()].sort()).toEqual([
      'keydown',
      'pointerdown',
      'touchstart',
      'wheel',
    ])
    listeners.get('touchstart')()
    listeners.get('pointerdown')()
    expect(intents).toBe(1)

    stop()
    expect(listeners.size).toBe(0)
  })

  it('geht nur vorwärts und stoppt beim letzten Hero', () => {
    expect(getNextAutomaticHeroIndex(0, 5)).toBe(1)
    expect(getNextAutomaticHeroIndex(3, 5)).toBe(4)
    expect(getNextAutomaticHeroIndex(4, 5)).toBeNull()
  })

  it('spielt echte Trailer und überspringt Heroes ohne Trailer', () => {
    expect(resolveHeroTimerAction(0, 5, true)).toEqual({
      type: 'play-trailer',
      nextIndex: 1,
    })
    expect(resolveHeroTimerAction(0, 5, false)).toEqual({
      type: 'advance',
      nextIndex: 1,
    })
    expect(resolveHeroTimerAction(4, 5, false)).toEqual({
      type: 'stop',
      nextIndex: null,
    })
  })

  it('wartet nach einem vollständig beendeten Trailer drei Sekunden', () => {
    expect(didTrailerComplete('completed')).toBe(true)
    expect(didTrailerComplete('dismissed')).toBe(false)
    expect(didTrailerComplete('error')).toBe(false)
    expect(HERO_POST_TRAILER_DELAY_MS).toBe(3_000)
  })

  it('bewahrt die Hero-Sitzung beim Fokuswechsel zum nativen Trailerplayer', () => {
    expect(shouldPreserveHeroSessionOnBlur({ requestId: 'hero-1' })).toBe(true)
    expect(shouldPreserveHeroSessionOnBlur(null)).toBe(false)
  })
})
