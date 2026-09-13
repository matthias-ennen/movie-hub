import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSeriesSeasonDetailCache,
  loadSeriesSeasonDetail,
  normalizeSeriesSeasonDetail,
  normalizeSeriesSeasons,
  seriesSeasonBucket,
  seriesSeasonDetailPath,
} from '../src/catalog/seriesNavigation.js'
import { collectSeriesSeasonReferences } from '../scripts/generate-series-details.mjs'

afterEach(() => clearSeriesSeasonDetailCache())

describe('Staffel- und Folgenkatalog', () => {
  it('normalisiert Staffeln, entfernt Specials und sortiert stabil', () => {
    expect(normalizeSeriesSeasons([
      { id: 20, season_number: 2, name: 'Zweite Staffel', episode_count: 8, poster_path: '/s2.jpg' },
      { id: 0, season_number: 0, name: 'Specials', episode_count: 2 },
      { id: 10, season_number: 1, name: 'Erste Staffel', episode_count: 10 },
    ], { seriesTmdbId: 1399 })).toEqual([
      expect.objectContaining({ seasonNumber: 1, title: 'Erste Staffel', episodeCount: 10 }),
      expect.objectContaining({ seasonNumber: 2, title: 'Zweite Staffel', episodeCount: 8, posterUrl: expect.stringContaining('/w500/s2.jpg') }),
    ])
  })

  it('erzeugt kompatible Staffelreferenzen aus der bekannten Staffelanzahl', () => {
    expect(normalizeSeriesSeasons([], { seriesTmdbId: 42, numberOfSeasons: 2 }))
      .toEqual([
        expect.objectContaining({ seasonNumber: 1, title: 'Staffel 1' }),
        expect.objectContaining({ seasonNumber: 2, title: 'Staffel 2' }),
      ])
  })

  it('normalisiert und sortiert Episoden ohne leere Daten zu erfinden', () => {
    const detail = normalizeSeriesSeasonDetail({
      seriesTmdbId: 1399,
      seriesTitle: 'Game of Thrones',
      season_number: 1,
      name: 'Staffel 1',
      episodes: [
        { id: 2, episode_number: 2, season_number: 1, name: 'Der Königsweg' },
        { id: 1, episode_number: 1, season_number: 1, name: 'Der Winter naht', overview: 'Beschreibung', still_path: '/e1.jpg' },
      ],
    })

    expect(detail.episodes.map((episode) => episode.episodeNumber)).toEqual([1, 2])
    expect(detail.episodes[0]).toMatchObject({
      title: 'Der Winter naht',
      description: 'Beschreibung',
      seriesTitle: 'Game of Thrones',
    })
    expect(detail.episodes[0].stillUrl).toContain('/w780/e1.jpg')
  })

  it('lädt nur den passenden Staffel-Shard und verwendet ihn wieder', async () => {
    const bucket = seriesSeasonBucket(1399)
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: 'series-season-shard',
      version: 1,
      bucket,
      entries: [{
        seriesTmdbId: 1399,
        seriesTitle: 'Game of Thrones',
        seasonNumber: 1,
        episodes: [{ id: 1, season_number: 1, episode_number: 1, name: 'Der Winter naht' }],
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const series = { tmdbId: 1399, title: 'Game of Thrones' }
    const season = { seasonNumber: 1 }
    await expect(loadSeriesSeasonDetail(series, season, { fetchImpl })).resolves.toMatchObject({ seasonNumber: 1 })
    await loadSeriesSeasonDetail(series, season, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(seriesSeasonDetailPath(1399), { cache: 'no-store' })
  })

  it('sammelt jede Staffel je Serie genau einmal für den CI-Katalog', () => {
    const references = collectSeriesSeasonReferences([
      { type: 'series', tmdbId: 20, title: 'Serie B', numberOfSeasons: 2 },
      { type: 'series', tmdbId: 10, title: 'Serie A', seasons: [{ season_number: 1 }, { season_number: 1 }] },
      { type: 'movie', tmdbId: 99, title: 'Film' },
    ])
    expect(references).toEqual([
      { seriesTmdbId: 10, seriesTitle: 'Serie A', seasonNumber: 1 },
      { seriesTmdbId: 20, seriesTitle: 'Serie B', seasonNumber: 1 },
      { seriesTmdbId: 20, seriesTitle: 'Serie B', seasonNumber: 2 },
    ])
  })
})
