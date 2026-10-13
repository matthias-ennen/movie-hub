import { describe, expect, it, vi } from 'vitest'
import { episodeReference, openingEpisode, matchingEpisode } from '../src/catalog/episodeContext.js'
import { detailInitialImageUrl, prepareDetailRequestItem } from '../src/components/detailPresentation.js'
import { resolveDetailTvAiring } from '../src/tv/detailTvAiring.js'
import { buildLiveAvailabilityIndex, normalizeLiveAvailabilityIndex } from '../src/sources/liveAvailabilityIndex.js'

describe('expliziter Episodenkontext der Detailansicht', () => {
  it('liest flache und neutrale Episodendaten ohne fehlende Werte in Null umzuwandeln', () => {
    expect(episodeReference({ seasonNumber: 3, episodeNumber: 7, episodeTitle: 'Folgentitel' }))
      .toEqual(episodeReference({ episode: { seasonNumber: 3, episodeNumber: 7, title: 'Folgentitel' } }))
    expect(episodeReference({ seasonNumber: null, episodeNumber: '' })).toBeNull()
    expect(episodeReference({ episode: { seasonNumber: 0, episodeNumber: 1 } }))
      .toMatchObject({ seasonNumber: 0, episodeNumber: 1 })
    expect(episodeReference({ seasonNumber: -1, episodeNumber: 'ungültig' })).toBeNull()
  })

  it('liest den vorbereiteten Kontext, ohne selbst Verfügbarkeiten auszuwählen', () => {
    const airing = { seasonNumber: 2, episodeNumber: 8 }
    expect(openingEpisode({ type: 'series', liveAvailability: { joyn: { nextAiring: airing } } })).toBeNull()
    expect(openingEpisode({ type: 'movie', tvAiring: airing })).toBeNull()
  })

  it('behält den Einstieg nach Metadatenbeladung, ohne eine andere Folge einzusetzen', async () => {
    const item = { type: 'series', tmdbId: 42, tvAiring: { episode: { seasonNumber: 3, episodeNumber: 7, title: 'Gewählt' } } }
    const loadComplete = vi.fn(async () => ({ type: 'series', tmdbId: 42, tvAiring: { seasonNumber: 1, episodeNumber: 1 } }))
    const result = await prepareDetailRequestItem(item, { loadComplete, presentArtwork: (value) => value })
    expect(result.detailEpisode).toEqual({ seasonNumber: 3, episodeNumber: 7, title: 'Gewählt' })
    expect(loadComplete).toHaveBeenCalledOnce()
    const general = await prepareDetailRequestItem({ type: 'series', tmdbId: 42 }, {
      loadComplete: async () => result, presentArtwork: (value) => value,
    })
    expect(openingEpisode(general)).toBeNull()
  })

  it('ordnet nur vorhandene Folgen derselben Staffel zu', () => {
    const episodes = [{ seasonNumber: 3, episodeNumber: 7, title: 'Sieben' }]
    expect(matchingEpisode(episodes, { seasonNumber: 3, episodeNumber: 7 })).toBe(episodes[0])
    expect(matchingEpisode(episodes, { seasonNumber: 2, episodeNumber: 7 })).toBeNull()
    expect(matchingEpisode(episodes, { seasonNumber: 3, episodeNumber: 9 })).toBeNull()
    expect(matchingEpisode(episodes, { title: 'Sieben' })).toBeNull()
  })

  it('erhält Episodenangaben beim Kompaktieren und Laden der Live-Verfügbarkeit', () => {
    const now = Date.parse('2026-10-13T08:00:00Z')
    const airing = { stationId: 'sender', startTime: '2026-10-13T09:00:00Z', stopTime: '2026-10-13T10:00:00Z',
      seasonNumber: 3, episodeNumber: 7, episodeTitle: 'Die Folge' }
    const index = buildLiveAvailabilityIndex([{ providerId: 'joyn', entries: [{ type: 'series', tmdbId: 42, airings: [airing] }] }], { now })
    const entries = normalizeLiveAvailabilityIndex(index, { now })
    expect(entries[0].nextAiring.episode).toEqual({ seasonNumber: 3, episodeNumber: 7, title: 'Die Folge' })
  })
})

