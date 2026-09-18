import { Readable } from 'node:stream'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildQualityReport,
  parseXmltvStream,
  parseXmltvTimestamp,
  runFreeEpgQuality,
} from '../scripts/free-epg-quality.mjs'

function xmlStream(xml, chunkSize = 17) {
  const chunks = []
  for (let index = 0; index < xml.length; index += chunkSize) {
    chunks.push(Buffer.from(xml.slice(index, index + chunkSize)))
  }
  return Readable.from(chunks)
}

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="FreeEPG/2" generator-info-url="https://free-epg.de">
  <channel id="zdf.de"><display-name>ZDF HD</display-name></channel>
  <channel id="zdf-alt.de"><display-name>ZDF HD</display-name></channel>
  <programme start="20260918180000 +0200" stop="20260918200000 +0200" channel="zdf.de">
    <title>Beispiel Film</title><desc>Beschreibung</desc><category>Film</category>
  </programme>
  <programme start="20260918180000 +0200" stop="20260918200000 +0200" channel="zdf.de">
    <title>Beispiel Film</title><desc>Beschreibung</desc><category>Film</category>
  </programme>
  <programme start="20260919180000 +0200" stop="20260919190000 +0200" channel="zdf.de">
    <title>Beispiel Serie</title><sub-title>Folge 1</sub-title><category>Serie</category>
  </programme>
</tv>`

describe('FreeEPG quality import', () => {
  it('parses XMLTV timestamps including explicit offsets', () => {
    expect(parseXmltvTimestamp('20260918180000 +0200')).toEqual({
      date: new Date('2026-09-18T16:00:00.000Z'),
      hasTimezone: true,
    })
    expect(parseXmltvTimestamp('invalid')).toEqual({ date: null, hasTimezone: false })
  })

  it('streams channels and programmes without retaining the XML document', async () => {
    const stats = await parseXmltvStream(xmlStream(fixture), {
      now: new Date('2026-09-18T15:00:00.000Z'),
    })

    expect(stats.generator.name).toBe('FreeEPG/2')
    expect(stats.channels).toMatchObject({
      elements: 2,
      uniqueIds: 2,
      normalizedNames: 1,
      duplicateNormalizedNames: 1,
      duplicateIdAssignments: 1,
      unknownReferencedIds: 0,
    })
    expect(stats.programmes).toMatchObject({
      elements: 3,
      unique: 2,
      duplicates: 1,
      withDescription: 2,
      currentOrFuture: 3,
    })
    expect(stats.candidates).toMatchObject({
      movies: 2,
      uniqueMovies: 1,
      series: 1,
      uniqueSeries: 1,
    })
    expect(stats.range.latestStop).toBe('2026-09-19T17:00:00.000Z')
  })

  it('passes a current feed but reports a missed 14-day target separately', async () => {
    const now = new Date('2026-09-18T15:00:00.000Z')
    const stats = await parseXmltvStream(xmlStream(fixture), { now })
    const report = buildQualityReport({
      stats,
      source: { kind: 'test' },
      evaluatedAt: now,
      generatedAt: now,
      minimumFutureHours: 24,
      targetCoverageDays: 14,
    })

    expect(report.quality.status).toBe('pass')
    expect(report.quality.validForPrototype).toBe(true)
    expect(report.quality.targetCoverageMet).toBe(false)
    expect(report.quality.coverageAheadHours).toBe(26)
  })

  it('rejects a stale feed without hiding its measured statistics', async () => {
    const now = new Date('2026-10-01T00:00:00.000Z')
    const stats = await parseXmltvStream(xmlStream(fixture), { now })
    const report = buildQualityReport({
      stats,
      source: { kind: 'test' },
      evaluatedAt: now,
      generatedAt: now,
    })

    expect(report.quality.status).toBe('fail')
    expect(report.quality.validForPrototype).toBe(false)
    expect(report.xmltv.programmes.currentOrFuture).toBe(0)
    expect(report.quality.reasons).toContain('No current or future programme entries found.')
  })

  it('fails closed on malformed XML', async () => {
    await expect(parseXmltvStream(xmlStream('<tv><programme></tv>'))).rejects.toThrow()
  })

  it('writes a diagnostic report even when XML parsing fails', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'movie-hub-epg-test-'))
    const inputPath = resolve(directory, 'broken.xml')
    const outputPath = resolve(directory, 'report.json')
    await writeFile(inputPath, '<tv><programme></tv>', 'utf8')

    try {
      await expect(runFreeEpgQuality({ inputPath, outputPath })).rejects.toThrow()
      const report = JSON.parse(await readFile(outputPath, 'utf8'))
      expect(report.quality.status).toBe('fail')
      expect(report.failure.stage).toBe('xmltv-parse')
      expect(report.failure.message).toMatch(/tag/i)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
