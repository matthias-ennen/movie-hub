import { describe, expect, it } from 'vitest'
import { enrichTvSourceEpisodes } from '../scripts/tv-episode-resolution.mjs'
import { resolveCatalogEpisode, navigationEpisode } from '../src/catalog/episodeResolution.js'
import { episodeReference, matchingEpisode, mergeEpisodeReferences } from '../src/catalog/episodeContext.js'
import { prepareDetailRequestItem } from '../src/components/detailPresentation.js'
import { buildLiveAvailabilityIndex, normalizeLiveAvailabilityIndex } from '../src/sources/liveAvailabilityIndex.js'
import { buildTvRuntimeSnapshot } from '../src/tv/tvRuntimePublication.js'
import { resolveDetailTvAiring } from '../src/tv/detailTvAiring.js'

const now = Date.parse('2026-10-13T13:16:00Z')
const ep = (tmdbId, seasonNumber, episodeNumber, title) => ({ tmdbId, seasonNumber, episodeNumber, title })
const broadcast = (start, stop, episode, stationId = 'sat1gold') => ({
  startTime: `2026-10-13T${start}:00Z`, stopTime: `2026-10-13T${stop}:00Z`,
  stationId, providerIds: ['joyn'], episode,
})
const prepare = (item, airings) => prepareDetailRequestItem(item, {
  loadComplete: async value => ({ ...value, liveAvailability: { joyn: { airings } } }),
  presentArtwork: value => value, liveAvailabilityNow: now,
})

describe('kanonische TV-Episodenzuordnung', () => {
  it('ordnet abweichende Yu-Gi-Oh!-Nummerierung über einen eindeutigen Titel zu', () => {
    const episodes = [ep(1857635, 1, 165, 'Das Panzerdeck'), ep(2, 1, 21, 'Ärger im Doppelpack (3)')]
    const result = resolveCatalogEpisode({ seasonNumber: 4, episodeNumber: 21, title: 'Das Panzerdeck' }, episodes, { complete: true })
    expect(result).toEqual({ status: 'matched', catalog: episodes[0] })
    expect(matchingEpisode(episodes, navigationEpisode({ catalog: result.catalog }))).toBe(episodes[0])
  })

  it('findet Ladykracher auch ohne Quellnummer und löst einen Waltons-Nummernkonflikt', () => {
    expect(resolveCatalogEpisode({ title: 'Ultraschall Zwilling' }, [ep(589268, 5, 9, 'Ultraschall Zwilling')], { complete: true }))
      .toMatchObject({ status: 'matched', catalog: { seasonNumber: 5, episodeNumber: 9 } })
    expect(resolveCatalogEpisode({ conflict: true, title: 'Das unverstandene Kind' }, [ep(3, 3, 4, 'Das unverstandene Kind')], { complete: true }))
      .toMatchObject({ status: 'matched', catalog: { seasonNumber: 3, episodeNumber: 4 } })
  })

  it('errät weder doppelte Titel noch fehlende Kataloge oder ähnlich benannte Folgen', () => {
    const episodes = [ep(1, 1, 1, 'Der Felsen (1)'), ep(2, 1, 2, 'Der Felsen (2)'), ep(3, 2, 2, 'Der Felsen (2)')]
    expect(resolveCatalogEpisode({ title: 'Der Felsen (2)' }, episodes, { complete: true }).status).toBe('ambiguous')
    expect(resolveCatalogEpisode({ title: 'Der Felsen (3)' }, episodes, { complete: true }).status).toBe('unmatched')
    expect(resolveCatalogEpisode({ title: 'Der Felsen (1)' }, episodes).status).toBe('missing-catalog')
    expect(resolveCatalogEpisode({ seasonNumber: 1, episodeNumber: 2, title: 'Andere Folge' }, episodes, { complete: true }).status).toBe('conflict')
    expect(resolveCatalogEpisode(null, episodes).status).toBe('missing-reference')
    expect(resolveCatalogEpisode({ title: 'Der Felsen (2)' }, []).status).toBe('missing-catalog')
    expect(matchingEpisode(episodes, { ...episodes[0], resolution: 'conflict' })).toBeNull()
  })

  it('erhält Quellangaben und Zuordnung durch beide Veröffentlichungen und den Client', async () => {
    const canonical = ep(1857635, 1, 165, 'Das Panzerdeck')
    const original = { seasonNumber: 4, episodeNumber: 21, title: 'Das Panzerdeck' }
    const airing = broadcast('13:00', '14:00', original, 'yugioh')
    const source = { providerId: 'joyn', entries: [{ type: 'series', tmdbId: 902, title: 'Yu-Gi-Oh!',
      seasons: [{ seasonNumber: 1, episodeCount: 1 }], airings: [airing] }] }
    const sources = enrichTvSourceEpisodes([source], [{ seriesTmdbId: 902, seasonNumber: 1, episodes: [canonical] }])
    const index = buildLiveAvailabilityIndex(sources, { now })
    const entries = normalizeLiveAvailabilityIndex(index, { now })
    expect(entries[0].nextAiring.episode).toMatchObject({ ...original, resolution: 'matched', catalog: canonical })
    const publication = buildTvRuntimeSnapshot({ sourceCatalogs: sources, now })
    const entry = publication.days.flatMap(d => d.entries).find(e => e.tmdbId === 902)
    expect(entry.airings[0].episode.catalog).toEqual(canonical)
    const item = await prepare({ ...entry, tvAiring: entry.airings[0] }, entries[0].providers[0].airings)
    expect(item.detailEpisode).toMatchObject(canonical)
    expect(episodeReference(resolveDetailTvAiring(item, { now }))).toMatchObject(original)
    expect(source.entries[0].airings[0].episode).toEqual(original)
    expect(sources[0].episodeResolution).toMatchObject({ matched: 1, total: 1 })
  })

  it('erhält übereinstimmende kanonische IDs trotz verschiedener Anbieterzählungen', () => {
    const catalog = ep(3, 3, 4, 'Das unverstandene Kind')
    const merged = mergeEpisodeReferences({ seasonNumber: 3, episodeNumber: 5, catalog }, { seasonNumber: 3, episodeNumber: 4, catalog })
    expect(merged.conflict).toBe(true)
    expect(navigationEpisode(merged)).toMatchObject(catalog)
    expect(mergeEpisodeReferences({ catalog }, { catalog: ep(4, 3, 5, 'Andere') })).toMatchObject({ resolution: 'conflict' })
    const conflict = mergeEpisodeReferences({ catalog }, { catalog: ep(4, 3, 5, 'Andere') })
    expect(mergeEpisodeReferences(episodeReference({ episode: conflict }), { catalog }))
      .toMatchObject({ resolution: 'conflict', catalogConflict: true })
    expect(mergeEpisodeReferences(conflict, { catalog }).catalog).toBeUndefined()
  })
})

