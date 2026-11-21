import { describe, it, expect } from 'vitest'
import { auditPeerMatching, sameBroadcast } from '../scripts/xmltv-peer-matcher-audit.mjs'

const now = Date.parse('2026-11-17T17:00:00Z')
const c = { canonicalStationId: 'zdf', title: 'Testfilm', categories: ['Drama'],
  startAt: '2026-11-17T18:00:00Z', endAt: '2026-11-17T20:00:00Z', timestampsExplicitlyZoned: true }
const a = { canonicalStationId: 'zdf', stationId: 'zdf', startTime: c.startAt, stopTime: c.endAt,
  providerIds: ['waipu', 'joyn'] }
const entry = (airing = a, more = {}) => ({ type: 'movie', tmdbId: 123, title: c.title, year: 2020, airings: [airing], ...more })
const audit = (candidates, entries = [entry()]) => auditPeerMatching(candidates, [{ key: '2026-11-17', entries }], now).totals

describe('XMLTV peer evidence (#885)', () => {
  it('counts precisely aligned untyped movies and preserves all peer providers', () => {
    expect(audit([c])).toMatchObject({ mappedRows: 1, unclassified: 1, verifiedMovie: 1,
      verifiedBoth: 1, unclassifiedPeerMovieWithoutAir: 1, verifiedAlreadyAir: 0 })
    expect(audit([c], [entry({ ...a, providerIds: ['waipu', 'joyn', 'air-zdf'] })])).toMatchObject({
      unclassifiedPeerMovie: 1, unclassifiedPeerMovieWithoutAir: 0, verifiedAlreadyAir: 1 })
  })
  it('never crosses station, schedule, title, conflicting type or ambiguous identity', () => {
    expect(audit([c], [entry({ ...a, stationId: 'ard', canonicalStationId: 'ard' })]).noPeer).toBe(1)
    expect(audit([c], [entry(a, { title: 'Anderer Film' })]).noPeer).toBe(1)
    expect(sameBroadcast(c, { ...a, startTime: '2026-11-17T18:06:00Z' })).toBe(false)
    expect(sameBroadcast(c, { ...a, stopTime: '2026-11-17T18:30:00Z' })).toBe(false)
    expect(audit([{ ...c, categories: ['Serie'] }]).incompatiblePeer).toBe(1)
    expect(audit([{ ...c, categories: ['Serie', 'Spielfilm'] }]).categoryTypeConflict).toBe(1)
    expect(audit([{ ...c, productionYearEvidence: 1990 }]).incompatiblePeer).toBe(1)
    expect(audit([c], [entry(), entry(a, { tmdbId: 456 })]).ambiguousPeer).toBe(1)
    expect(audit([{ ...c, timestampsExplicitlyZoned: false }]).invalidTimezone).toBe(1)
  })
  it('returns counts only, never title or TMDB identity', () => {
    const result = JSON.stringify(audit([c]))
    expect(result).not.toContain('Testfilm')
    expect(result).not.toContain('123')
  })
})
