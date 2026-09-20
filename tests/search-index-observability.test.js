import { describe, expect, it } from 'vitest'
import {
  buildSearchIndexDiff,
  buildSearchIndexRunReport,
} from '../scripts/search-index-observability.mjs'

function title(type, tmdbId, providerId = 'netflix', offerTypes = ['flatrate']) {
  return {
    id: `tmdb-${type}-${tmdbId}`,
    type,
    tmdbId,
    title: `${type} ${tmdbId}`,
    providerOffers: [{ id: providerId, tmdbProviderId: 8, offerTypes }],
  }
}

describe('Suchindex-Herkunftsnachweis', () => {
  it('reports additions, removals and changed provider offers by canonical title identity', () => {
    const diff = buildSearchIndexDiff(
      [title('movie', 1), title('series', 2), title('movie', 3, 'prime', ['rent'])],
      [title('movie', 1), title('movie', 3, 'prime', ['buy']), title('series', 4)],
    )

    expect(diff.added.map(({ key }) => key)).toEqual(['series:4'])
    expect(diff.removed.map(({ key }) => key)).toEqual(['series:2'])
    expect(diff.changedOffers).toEqual([
      expect.objectContaining({ key: 'movie:3', before: [expect.objectContaining({ offerTypes: ['rent'] })], after: [expect.objectContaining({ offerTypes: ['buy'] })] }),
    ])
    expect(diff.providerOfferDeltas).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'series:netflix:flatrate', addedTitles: 1, removedTitles: 1 }),
      expect.objectContaining({ key: 'movie:prime:rent', addedTitles: 0, removedTitles: 1 }),
      expect.objectContaining({ key: 'movie:prime:buy', addedTitles: 1, removedTitles: 0 }),
    ]))
  })

  it('summarizes every scan and the previous-to-current index delta', () => {
    const report = buildSearchIndexRunReport({
      generatedAt: '2026-09-20T15:00:00.000Z',
      scans: [
        { key: 'netflix:movie:flatrate', status: 'complete', pagesFetched: 50, rawResults: 1000, capped: true, skippedResults: 0 },
        { key: 'netflix:series:flatrate', status: 'complete', pagesFetched: 12, rawResults: 231, capped: false, skippedResults: 1 },
      ],
      previousIndex: { generatedAt: '2026-09-19T15:00:00.000Z', entries: [title('movie', 1), title('series', 2)] },
      currentIndex: { generatedAt: '2026-09-20T15:00:00.000Z', entries: [title('movie', 1), title('movie', 3)] },
      broadEntries: [title('movie', 1), title('movie', 3)],
    })

    expect(report).toMatchObject({
      kind: 'search-index-run-report',
      scans: {
        expected: 2,
        completed: 2,
        capped: 1,
        withSkippedResults: 1,
        pagesFetched: 62,
        rawResults: 1231,
        broadUniqueTitles: 2,
      },
      index: {
        baselineAvailable: true,
        previous: { total: 2, movie: 1, series: 1 },
        current: { total: 2, movie: 2, series: 0 },
        delta: { total: 0, movie: 1, series: -1 },
        addedCount: 1,
        removedCount: 1,
        changedOfferCount: 0,
      },
    })
  })
})
