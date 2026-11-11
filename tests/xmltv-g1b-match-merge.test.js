import { describe, expect, it } from 'vitest'
import { XMLTV_REVIEWED_STATION_MAPPINGS, XMLTV_REVIEWED_STATIONS,
  reviewedXmltvStation } from '../src/sources/xmltv/xmltvStationMappings.js'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { WAIPU_MOVIE_HUB_STATIONS } from '../scripts/waipu-station-order.mjs'
import {
  inferXmltvMediaType, matchXmltvLocalCandidates,
  buildXmltvConfirmedEnvelope, mergeConfirmedXmltvAirings,
} from '../scripts/xmltv-g1b-match-preview.mjs'
import { mergeTvAirings } from '../src/sources/mergeTvAirings.js'

const observed = '2026-11-11T19:00:00.000Z'
const six = [
  ['ard', 'Das Erste', 'DasErste.de', 'Das.Erste.de'],
  ['zdf', 'ZDF', 'ZDF.de', 'ZDF.de'],
  ['rtl', 'RTL', 'RTL.de', 'RTL.de'],
  ['pro7', 'ProSieben', 'ProSieben.de', 'ProSieben.de'],
  ['sat1', 'SAT.1', 'SAT1.de', 'SAT.1.de'],
  ['vox', 'VOX', 'VOX.de', 'VOX.de'],
]
const sample = (channel = 'ZDF.de', title = 'Testfilm', categories = '<category>Film</category>') =>
  '<tv><channel id="' + channel + '"><display-name>DE - ZDF</display-name></channel>' +
  '<programme channel="' + channel + '" start="20261114201500 +0100" stop="20261114221500 +0100">' +
  '<title lang="de">' + title + '</title><desc lang="de">Fiktives Programmbeispiel</desc>' +
  categories + '</programme></tv>'

function candidates(sourceId = 'iptv-epg-org', xml = sample()) {
  return parseXmltvCandidates(xml, {
    sourceId, stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS, observedAt: observed,
  }).candidates
}

const acceptedMatches = (input) => [{
  type: input === 'series' ? 'series' : 'movie', tmdbId: 86423, title: 'Testfilm',
}]

describe('G1b source-specific XMLTV-to-MovieHub station registry', () => {
  it('uses exactly the verified live G0 identifiers and reuses existing Waipu/Joyn canonical ids', () => {
    const existing = new Map(WAIPU_MOVIE_HUB_STATIONS.map(({ id, name }) => [id, name]))
    expect(XMLTV_REVIEWED_STATIONS).toHaveLength(6)
    for (const [id, name, shared, epgshare] of six) {
      expect(existing.get(id)).toBe(name)
      expect(reviewedXmltvStation('iptv-epg-org', shared)).toEqual({
        stationId: id, stationName: name,
      })
      expect(reviewedXmltvStation('freeepg', shared)?.stationId).toBe(id)
      expect(reviewedXmltvStation('epgshare01', epgshare)?.stationId).toBe(id)
    }
  })

  it('does not confuse regional variants, numeric alternate feeds, ZDFneo or renamed identifiers', () => {
    expect(reviewedXmltvStation('freeepg', '76627')).toBeNull()
    expect(reviewedXmltvStation('iptv-epg-org', 'ZDFneo.de')).toBeNull()
    expect(reviewedXmltvStation('iptv-epg-org', 'RTLHBNDS.de')).toBeNull()
    expect(reviewedXmltvStation('iptv-epg-org', 'ZDF.DE')).toBeNull()
    expect(reviewedXmltvStation('unknown-source', 'ZDF.de')).toBeNull()
    expect(reviewedXmltvStation('freeepg', '__proto__')).toBeNull()
    expect(reviewedXmltvStation('freeepg', 'constructor')).toBeNull()
    expect(reviewedXmltvStation('__proto__', 'ZDF.de')).toBeNull()
    expect(candidates('iptv-epg-org')[0]).toMatchObject({
      canonicalStationId: 'zdf', stationMappingStatus: 'mapped',
    })
    expect(candidates('epgshare01', sample('Das.Erste.de'))[0].canonicalStationId).toBe('ard')
  })
})

