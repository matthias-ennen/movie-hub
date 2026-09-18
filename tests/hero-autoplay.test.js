import { describe, expect, it } from 'vitest'
import {
  didTrailerComplete,
  getNextAutomaticHeroIndex,
  HERO_POST_TRAILER_DELAY_MS,
  resolveHeroTimerAction,
} from '../src/components/heroAutoplay.js'

describe('automatische Hero-Sequenz', () => {
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
})
