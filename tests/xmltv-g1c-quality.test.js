import { describe, expect, it } from 'vitest'
import { parseXmltvCandidates, parseXmltvEpisodeNumber } from '../src/sources/xmltv/xmltvCandidates.js'
import { inferXmltvMediaType, reviewedXmltvCategoryType } from '../scripts/xmltv-g1b-match-preview.mjs'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'
import {
  buildLocalTitleIndex, compareSourceEventHashes, measureXmltvG1c, runG1cProbe,
  xmltvEpisodeLabelFormat,
} from '../scripts/xmltv-g1c-quality-probe.mjs'

const NOW = Date.parse('2026-11-11T19:00:00Z')
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<tv>',
  '<channel id="ZDF.de"><display-name>DE - ZDF</display-name></channel>',
  '<channel id="ZDFneo.de"><display-name>DE - ZDFneo</display-name></channel>',
  '<programme channel="ZDF.de" start="20261112190000 +0100" stop="20261112210000 +0100">',
  '<title lang="de">Testfilm</title><category lang="de">Film</category><date>2020</date>',
  '<desc>Ein Film</desc></programme>',
  '<programme channel="ZDF.de" start="20261112210000 +0100" stop="20261112220000 +0100">',
  '<title lang="de">Testserie</title><category lang="de">Serie</category>',
  '<episode-num system="xmltv_ns">0.2.</episode-num><sub-title>Folge 3</sub-title></programme>',
  '<programme channel="ZDF.de" start="20261112220000 +0100" stop="20261112230000 +0100">',
  '<title>Unbekanntes Format</title></programme>',
  '<programme channel="ZDFneo.de" start="20261112200000 +0100" stop="20261112210000 +0100">',
  '<title>ZDFneo Test</title><category>Film</category></programme>',
  '</tv>',
].join('')

const rows = [
  { tmdbId: 101, type: 'movie', title: 'Testfilm', originalTitle: 'Test Film', year: 2020 },
  { tmdbId: 202, type: 'series', title: 'Testserie', year: 2012 },
]

