import { describe, expect, it } from 'vitest'
import {
  includedSwitchShownAsOn,
  ignoreCompletedIncludedClick,
} from '../src/notifications/includedSwitchSession.js'

const aliceFilm = 'alice|main|movie|121'
const aliceOtherFilm = 'alice|main|movie|122'
const aliceSeries = 'alice|main|series|121'
const aliceOtherProfile = 'alice|guest|movie|121'
const bobSameFilm = 'bob|main|movie|121'

describe('#381 included switch: current detail session only', () => {
  it('shows Ein after an accepted activation even when Firestore has already completed it', () => {
    expect(includedSwitchShownAsOn(false, aliceFilm, aliceFilm)).toBe(true)
    expect(ignoreCompletedIncludedClick(false, aliceFilm, aliceFilm)).toBe(true)
  })

  it('shows actual Aus on a new detail visit with no local accepted activation', () => {
    expect(includedSwitchShownAsOn(false, null, aliceFilm)).toBe(false)
    expect(ignoreCompletedIncludedClick(false, null, aliceFilm)).toBe(false)
  })

  it('does not leak a held Ein state across titles, media types, profiles or users', () => {
    for (const key of [aliceOtherFilm, aliceSeries, aliceOtherProfile, bobSameFilm]) {
      expect(includedSwitchShownAsOn(false, aliceFilm, key)).toBe(false)
      expect(ignoreCompletedIncludedClick(false, aliceFilm, key)).toBe(false)
    }
  })

  it('retains an actually active watch without a local hold and permits manual cancellation', () => {
    expect(includedSwitchShownAsOn(true, null, aliceFilm)).toBe(true)
    expect(ignoreCompletedIncludedClick(true, null, aliceFilm)).toBe(false)
    expect(includedSwitchShownAsOn(true, aliceFilm, aliceFilm)).toBe(true)
    expect(ignoreCompletedIncludedClick(true, aliceFilm, aliceFilm)).toBe(false)
  })

  it('an activation failure or explicit switch-off never creates a held state', () => {
    expect(includedSwitchShownAsOn(false, null, aliceFilm)).toBe(false)
    expect(includedSwitchShownAsOn(false, '', aliceFilm)).toBe(false)
  })

  it('does not manufacture a hold without a valid current context', () => {
    expect(includedSwitchShownAsOn(false, '', '')).toBe(false)
    expect(ignoreCompletedIncludedClick(false, '', '')).toBe(false)
  })
})
