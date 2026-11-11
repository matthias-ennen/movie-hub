import { describe, it, expect } from 'vitest'
import {
  FEEDS, parseXmltvTimestamp, analyzeXmltvDocument, runXmltvSourceProbe,
  downloadXmltvFeed,
} from '../scripts/probe-xmltv-feeds.mjs'

const TODAY = Date.parse('2026-11-11T12:00:00Z')
const SAMPLE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<tv>',
  '<channel id="zdf.example"><display-name>ZDF HD</display-name></channel>',
  '<channel id="other"><display-name>Other TV</display-name></channel>',
  '<programme channel="zdf.example" start="20261111191500 +0100" stop="20261111211500 +0100">',
  '<title lang="de">Film</title><sub-title>Teil 1</sub-title>',
  '<desc lang="de">Beschreibung</desc><episode-num system="xmltv_ns">0.0.</episode-num>',
  '</programme>',
  '<programme channel="zdf.example" start="20261112191500 +0100" stop="20261112211500 +0100">',
  '<title>Folge 2</title>',
  '</programme>',
  '<programme channel="other" start="20261112190000 +0100" stop="20261112200000 +0100">',
  '<title>Nachrichten</title>',
  '</programme>',
  '</tv>',
].join('')

describe('XMLTV source probe (offline, without external requests)', () => {
  it('parses explicit XMLTV time offsets and rejects impossible calendar dates', () => {
    expect(parseXmltvTimestamp('20261111191500 +0100'))
      .toBe(Date.parse('2026-11-11T18:15:00Z'))
    expect(parseXmltvTimestamp('20261111191500 -0500'))
      .toBe(Date.parse('2026-11-12T00:15:00Z'))
    expect(parseXmltvTimestamp('20260230120000 +0100')).toBe(null)
    expect(parseXmltvTimestamp('20261111250000 +0100')).toBe(null)
    expect(parseXmltvTimestamp('garbage')).toBe(null)
  })

  it('computes per-station current/future days and metadata presence without exporting programme titles', () => {
    const report = analyzeXmltvDocument(SAMPLE, { now: TODAY })
    expect(report.channelsWithProgrammes).toBe(2)
    expect(report.programmesTotal).toBe(3)
    expect(report.futureProgrammes).toBe(3)
    expect(report.programmesWithDescription).toBe(1)
    expect(report.programmesWithEpisodeNumber).toBe(1)
    expect(report.programmesWithSubtitle).toBe(1)
    expect(report.keyChannels.ZDF.channelEntries).toBe(1)
    expect(report.keyChannels.ZDF.daysFromToday).toBe(2)
    expect(report.keyChannels.ZDF.daysFromTomorrow).toBe(1)
    expect(report.keyChannels.RTL.daysFromToday).toBe(0)
    expect(JSON.stringify(report)).not.toContain('Beschreibung')
    expect(JSON.stringify(report)).not.toContain('Folge 2')
  })

  it('rejects non-XMLTV roots, invalid times and DOCTYPE documents', () => {
    expect(() => analyzeXmltvDocument('<html/>')).toThrow('Not an XMLTV')
    expect(() => analyzeXmltvDocument('<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///etc/passwd">]><tv/>'))
      .toThrow('DOCTYPE')
    const report = analyzeXmltvDocument(
      '<tv><programme channel="zdf" start="bad" stop="bad"><title>No</title></programme></tv>',
      { now: TODAY },
    )
    expect(report.invalidProgrammes).toBe(1)
    expect(report.channelsWithProgrammes).toBe(0)
  })

  it('isolates one failed provider and preserves the successful provider report', async () => {
    const feeds = [
      { id: 'offline', url: FEEDS[0].url },
      { id: 'working', url: FEEDS[1].url },
    ]
    const result = await runXmltvSourceProbe({
      now: TODAY, feeds,
      downloader: async (url) => {
        if (url === FEEDS[0].url) throw new Error('HTTP status 503')
        return { xml: SAMPLE, compressedBytes: 300, xmlBytes: 1000, lastModified: null }
      },
    })
    expect(result.sources.map((source) => source.status)).toEqual(['error', 'ok'])
    expect(result.sources[1].futureProgrammes).toBe(3)
    expect(result.sources[0].error).toContain('503')
  })

  it('compares station programme fingerprints regardless of XML ordering', () => {
    const channel = '<channel id="ZDF.de"><display-name>ZDF</display-name></channel>'
    const first = '<programme channel="ZDF.de" start="20261112190000 +0100" stop="20261112200000 +0100"><title>A</title></programme>'
    const second = '<programme channel="ZDF.de" start="20261112200000 +0100" stop="20261112210000 +0100"><title>B</title></programme>'
    const a = analyzeXmltvDocument('<tv>' + channel + first + second + '</tv>', { now: TODAY })
    const b = analyzeXmltvDocument('<tv>' + channel + second + first + '</tv>', { now: TODAY })
    expect(a.keyChannels.ZDF.matchedVariants[0].fingerprint)
      .toBe(b.keyChannels.ZDF.matchedVariants[0].fingerprint)
    expect(a.keyChannels.ZDF.matchedVariants[0].fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(a)).not.toContain('<title>')
  })

  it('forbids arbitrary URLs before making any network request', async () => {
    let called = false
    await expect(downloadXmltvFeed('https://example.invalid/epg.xml', {
      fetcher: async () => { called = true },
    })).rejects.toThrow('allowlist')
    expect(called).toBe(false)
  })
})
