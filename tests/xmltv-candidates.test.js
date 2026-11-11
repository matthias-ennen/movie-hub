import { describe, it, expect } from 'vitest'
import {
  parseXmltvCandidates,
  parseXmltvEpisodeNumber,
  projectConfirmedXmltvBroadcastEvent,
} from '../src/sources/xmltv/xmltvCandidates.js'
import { exactBroadcastEventKey } from '../src/sources/sourceAdapterContract.js'
import { parseXmltvTimestamp } from '../src/sources/xmltv/xmltvTime.js'

const DATE = '2026-11-11T20:00:00.000Z'
const mappings = {
  'iptv-epg-org': {
    'ZDF.de': { stationId: 'zdf-de', stationName: 'ZDF' },
    'DasErste.de': { stationId: 'das-erste-de', stationName: 'Das Erste' },
  },
}
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<tv>',
  '<channel id="ZDF.de"><display-name>DE - ZDF</display-name></channel>',
  '<channel id="ZDFneo.de"><display-name>DE - ZDFneo</display-name></channel>',
  '<programme channel="ZDF.de" start="20261114201500 +0100" stop="20261114214500 +0100">',
  '<title lang="en">The Series</title><title lang="de">Die Serie</title>',
  '<sub-title lang="de">Ein neuer Fall</sub-title>',
  '<desc lang="de">Beschreibung <![CDATA[mit Details]]></desc>',
  '<category>Serie</category><episode-num system="xmltv_ns">0.4.</episode-num>',
  '</programme>',
  '<programme channel="ZDFneo.de" start="20261114201500 +0100" stop="20261114214500 +0100">',
  '<title>Anderer Film</title>',
  '</programme>',
  '<programme channel="ZDF.de" start="20261114201500 +0100" stop="20261114214500 +0100">',
  '<title lang="de">Die Serie</title><title lang="en">The Series</title>',
  '</programme>',
  '<programme channel="ZDF.de" start="20261114234500 +0100" stop="20261115004500 +0100">',
  '<title>Spätfilm</title>',
  '</programme>',
  '</tv>',
].join('')