describe('G1c real source quality audit (offline fixtures)', () => {
  it('collects only explicitly reviewed stations when bounded mappedOnly is requested', () => {
    const candidates = parseXmltvCandidates(xml, {
      sourceId: 'iptv-epg-org', stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS,
      mappedOnly: true,
    })
    expect(candidates.diagnostics.sourceRecords).toBe(4)
    expect(candidates.diagnostics.mappedCandidates).toBe(3)
    expect(candidates.diagnostics.skippedUnmapped).toBe(1)
    expect(candidates.diagnostics.unmappedCandidates).toBe(0)
    expect(candidates.candidates).toHaveLength(3)
    expect(candidates.candidates.every((candidate) => candidate.canonicalStationId === 'zdf')).toBe(true)
  })

  it('reports real metadata fields, classification and limited local exact matches separately', async () => {
    const localIndex = buildLocalTitleIndex(rows)
    expect(localIndex.titleCount).toBe(2)
    expect(localIndex.lookup({ title: 'Test Film' }, 'movie')).toHaveLength(1)
    const result = await measureXmltvG1c(xml, {
      sourceId: 'iptv-epg-org', now: NOW, localIndex,
    })
    expect(result.report.programmesInNext120h).toBe(3)
    expect(result.report.stations.zdf.programmesIn120h).toBe(3)
    expect(result.report.typed).toEqual({ movie: 1, series: 1, unclassified: 1 })
    expect(result.report.parsedEpisodes).toBe(1)
    expect(result.report.anyEpisodeFields).toBe(1)
    expect(result.report.episodeSystems).toEqual({ xmltv_ns: 1 })
    expect(result.report.productionYearEvidence).toBe(1)
    expect(result.report.descriptions).toBe(1)
    expect(result.report.subtitles).toBe(1)
    expect(result.report.localReferenceTitleCount ?? result.report.localReferenceTitles).toBe(2)
    expect(result.report.localReferenceMatches).toBe(2)
    expect(result.report.localReferenceDecisionCounts.accepted).toBe(2)
    expect(result.report.localReferenceDecisionCounts.unclassified_media).toBe(1)
    expect(result.report.categoryTop).toEqual(expect.arrayContaining([
      { category: 'film', programmes: 1 }, { category: 'serie', programmes: 1 },
    ]))
    expect(JSON.stringify(result.report)).not.toContain('Testfilm')
    expect(JSON.stringify(result.report)).not.toContain('Testserie')
    expect(result.eventHashes.size).toBe(3)
  })

  it('compares independent sources using hashed event signatures without exposing titles', async () => {
    const left = await measureXmltvG1c(xml, {
      sourceId: 'iptv-epg-org', now: NOW,
    })
    const right = await measureXmltvG1c(xml, {
      sourceId: 'freeepg', now: NOW,
    })
    const compared = compareSourceEventHashes([left, right])
    expect(compared).toEqual([{
      left: 'iptv-epg-org', right: 'freeepg',
      identicalProgrammeIntervals: 3,
      smallerFeedCandidateCount: 3,
      overlapPercentOfSmaller: 100,
    }])
  })

  it('continues measuring other feeds when one fails', async () => {
    const list = [
      { id: 'freeepg', url: 'https://fake/first' },
      { id: 'iptv-epg-org', url: 'https://fake/second' },
    ]
    const report = await runG1cProbe({
      now: NOW, feedList: list, catalogEntries: rows,
      downloader: async (url) => {
        if (url.endsWith('first')) throw new Error('temporary 503')
        return { xml, compressedBytes: 500, xmlBytes: xml.length }
      },
    })
    expect(report.sources.map((item) => item.status)).toEqual(['error', 'ok'])
    expect(report.sources[1].localReferenceMatches).toBe(2)
    expect(report.sources[0].error).toContain('503')
    expect(JSON.stringify(report)).not.toContain('Testfilm')
  })

  it('extends explicit German Film/Serie labels without guessing ambiguous genres', () => {
    expect(reviewedXmltvCategoryType('Krimiserie')).toBe('series')
    expect(reviewedXmltvCategoryType('Zeichentrickserie')).toBe('series')
    expect(reviewedXmltvCategoryType('Comedyserie')).toBe('series')
    expect(reviewedXmltvCategoryType('Sitcom')).toBe('series')
    expect(reviewedXmltvCategoryType('Dokumentarfilm')).toBe('movie')
    expect(reviewedXmltvCategoryType('Fernsehfilm')).toBe('movie')
    expect(reviewedXmltvCategoryType('Krimi')).toBeNull()
    expect(reviewedXmltvCategoryType('Drama')).toBeNull()
    expect(reviewedXmltvCategoryType('Animation')).toBeNull()
    expect(inferXmltvMediaType({ categories: ['Krimiserie'] })).toBe('series')
    expect(inferXmltvMediaType({ categories: ['Krimi', 'Action'] })).toBeNull()
    expect(inferXmltvMediaType({ categories: ['Fernsehfilm', 'Sitcom'] })).toBeNull()
  })

  it('rejects a movie with an exact title but a contradictory TMDB release year', async () => {
    const localIndex = buildLocalTitleIndex([
      { tmdbId: 33, type: 'movie', title: 'Testfilm', year: 1981 },
    ])
    const measured = await measureXmltvG1c(xml, {
      sourceId: 'iptv-epg-org', now: NOW, localIndex,
    })
    expect(measured.report.localReferenceMatches).toBe(0)
    expect(measured.report.localReferenceDecisionCounts.production_year_conflict).toBe(1)
  })

  it('distinguishes onscreen episode-label formats without inventing episode IDs', () => {
    expect(xmltvEpisodeLabelFormat('S03E12')).toBe('explicit-season-episode')
    expect(xmltvEpisodeLabelFormat('3.12.')).toBe('numeric-dotted')
    expect(xmltvEpisodeLabelFormat('Folge 5')).toBe('episode-word-number')
    expect(xmltvEpisodeLabelFormat('7/12')).toBe('number-or-fraction')
    expect(xmltvEpisodeLabelFormat('Abenteuer in zwei Teilen')).toBe('other')
  })

  it('accepts only explicit SxxEyy season/episode syntax without an XMLTV system', () => {
    expect(parseXmltvEpisodeNumber('S01E05', null)).toEqual({ seasonNumber: 1, episodeNumber: 5 })
    expect(parseXmltvEpisodeNumber('s2e101', 'onscreen'))
      .toEqual({ seasonNumber: 2, episodeNumber: 101 })
    expect(parseXmltvEpisodeNumber('S0E05', null)).toBeNull()
    expect(parseXmltvEpisodeNumber('S01E00', 'onscreen')).toBeNull()
    expect(parseXmltvEpisodeNumber('S01E05', 'thetvdb')).toBeNull()
    expect(parseXmltvEpisodeNumber('Folge 5', 'onscreen')).toBeNull()
    expect(parseXmltvEpisodeNumber('2/10', null)).toBeNull()
    expect(parseXmltvEpisodeNumber('0.4.', 'xmltv_ns'))
      .toEqual({ seasonNumber: 1, episodeNumber: 5 })
    expect(parseXmltvEpisodeNumber('S01E05', 'xmltv_ns')).toBeNull()
  })

  it('enforces a sampling budget', async () => {
    await expect(measureXmltvG1c(xml, { sourceId: 'freeepg', maxSample: 1801 }))
      .rejects.toThrow('sample budget')
  })
})
