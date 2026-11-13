import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mkdtemp, readFile, writeFile, rm, stat,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseXmltvCandidates } from '../src/sources/xmltv/xmltvCandidates.js'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from '../src/sources/xmltv/xmltvStationMappings.js'
import { buildXmltvPrivateSourceGeneration } from '../src/sources/xmltv/xmltvPrivateStaging.js'
import { FEEDS } from '../scripts/probe-xmltv-feeds.mjs'
import {
  runXmltvG2PrivateStaging, isSafeXmltvG2StagingReport,
} from '../scripts/xmltv-g2-private-staging.mjs'

const NOW = Date.parse('2026-11-13T19:00:00Z')
const DAY = 86_400_000
const PRIVATE = 'SENSITIVE_XMLTV_PROGRAM_TITLE_DO_NOT_PUBLISH'
const roots = []
const iso = ms => new Date(ms).toISOString()
function utcXmltv(ms) {
  const date = new Date(ms)
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
}
const sourceStationId = (sourceId, stationId) => {
  const entries = XMLTV_REVIEWED_STATION_MAPPINGS[sourceId]
  return Object.entries(entries).find(([, x]) => x.stationId === stationId)?.[0]
}
function makeXml(sourceId, days, stations = ['ard', 'zdf', 'rtl', 'pro7', 'sat1', 'vox']) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv>']
  for (const stationId of stations) {
    const sourceStation = sourceStationId(sourceId, stationId)
    lines.push('<channel id="' + sourceStation + '"><display-name>' +
      stationId + '</display-name></channel>')
    for (let d = 0; d < days; d++) {
      lines.push('<programme channel="' + sourceStation +
        '" start="' + utcXmltv(NOW + d * DAY) +
        '" stop="' + utcXmltv(NOW + (d + 1) * DAY) +
        '"><title lang="de">' + PRIVATE + '</title>' +
        '<desc>PRIVATE_DESCRIPTION_NOT_FOR_REPORT</desc>' +
        '<category>Film</category></programme>')
    }
  }
  return lines.concat('</tv>').join('')
}
async function root() {
  const target = await mkdtemp(join(tmpdir(), 'moviehub-xmltv-g2c-'))
  roots.push(target)
  return target
}
afterEach(async () => {
  await Promise.all(roots.map(x => rm(x, { force: true, recursive: true })))
  roots.length = 0
})
const feed = id => FEEDS.find(x => x.id === id)
function downloaderFor(counts) {
  return vi.fn(async url => {
    const entry = FEEDS.find(x => x.url === url)
    const days = counts[entry?.id]
    if (days === 'fail') throw new Error(PRIVATE + ' unexpected upstream error')
    if (days === 'doctype') return { xml: '<!DOCTYPE tv [<!ENTITY x "bad">]><tv></tv>' }
    if (days === 'timezone') {
      const id = sourceStationId(entry.id, 'zdf')
      return { xml: '<tv><programme channel="' + id +
        '" start="20261113190000" stop="20261114190000"><title>' +
        PRIVATE + '</title></programme></tv>' }
    }
    return { xml: makeXml(entry.id, days || 0) }
  })
}
const stage = (sourceId, days, stations) => {
  const parsed = parseXmltvCandidates(makeXml(sourceId, days, stations), {
    sourceId, stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS,
    observedAt: iso(NOW), mappedOnly: true,
  })
  return buildXmltvPrivateSourceGeneration(parsed, { now: NOW })
}