describe('XMLTV G1 candidate staging', () => {
  it('maps only exact approved station ids and preserves provider/source separation', () => {
    const data = parseXmltvCandidates(xml, {
      sourceId: 'iptv-epg-org', stationMappings: mappings, observedAt: DATE,
    })
    expect(data.diagnostics.sourceRecords).toBe(4)
    expect(data.diagnostics.duplicates).toBe(1)
    expect(data.diagnostics.candidates).toBe(3)
    expect(data.diagnostics.mappedCandidates).toBe(2)
    expect(data.diagnostics.unmappedCandidates).toBe(1)

    const zdf = data.candidates[0]
    expect(zdf.title).toBe('Die Serie')
    expect(zdf.subtitle).toBe('Ein neuer Fall')
    expect(zdf.description).toBe('Beschreibung mit Details')
    expect(zdf.episode).toEqual({ seasonNumber: 1, episodeNumber: 5 })
    expect(zdf.canonicalStationId).toBe('zdf-de')
    expect(zdf.stationName).toBe('ZDF')
    expect(zdf.sourceRef.sourceId).toBe('xmltv:iptv-epg-org')
    expect(zdf.startAt).toBe('2026-11-14T19:15:00.000Z')
    expect(zdf.endAt).toBe('2026-11-14T20:45:00.000Z')
    expect(zdf).not.toHaveProperty('tmdbId')
    expect(zdf).not.toHaveProperty('providerIds')
    expect(zdf).not.toHaveProperty('playbackRoutes')

    const zdfneo = data.candidates[1]
    expect(zdfneo.sourceStationId).toBe('ZDFneo.de')
    expect(zdfneo.stationMappingStatus).toBe('unmapped')
    expect(zdfneo.canonicalStationId).toBeNull()
    expect(data.channels).toHaveLength(2)
  })

  it('projects only explicitly accepted TMDB identities and does not invent playback', () => {
    const { candidates } = parseXmltvCandidates(xml, {
      sourceId: 'iptv-epg-org', stationMappings: mappings, observedAt: DATE,
    })
    const [zdf, unmapped] = candidates
    expect(projectConfirmedXmltvBroadcastEvent(zdf, { mediaType: 'series', tmdbId: 321 })).toBeNull()
    expect(projectConfirmedXmltvBroadcastEvent(unmapped, {
      accepted: true, mediaType: 'movie', tmdbId: 12,
    })).toBeNull()
    expect(projectConfirmedXmltvBroadcastEvent(zdf, {
      accepted: true, mediaType: 'series', tmdbId: -1,
    })).toBeNull()

    const mapped = projectConfirmedXmltvBroadcastEvent(zdf, {
      accepted: true, mediaType: 'series', tmdbId: 321, confidence: 0.94, reason: 'exact-match',
    })
    expect(mapped.kind).toBe('broadcast')
    expect(mapped.titleRef).toEqual({ mediaType: 'series', tmdbId: 321 })
    expect(mapped.channelId).toBe('zdf-de')
    expect(mapped.episode).toMatchObject({ seasonNumber: 1, episodeNumber: 5, title: 'Ein neuer Fall' })
    expect(mapped.playbackRoutes).toEqual([])
    expect(mapped.sourceRefs[0].sourceId).toBe('xmltv:iptv-epg-org')
    expect(mapped.matchConfidence).toBe(0.94)
    expect(exactBroadcastEventKey(mapped)).toContain('series:321|zdf-de')
  })

  it('does not automatically map equal-looking names across EPG sources', () => {
    const result = parseXmltvCandidates(xml, {
      sourceId: 'epgshare01', stationMappings: mappings, observedAt: DATE,
    })
    expect(result.diagnostics.mappedCandidates).toBe(0)
    expect(result.diagnostics.unmappedCandidates).toBe(3)
    expect(result.candidates[0].canonicalStationId).toBeNull()
  })

  it('uses timestamps with DST-safe explicit offsets', () => {
    expect(parseXmltvTimestamp('20261025023000 +0200')).toBe(Date.parse('2026-10-25T00:30:00Z'))
    expect(parseXmltvTimestamp('20261025023000 +0100')).toBe(Date.parse('2026-10-25T01:30:00Z'))
    expect(parseXmltvTimestamp('20260230000000 +0100')).toBeNull()
  })

  it('treats unknown episode formats and bare dates conservatively', () => {
    expect(parseXmltvEpisodeNumber('0.9.', 'xmltv_ns')).toEqual({
      seasonNumber: 1, episodeNumber: 10,
    })
    expect(parseXmltvEpisodeNumber('0.9/12.', 'xmltv_ns')).toEqual({
      seasonNumber: 1, episodeNumber: 10,
    })
    expect(parseXmltvEpisodeNumber('S01E10', 'onscreen')).toEqual({ seasonNumber: 1, episodeNumber: 10 })
    expect(parseXmltvEpisodeNumber('0.9.', 'onscreen')).toBeNull()
    const doc = '<tv><programme channel="ZDF.de" start="20261111200000" stop="20261111210000">' +
      '<title>Uncertain Zone</title></programme></tv>'
    const result = parseXmltvCandidates(doc, {
      sourceId: 'iptv-epg-org', stationMappings: mappings, observedAt: DATE,
    })
    expect(result.diagnostics.missingTimeZone).toBe(1)
    expect(result.candidates[0].timestampsExplicitlyZoned).toBe(false)
  })

  it('fails closed for malformed XML, DTD entities, excessive records, bad station mapping', () => {
    const options = { sourceId: 'iptv-epg-org', stationMappings: mappings, observedAt: DATE }
    expect(() => parseXmltvCandidates('<html/>', options)).toThrow(/XMLTV tv root/)
    expect(() => parseXmltvCandidates('<!DOCTYPE tv [<!ENTITY ext SYSTEM "file:///tmp/secret">]><tv/>', options))
      .toThrow(/DOCTYPE/)
    expect(() => parseXmltvCandidates(xml, { ...options, maxRecords: 2 }))
      .toThrow(/record limit/)
    expect(() => parseXmltvCandidates(xml, { ...options, sourceId: '../bad' }))
      .toThrow(/sourceId/)
  })
})