describe('G1b bounded reuse of the existing Joyn/TMDB matching decision', () => {
  it('accepts only an exact, unique, locally typed match without creating a provider or link', async () => {
    const source = candidates()
    const result = await matchXmltvLocalCandidates(source, {
      localCandidatesFor: async (_, mediaType) => acceptedMatches(mediaType),
    })
    expect(inferXmltvMediaType(source[0])).toBe('movie')
    expect(result.counts).toMatchObject({ received: 1, accepted: 1, rejected: 0 })
    const event = result.confirmedEvents[0]
    expect(event).toMatchObject({
      kind: 'broadcast',
      channelId: 'zdf',
      channelName: 'ZDF',
      titleRef: { mediaType: 'movie', tmdbId: 86423 },
    })
    expect(event.playbackRoutes).toEqual([])
    expect(event.sourceRefs[0]).toMatchObject({ sourceId: 'xmltv:iptv-epg-org' })
    expect(buildXmltvConfirmedEnvelope('iptv-epg-org', result.confirmedEvents)).toMatchObject({
      sourceId: 'xmltv:iptv-epg-org', sourceStatus: 'healthy',
      records: [expect.objectContaining({ kind: 'broadcast' })],
    })
    expect(() => buildXmltvConfirmedEnvelope('epgshare01', result.confirmedEvents))
      .toThrow(/provenance/)
  })

  it('keeps conflicting type signals, unknown titles and absent timezones out of confirmed results', async () => {
    const conflict = candidates('iptv-epg-org',
      sample('ZDF.de', 'Testfilm', '<category>Film</category><episode-num system="xmltv_ns">0.2.</episode-num>'))
    expect(inferXmltvMediaType(conflict[0])).toBeNull()
    const noCategory = candidates('iptv-epg-org', sample('ZDF.de', 'Testfilm', ''))
    expect(inferXmltvMediaType(noCategory[0])).toBeNull()
    const untyped = await matchXmltvLocalCandidates(noCategory, {
      localCandidatesFor: async () => acceptedMatches('movie'),
    })
    expect(untyped.counts.reasons).toEqual({ unclassified_media: 1 })
    const missingZone = candidates('iptv-epg-org', sample().replaceAll(' +0100', ''))
    const result = await matchXmltvLocalCandidates(missingZone, {
      localCandidatesFor: async () => acceptedMatches('movie'),
    })
    expect(result.counts.reasons).toEqual({ ambiguous_timezone: 1 })
  })

  it('does not resolve same-name different-year works without disambiguating evidence', async () => {
    const result = await matchXmltvLocalCandidates(candidates(), {
      localCandidatesFor: async () => [
        { type: 'movie', tmdbId: 1, title: 'Testfilm', year: 1990 },
        { type: 'movie', tmdbId: 2, title: 'Testfilm', year: 2022 },
      ],
    })
    expect(result.confirmedEvents).toHaveLength(0)
    expect(result.counts.rejected).toBe(1)
    expect(result.decisions[0].reason).toMatch(/ambiguous/)
  })

  it('rejects over-budget input before invoking the local matcher', async () => {
    await expect(matchXmltvLocalCandidates(Array(2001).fill({}), {
      localCandidatesFor: async () => [],
    })).rejects.toThrow(/limit/)
    await expect(matchXmltvLocalCandidates([], {})).rejects.toThrow(/local TMDB/)
  })
})

describe('G1b reuse of the shared airing merge without source or provider loss', () => {
  it('merges equivalent Waipu, Joyn and two XMLTV feeds as one broadcast retaining provenance', async () => {
    const items = [...candidates('freeepg'), ...candidates('iptv-epg-org')]
    const { confirmedEvents } = await matchXmltvLocalCandidates(items, {
      localCandidatesFor: async (_, mediaType) => acceptedMatches(mediaType),
    })
    expect(confirmedEvents).toHaveLength(2)
    const common = {
      stationId: 'zdf', stationName: 'ZDF',
      tmdbId: 86423, type: 'movie',
      startTime: '2026-11-14T19:15:00.000Z', stopTime: '2026-11-14T21:15:00.000Z',
    }
    const waipu = {
      ...common, providerIds: ['waipu'],
      sourceRefs: [{ sourceId: 'waipu-epg', externalId: 'waipu-a', observedAt: observed }],
      playbackRoutes: [{ providerId: 'waipu', mode: 'APP_DEEP_LINK', target: 'https://app.waipu.tv/epgdetails/a/b' }],
    }
    const joyn = {
      ...common, providerIds: ['joyn'],
      sourceRefs: [{ sourceId: 'joyn-epg', externalId: 'joyn-b', observedAt: observed }],
      playbackRoutes: [{ providerId: 'joyn', mode: 'WEB_LINK', target: 'https://www.joyn.de/live-tv/zdf' }],
    }
    const merged = mergeConfirmedXmltvAirings([waipu], [joyn], confirmedEvents)
    expect(merged).toHaveLength(1)
    expect(merged[0].providerIds).toEqual(['joyn', 'waipu'])
    expect(merged[0].playbackRoutes).toHaveLength(2)
    expect(merged[0].sourceRefs.map((ref) => ref.sourceId).sort()).toEqual([
      'joyn-epg', 'waipu-epg', 'xmltv:freeepg', 'xmltv:iptv-epg-org',
    ])
    expect(merged[0].sourceStationIds).toContain('ZDF.de')
  })

  it('keeps same movie at different times or on different stations as separate broadcasts', () => {
    const one = {
      stationId: 'zdf', tmdbId: 86423, type: 'movie',
      startTime: '2026-11-14T19:15:00.000Z', stopTime: '2026-11-14T21:15:00.000Z',
    }
    const merged = mergeTvAirings(
      [{ ...one, providerIds: ['waipu'] }],
      [{ ...one, stationId: 'ard', providerIds: ['joyn'] }],
      [{ ...one, startTime: '2026-11-14T22:15:00.000Z', stopTime: '2026-11-14T23:15:00.000Z' }],
    )
    expect(merged).toHaveLength(3)
  })
})