describe('#336 G2c actual source generations, isolated staging only', () => {
  it('stores ACTUAL two-day original XMLTV programmes privately with provenance', async () => {
    const directory = await root()
    const fetcher = downloaderFor({ epgshare01: 2 })
    const result = await runXmltvG2PrivateStaging({
      now: NOW, feedList: [feed('epgshare01')],
      downloader: fetcher, privateRoot: directory,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      mode: 'ephemeral-private-no-publication', maxPreviewDays: 14,
      totalStagedProgrammes: 12, stagedSourceCount: 1,
      availableIndependentFamilies: 1, fiveDaysRequiredToKeepSource: false,
      publishApproved: false, tmdbIdentityApproved: false,
      playbackRoutesApproved: false, reuseRightsApproved: false,
      sources: [{
        sourceId: 'epgshare01', status: 'staged', stagedProgrammes: 12,
        stationsWithProgrammes: 6, fiveDayCompleteStations: 0,
        maxContinuousMinutes: 2880, maxLatestProgrammeMinutes: 2880,
        recordedInPrivateWorkspace: true,
      }],
    })
    expect(isSafeXmltvG2StagingReport(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(PRIVATE)
    expect(JSON.stringify(result)).not.toContain('PRIVATE_DESCRIPTION')
    expect(JSON.stringify(result)).not.toContain('sourceRef')
    const path = join(directory, 'epgshare01.json')
    const privateFile = JSON.parse(await readFile(path, 'utf8'))
    expect(privateFile.records).toHaveLength(12)
    expect(privateFile.records[0]).toMatchObject({
      sourceId: 'epgshare01', kind: 'xmltv-candidate', title: PRIVATE,
      canonicalStationId: 'ard', timestampsExplicitlyZoned: true,
      sourceRef: { sourceId: 'xmltv:epgshare01', observedAt: iso(NOW) },
    })
    expect(privateFile.records.every(x => !Object.hasOwn(x, 'tmdbId') &&
      !Object.hasOwn(x, 'playbackRoutes'))).toBe(true)
    expect(privateFile).toMatchObject({
      originalProvenancePreserved: true, publishApproved: false,
      tmdbIdentityApproved: false, playbackRoutesApproved: false,
    })
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('keeps three independent source snapshots, but two cloned hosts count as ONE content family', async () => {
    const directory = await root()
    const result = await runXmltvG2PrivateStaging({
      now: NOW, feedList: FEEDS,
      downloader: downloaderFor({
        epgshare01: 2, freeepg: 5, 'iptv-epg-org': 5,
      }), privateRoot: directory,
    })
    expect(result.stagedSourceCount).toBe(3)
    expect(result.totalStagedProgrammes).toBe(72)
    expect(result.availableIndependentFamilies).toBe(2)
    expect(result.sources.map(x => x.status)).toEqual(['staged', 'staged', 'staged'])
    expect(result.sources[0].fiveDayCompleteStations).toBe(0)
    expect(result.sources[1].fiveDayCompleteStations).toBe(6)
    expect((await stat(join(directory, 'freeepg.json'))).isFile()).toBe(true)
    expect((await stat(join(directory, 'iptv-epg-org.json'))).isFile()).toBe(true)
    expect(isSafeXmltvG2StagingReport(result)).toBe(true)
  })

  it('a failed original source does not erase the other two staged original sources', async () => {
    const directory = await root()
    const downloader = downloaderFor({
      epgshare01: 'doctype', freeepg: 2, 'iptv-epg-org': 'fail',
    })
    const result = await runXmltvG2PrivateStaging({
      now: NOW, feedList: FEEDS, downloader, privateRoot: directory,
    })
    expect(downloader).toHaveBeenCalledTimes(3)
    expect(result.sources.map(x => x.status)).toEqual([
      'unavailable', 'staged', 'unavailable',
    ])
    expect(result.stagedSourceCount).toBe(1)
    expect(result.totalStagedProgrammes).toBe(12)
    expect(JSON.stringify(result)).not.toContain(PRIVATE)
    await expect(readFile(join(directory, 'epgshare01.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect((await stat(join(directory, 'freeepg.json'))).isFile()).toBe(true)
  })

  it('supports station-partial one-day XMLTV and does not demand 120 hours', () => {
    const generation = stage('epgshare01', 1, ['zdf'])
    expect(generation).toMatchObject({
      stagedProgrammes: 1, stationCounts: { zdf: 1, ard: 0 },
      coverage: { usableStations: 1, allStationsHaveFutureProgrammes: false,
        stations: {
          zdf: { coveredMinutes: 1440, completeFiveDaysFromNow: false },
          ard: { coveredMinutes: 0 },
        } },
    })
    expect(generation.records[0].title).toBe(PRIVATE)
  })

  it('preserves original start/end times while bounding display to 14 days', () => {
    const generation = stage('epgshare01', 15, ['zdf'])
    expect(generation.stagedProgrammes).toBe(14)
    expect(generation.rejectedOrOutsideWindow).toBe(1)
    expect(generation.records[13].previewEndAt).toBe(iso(NOW + 14 * DAY))
    expect(generation.records[13].sourceRef.expiresAt).toBe(iso(NOW + 14 * DAY))
    expect(generation.coverage.stations.zdf.completeFourteenDaysFromNow).toBe(true)
  })

  it('never adopts injected TMDB identities or AIR routes from a candidate', () => {
    const parsed = parseXmltvCandidates(makeXml('freeepg', 2, ['zdf']), {
      sourceId: 'freeepg', observedAt: iso(NOW),
      stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS, mappedOnly: true,
    })
    parsed.candidates[0].tmdbId = 1234
    parsed.candidates[0].playbackRoutes = [{ url: 'app://NEVER_USE' }]
    parsed.candidates[0].confirmed = true
    const generation = buildXmltvPrivateSourceGeneration(parsed, { now: NOW })
    const serializedRecords = JSON.stringify(generation.records)
    expect(generation.records.every(record => !Object.hasOwn(record, 'tmdbId') &&
      !Object.hasOwn(record, 'titleRef') &&
      !Object.hasOwn(record, 'playbackRoutes') &&
      !Object.hasOwn(record, 'confirmed'))).toBe(true)
    expect(serializedRecords).not.toContain('app://NEVER_USE')
    expect(generation.records[0].sourceRef.externalId).toContain(PRIVATE)
    expect(generation.publishApproved).toBe(false)
  })

  it('rejects forged original source references and unzoned programme times', () => {
    const parsed = parseXmltvCandidates(makeXml('epgshare01', 1, ['zdf']), {
      sourceId: 'epgshare01', observedAt: iso(NOW),
      stationMappings: XMLTV_REVIEWED_STATION_MAPPINGS, mappedOnly: true,
    })
    parsed.candidates[0].sourceRef.externalId = 'FAKE'
    expect(buildXmltvPrivateSourceGeneration(parsed, { now: NOW }).stagedProgrammes).toBe(0)
    parsed.candidates[0].sourceRef.externalId = [
      parsed.candidates[0].sourceStationId,
      parsed.candidates[0].startAt,
      parsed.candidates[0].endAt,
      parsed.candidates[0].title,
    ].join('|')
    parsed.candidates[0].canonicalStationId = 'ard'
    expect(buildXmltvPrivateSourceGeneration(parsed, { now: NOW }).stagedProgrammes).toBe(0)
    parsed.candidates[0].canonicalStationId = 'zdf'
    parsed.candidates[0].stationName = 'FAKE CHANNEL DISPLAY NAME'
    expect(buildXmltvPrivateSourceGeneration(parsed, { now: NOW }).stagedProgrammes).toBe(0)
    parsed.candidates[0].stationName = 'ZDF'
    parsed.candidates[0].timestampsExplicitlyZoned = false
    expect(buildXmltvPrivateSourceGeneration(parsed, { now: NOW }).stagedProgrammes).toBe(0)
    expect(() => buildXmltvPrivateSourceGeneration(parsed, { now: NOW + 37 * 3_600_000 }))
      .toThrow()
  })

  it('does not create a false private generation from XMLTV without timezone', async () => {
    const directory = await root()
    const report = await runXmltvG2PrivateStaging({
      now: NOW, feedList: [feed('epgshare01')],
      privateRoot: directory, downloader: downloaderFor({ epgshare01: 'timezone' }),
    })
    expect(report).toMatchObject({
      stagedSourceCount: 0, totalStagedProgrammes: 0,
      sources: [{ status: 'no_future_programmes', stagedProgrammes: 0 }],
    })
    expect(isSafeXmltvG2StagingReport(report)).toBe(true)
    await expect(readFile(join(directory, 'epgshare01.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('will NOT replace a previously staged snapshot when another run races', async () => {
    const directory = await root()
    const output = join(directory, 'epgshare01.json')
    await writeFile(output, 'DO_NOT_OVERWRITE_OR_PUBLISH', 'utf8')
    const result = await runXmltvG2PrivateStaging({
      now: NOW, feedList: [feed('epgshare01'), feed('freeepg')],
      privateRoot: directory,
      downloader: downloaderFor({ epgshare01: 2, freeepg: 2 }),
    })
    expect(result.sources.map(x => x.status)).toEqual(['unavailable', 'staged'])
    expect(await readFile(output, 'utf8')).toBe('DO_NOT_OVERWRITE_OR_PUBLISH')
    expect((await stat(join(directory, 'freeepg.json'))).isFile()).toBe(true)
  })

  it('refuses unknown feed URLs, duplicate feed identities and unbounded requests', async () => {
    const directory = await root()
    const downloader = vi.fn()
    for (const feeds of [
      [{ id: 'epgshare01', url: 'https://attacker.invalid/epg.xml' }],
      [feed('freeepg'), feed('freeepg')],
      [],
      [...FEEDS, feed('epgshare01')],
    ]) {
      await expect(runXmltvG2PrivateStaging({
        now: NOW, feedList: feeds, privateRoot: directory, downloader,
      })).rejects.toThrow()
    }
    expect(downloader).not.toHaveBeenCalled()
  })

  it('strict public aggregate validator refuses private titles and fabricated release approvals', async () => {
    const directory = await root()
    const report = await runXmltvG2PrivateStaging({
      now: NOW, feedList: [feed('freeepg')],
      downloader: downloaderFor({ freeepg: 2 }), privateRoot: directory,
    })
    expect(isSafeXmltvG2StagingReport(report)).toBe(true)
    expect(isSafeXmltvG2StagingReport({ ...report, rawTitle: PRIVATE })).toBe(false)
    expect(isSafeXmltvG2StagingReport({ ...report, publishApproved: true })).toBe(false)
    expect(isSafeXmltvG2StagingReport({
      ...report, sources: [{ ...report.sources[0], privateFile: PRIVATE }],
    })).toBe(false)
    expect(isSafeXmltvG2StagingReport({
      ...report, sources: [{ ...report.sources[0], stagedProgrammes: 42 }],
    })).toBe(false)
    expect(isSafeXmltvG2StagingReport({
      ...report, availableIndependentFamilies: 2,
    })).toBe(false)
  })
})
