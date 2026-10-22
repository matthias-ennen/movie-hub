import { describe, expect, it, vi } from 'vitest'
import {
  PUBLIC_SEARCH_INDEX_URL,
  compareYoutubeHypothesesToPublicIndex,
  readOfficialPublicSearchIndex,
} from '../scripts/youtube-g2-public-index-membership.mjs'

const observedAt = '2026-10-22T12:00:00.000Z'
const cases = Array.from({ length: 125 }, (_, index) => ({
  videoId: 'V' + String(index).padStart(10, '0'),
  channelId: 'UClyuw-OWE6taGFv0reZI6eQ',
  status: index < 3 ? 'review-leading-film-hypothesis' : 'review-partial-title-identity',
  topCandidates: index === 0 ? [{ tmdbId: 101 }]
    : index === 1 ? [{ tmdbId: 102 }]
    : index === 2 ? [{ tmdbId: 999 }]
    : [],
}))
const audit = {
  summary: {
    matcherVersion: 'v1.1',
    newEligibleUniqueVideos: 125,
    replayMode: true,
    comparison: { sameVideoIds: true, replayRunId: '39761879885' },
    publicationPermitted: false,
    catalogWrites: 0,
    firestoreWrites: 0,
  },
  cases,
}
const index = {
  kind: 'search-index', version: 1, country: 'DE', source: 'tmdb',
  generatedAt: '2026-10-22T10:00:00.000Z',
  count: 150,
  entries: Array.from({ length: 150 }, (_, i) => ({ type: 'movie', tmdbId: i + 1 })),
}
const options = { now: Date.parse(observedAt) }

describe('G2 real published PUBLIC search-index read-only membership', () => {
  it('counts only public index membership, not new full MovieHub titles', () => {
    const result = compareYoutubeHypothesesToPublicIndex(audit, index, options)
    expect(result).toMatchObject({
      scope: 'PUBLIC_SEARCH_INDEX_ONLY',
      comparedVideoIds: 125,
      leadingVideoHypotheses: 3,
      presentInPublicSearchIndex: 2,
      notPresentInPublicSearchIndex: 1,
      fullCatalogNewTitles: null,
      personalCatalogCoverage: 'not-loaded',
      verifiedFilms: 0,
      verifiedDEOffers: 0,
      publicationPermitted: false,
      firestoreWrites: 0,
      providerWrites: 0,
      badgeWrites: 0,
      nightlyWrites: 0,
    })
    expect(result.candidates.map(x => x.publicSearchMembership))
      .toEqual(['present', 'present', 'not-present'])
    expect(result.candidates.every(x => x.toImport === false
      && x.personalCatalogMembership === 'unknown')).toBe(true)
  })

  it('never treats partial-title matches as candidate imports', () => {
    const result = compareYoutubeHypothesesToPublicIndex(audit, index, options)
    expect(result.candidates).toHaveLength(3)
    expect(result.candidates.some(x => x.videoId === cases[3].videoId)).toBe(false)
  })

  it('fails closed on an unavailable, stub, stale, non-DE or damaged index', () => {
    const broken = [
      { ...index, source: 'fallback' },
      { ...index, count: 0 },
      { ...index, country: 'US' },
      { ...index, generatedAt: '2026-01-01T00:00:00Z' },
      { ...index, entries: [{ type: 'movie', tmdbId: 101 }], count: 1 },
      { ...index, entries: [{ ...index.entries[0], tmdbId: null }, ...index.entries.slice(1)] },
    ]
    for (const value of broken) {
      expect(() => compareYoutubeHypothesesToPublicIndex(audit, value, options)).toThrow()
    }
  })

  it('rejects wrong matcher/version, partial QA or misleading write flags', () => {
    const broken = [
      { ...audit, summary: { ...audit.summary, matcherVersion: 'v1' } },
      { ...audit, cases: cases.slice(0, 124) },
      { ...audit, summary: { ...audit.summary, publicationPermitted: true } },
      { ...audit, summary: { ...audit.summary, firestoreWrites: 1 } },
    ]
    for (const value of broken) {
      expect(() => compareYoutubeHypothesesToPublicIndex(value, index, options))
        .toThrow('INVALID_G2_READ_ONLY_V11_AUDIT')
    }
  })

  it('uses exactly the official index URL with no redirected fallback', async () => {
    const raw = JSON.stringify(index)
    const fetchFn = vi.fn(async url => ({
      ok: true, status: 200, url, headers: { get: () => String(raw.length) },
      arrayBuffer: async () => new TextEncoder().encode(raw).buffer,
    }))
    const result = await readOfficialPublicSearchIndex(fetchFn)
    expect(result.count).toBe(150)
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(fetchFn.mock.calls[0][0]).toBe(PUBLIC_SEARCH_INDEX_URL)
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })

  it('refuses an unexpected URL or HTTP response', async () => {
    for (const reply of [
      { ok: false, status: 503, url: PUBLIC_SEARCH_INDEX_URL },
      { ok: true, status: 200, url: 'https://example.com/search-index.json' },
    ]) {
      await expect(readOfficialPublicSearchIndex(async () => reply))
        .rejects.toThrow('PUBLIC_SEARCH_INDEX_FETCH_FAILED')
    }
  })
})