describe('ein Sendungsbezug für Auswahl und TV-Zeile', () => {
  const first = broadcast('20:00', '21:00', { seasonNumber: 9, episodeNumber: 7, title: 'Der Verrat' })
  const second = broadcast('21:00', '21:50', { seasonNumber: 9, episodeNumber: 8, title: 'Arglistige Täuschung' })
  const series = { type: 'series', tmdbId: 65824 }

  it('zeigt See No Evil Folge 8 mit ihrem Termin um 23 Uhr statt Folge 7 um 22 Uhr', async () => {
    const item = await prepare({ ...series, tvAiring: second }, [first, second])
    expect(item.detailEpisode).toEqual(second.episode)
    expect(resolveDetailTvAiring(item, { now }).startTime).toBe(second.startTime)
  })

  it('vermischt Ladykracher auf Sport1 nicht mit dem früheren FAST-Kanal', async () => {
    const fast = broadcast('13:09', '13:30', { seasonNumber: 1, episodeNumber: 13, title: 'Abschied' }, 'ladykracher')
    const sport = broadcast('15:00', '15:30', { title: 'Ultraschall Zwilling' }, 'sport1')
    const item = await prepare({ type: 'series', tmdbId: 20716, tvAiring: sport }, [fast, sport])
    expect(resolveDetailTvAiring(item, { now }).stationId).toBe('sport1')
    expect(item.detailEpisode.title).toBe('Ultraschall Zwilling')
  })

  it('ergänzt gleiche Sendungen, übernimmt aber keine Folge eines anderen Senders', async () => {
    const rich = broadcast('13:00', '14:00', { seasonNumber: 10, episodeNumber: 7, title: 'Mord aus zweiter Hand' }, 'hr')
    const empty = { ...rich, episode: undefined }
    expect((await prepare({ type: 'series', tmdbId: 53193, tvAiring: empty }, [rich])).detailEpisode).toEqual(rich.episode)
    const other = { ...empty, stationId: 'swr-rp' }
    const item = await prepare({ type: 'series', tmdbId: 53193, tvAiring: other }, [rich])
    expect(item.detailEpisode).toBeNull()
    expect(resolveDetailTvAiring(item, { now }).stationId).toBe('swr-rp')
  })

  it('respektiert manuelle Folgenwahl, fehlende Termine und den Sendungswechsel', async () => {
    const item = await prepare({ ...series, tvAiring: first }, [first, second])
    expect(resolveDetailTvAiring(item, { now, selection: second.episode }).startTime).toBe(second.startTime)
    expect(resolveDetailTvAiring(item, { now, selection: { seasonNumber: 1, episodeNumber: 1 } })).toBeNull()
    expect(resolveDetailTvAiring(item, { now: Date.parse(first.stopTime) }).episode).toEqual(second.episode)
    expect(resolveDetailTvAiring(item, { now: Date.parse(first.stopTime), selection: first.episode })).toBeNull()
    expect(resolveDetailTvAiring(item, { now: Date.parse(second.stopTime) })).toBeNull()
  })
})