describe('einheitliche Vorauswahl aus vorhandener TV-Verfügbarkeit', () => {
  // Öffentlicher Datensatz aus Matthias' Screenshot vom 13.10.2026, 14:31 Uhr.
  const now = Date.parse('2026-10-13T12:31:00Z')
  const title = { type: 'series', tmdbId: 2734, title: 'Law & Order: Special Victims Unit',
    seasons: [{ seasonNumber: 16, episodeCount: 23, posterUrl: '/season-16.jpg' }] }
  const current = { providerIds: ['waipu'], stationId: '13thstreet', stationName: '13th Street',
    startTime: '2026-10-13T12:10:00Z', stopTime: '2026-10-13T12:55:00Z',
    episode: { seasonNumber: 16, episodeNumber: 1, title: 'Verschwundene Mädchen' } }
  const next = { ...current, startTime: current.stopTime, stopTime: '2026-10-13T13:45:00Z',
    episode: { seasonNumber: 16, episodeNumber: 2, title: 'Gescheitert' } }
  const prepare = (input = title, airings = [current, next], extra = {}, timestamp = now) => prepareDetailRequestItem(input, {
    loadComplete: async () => ({ ...title, ...extra, liveAvailability: { waipu: { airings } } }),
    presentArtwork: value => value, liveAvailabilityNow: timestamp,
  })

  it.each([false, true])('wählt beim allgemeinen und konkreten Einstieg dieselbe Folge (TV-Einstieg: %s)', async (specific) => {
    const result = await prepare(specific ? { ...title, tvAiring: current } : title)
    expect(openingEpisode(result)).toEqual(current.episode)
    expect(openingEpisode(result)).toEqual(episodeReference(resolveDetailTvAiring(result, { now })))
    expect(detailInitialImageUrl(result)).toBe('/season-16.jpg')
  })

  it('behält eine ausdrücklich gewählte andere Folge', async () => {
    expect(openingEpisode(await prepare({ ...title, tvAiring: next }))).toEqual(next.episode)
    expect(openingEpisode(await prepare({ ...title, detailEpisode: next.episode }))).toEqual(next.episode)
  })

  it('verwendet beim allgemeinen Einstieg keine alte Auswahl aus dem Metadaten-Cache', async () => {
    const stale = { seasonNumber: 2, episodeNumber: 5, title: 'Alter Einstieg' }
    const result = await prepare(title, [current], { detailEpisode: stale, tvAiring: { episode: stale } })
    expect(openingEpisode(result)).toEqual(current.episode)
  })

  it('nutzt nach Ablauf dieselbe nächste Sendung wie die TV-Zeile', async () => {
    const timestamp = Date.parse(current.stopTime)
    const result = await prepare(title, [current, next], {}, timestamp)
    expect(openingEpisode(result)).toEqual(next.episode)
    expect(openingEpisode(result)).toEqual(episodeReference(resolveDetailTvAiring(result, { now: timestamp })))
    expect(openingEpisode(await prepare(title, [current], {}, timestamp))).toBeNull()
  })

  it.each([
    { seasonNumber: 16, episodeNumber: null, title: '' },
    { seasonNumber: null, episodeNumber: null, title: 'Uneindeutig', conflict: true },
  ])('erhält unvollständige/konfliktbehaftete Angaben ohne eine spätere Folge einzusetzen', async episode => {
    expect(openingEpisode(await prepare(title, [{ ...current, episode }, next]))).toEqual(episode)
  })

  it('bleibt ohne Episodenangaben bei der freien Auswahl', async () => {
    expect(openingEpisode(await prepare(title, [{ ...current, episode: undefined }]))).toBeNull()
    expect(openingEpisode(await prepare(title, []))).toBeNull()
  })
})
