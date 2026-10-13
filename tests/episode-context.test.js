import { describe, expect, it, vi } from 'vitest'
import { episodeReference, openingEpisode, matchingEpisode } from '../src/catalog/episodeContext.js'
import { prepareDetailRequestItem } from '../src/components/detailPresentation.js'
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

  it('übernimmt keine Episode aus einer allgemeinen Serienverfügbarkeit', () => {
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
