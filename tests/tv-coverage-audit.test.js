import { describe, expect, it } from 'vitest'
import { auditTvCoverage } from '../scripts/tv-coverage-audit.mjs'
import { resetProviderSelectionSnapshot } from '../src/settings/providerSelectionRuntime.js'

const now = Date.parse('2026-11-17T17:00:00Z')
const triple = { providerIds: ['waipu', 'joyn', 'air-zdf'], canonicalStationId: 'zdf', stationId: 'zdf',
  startTime: '2026-11-17T16:30:00Z', stopTime: '2026-11-17T18:30:00Z' }
const later = { ...triple, providerIds: ['air-zdf'], startTime: '2026-11-17T19:00:00Z', stopTime: '2026-11-17T21:00:00Z' }
const missing = { ...later, startTime: '2026-11-17T22:00:00Z', stopTime: '2026-11-17T23:00:00Z' }
const entry = (airings) => ({ key: 'movie:42', type: 'movie', tmdbId: 42, airings })

describe('#885 hosted TV count-only audit', () => {
  it('distinguishes merge, absent publication, title dedupe and badge cap', () => {
    try {
      const result = auditTvCoverage({ now, files: [{ providerId: 'air-zdf', titles: { entries: [entry([triple, later, missing])] } }],
        days: [{ key: '2026-11-17', entries: [entry([triple, later])] }] })
      expect(result.totals.horizon).toMatchObject({ airings: 3, movie: 3, titles: 1,
        runtimeMatched: 2, runtimeMissing: 1, allThree: 1, xmltvOnly: 1,
        dailyPoster: 1, dailyPosterNotSelected: 1, liveBadgeHidden: 0, liveBadgeHiddenWithMovieHub: 1 })
      expect(result.totals.onAir).toMatchObject({ airings: 1, allThree: 1 })
      expect(result.totals.next3h).toMatchObject({ airings: 1, xmltvOnly: 1, dailyPosterNotSelected: 1 })
      expect(result.stations['air-zdf'].horizon.airings).toBe(3)
      expect(JSON.stringify(result)).not.toContain('42')
    } finally { resetProviderSelectionSnapshot() }
  })
})
