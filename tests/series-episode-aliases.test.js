import { describe, expect, it } from 'vitest'
import { mergeVerifiedEpisodeAliases, selectEpisodeAliasRefreshCandidates } from '../scripts/series-episode-aliases.mjs'
import { normalizeSeriesSeasonDetail } from '../src/catalog/seriesNavigation.js'
import { resolveCatalogEpisode } from '../src/catalog/episodeResolution.js'

const now = new Date('2026-10-13T12:00:00Z')
const episode = { tmdbId: 1010787, seasonNumber: 16, episodeNumber: 3, title: 'Minderjährig' }
const season = { seriesTmdbId: 2734, seasonNumber: 16, episodes: [episode] }
const english = { ...season, episodes: [{ ...episode, title: "Producer's Backend" }] }
const reference = { seasonNumber: 16, episodeNumber: 3, title: "Producer's Backend" }
const airing = { startTime: '2026-10-13T13:45:00Z', stopTime: '2026-10-13T14:30:00Z', episode: reference }
const title = { type: 'series', tmdbId: 2734, airings: [airing] }

describe('verifizierte Sprachvarianten und formale Teilbezeichnungen', () => {
  it('ordnet den englischen TV-Titel über dieselbe TMDB-Episoden-ID dem deutschen Titel zu', () => {
    const merged = normalizeSeriesSeasonDetail(mergeVerifiedEpisodeAliases(season, english, { checkedAt: now.toISOString() }))
    expect(merged.titleAliasesGeneratedAt).toBe(now.toISOString())
    expect(resolveCatalogEpisode(reference, merged.episodes)).toEqual({ status: 'matched', catalog: episode })
    expect(merged.episodes[0].title).toBe('Minderjährig')
  })
  it('übernimmt keine Aliase bei fremden IDs, Staffel- oder Folgennummern', () => {
    for (const changes of [{ tmdbId: 99 }, { seasonNumber: 15 }, { episodeNumber: 4 }]) {
      const wrong = { ...english, episodes: [{ ...english.episodes[0], ...changes }] }
      expect(mergeVerifiedEpisodeAliases(season, wrong).episodes[0]).toEqual(episode)
    }
    expect(mergeVerifiedEpisodeAliases(season, { ...english, seriesTmdbId: 99 }).episodes[0]).toEqual(episode)
  })
  it('lässt gleiche Aliasnamen ohne Nummer mehrdeutig und verwechselt Teil 1 nicht mit Teil 2', () => {
    const entries = [1, 2].map(n => ({ tmdbId: n, seasonNumber: 1, episodeNumber: n, title: `Echte Freunde (${n})`, titleAliases: ['Friends'] }))
    expect(resolveCatalogEpisode({ title: 'Friends' }, entries, { complete: true }).status).toBe('ambiguous')
    expect(resolveCatalogEpisode({ title: 'Echte Freunde - Teil 1' }, entries, { complete: true }).catalog.tmdbId).toBe(1)
    expect(resolveCatalogEpisode({ title: 'Echte Freunde - Part 2' }, entries, { complete: true }).catalog.tmdbId).toBe(2)
    expect(resolveCatalogEpisode({ title: 'Echte Freunde 3' }, entries, { complete: true }).status).toBe('unmatched')
  })
  it('lädt nur benötigte Staffeln, bündelt Wiederholungen und respektiert Cache und Budget', () => {
    const entries = new Map([['2734:16', season], ['2:16', { ...season, seriesTmdbId: 2 }]])
    const titles = [{ ...title, airings: [airing, airing] }, { ...title, tmdbId: 2 }]
    expect(selectEpisodeAliasRefreshCandidates(titles, entries, { now, limit: 1 })).toHaveLength(1)
    expect(selectEpisodeAliasRefreshCandidates(titles, entries, { now, limit: 0 })).toEqual([])
    entries.set('2734:16', { ...season, titleAliasesGeneratedAt: now.toISOString() })
    expect(selectEpisodeAliasRefreshCandidates([title], entries, { now })).toEqual([])
    entries.set('2734:16', mergeVerifiedEpisodeAliases(season, english))
    expect(selectEpisodeAliasRefreshCandidates([title], entries, { now })).toEqual([])
  })
  it('priorisiert kommende Ausstrahlungen, erhält aber jüngst abgelaufene Prüffälle', () => {
    const entries = new Map([['2734:16', season], ['2:16', { ...season, seriesTmdbId: 2 }]])
    const old = { ...title, tmdbId: 2, airings: [{ ...airing, startTime: '2026-10-12T12:00:00Z', stopTime: '2026-10-12T13:00:00Z' }] }
    expect(selectEpisodeAliasRefreshCandidates([old, title], entries, { now }).map(s => s.seriesTmdbId)).toEqual([2734, 2])
  })
})
