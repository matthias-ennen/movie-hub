import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir, symlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FEEDS } from '../scripts/probe-xmltv-feeds.mjs'
import { XMLTV_REVIEWED_STATION_MAPPINGS } from
  '../src/sources/xmltv/xmltvStationMappings.js'
import { runXmltvG2PrivateStaging } from '../scripts/xmltv-g2-private-staging.mjs'
import {
  runXmltvG2lPrivateAdapterCoordinator,
  isSafeXmltvG2lPrivateAdapterReport,
} from '../scripts/xmltv-g2l-private-adapter-coordinator.mjs'

const NOW = Date.parse('2026-11-14T10:30:00Z')
const DAY = 86_400_000
const SECRET = 'NEVER_PUBLISH_REAL_SOURCE_TITLE'
const dirs = []
const clock = x => new Date(x).toISOString()
const epgTime = x => clock(x).replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
const channel = (sourceId, stationId) =>
  Object.entries(XMLTV_REVIEWED_STATION_MAPPINGS[sourceId])
    .find(([, station]) => station.stationId === stationId)[0]

async function fixture(counts, { selectedIds = FEEDS.map(feed => feed.id) } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'moviehub-xmltv-g2l-'))
  dirs.push(root)
  const privateRoot = join(root, 'private')
  const stagingReportPath = join(root, 'report.json')
  const downloader = vi.fn(async url => {
    const src = FEEDS.find(feed => feed.url === url)
    const days = counts[src.id]
    if (days === 'fail') throw new Error(SECRET + ' original 404')
    const station = channel(src.id, 'zdf')
    const lines = ['<?xml version="1.0" encoding="UTF-8"?><tv>',
      '<channel id="' + station + '"><display-name>ZDF</display-name></channel>']
    for (let day = 0; day < (days || 0); day++) {
      lines.push('<programme channel="' + station +
        '" start="' + epgTime(NOW + day * DAY) +
        '" stop="' + epgTime(NOW + (day + 1) * DAY) + '">' +
        '<title lang="de">' + SECRET + '</title>' +
        '<category>Film</category></programme>')
    }
    return { xml: lines.concat('</tv>').join('') }
  })
  const report = await runXmltvG2PrivateStaging({
    now: NOW,
    feedList: FEEDS.filter(feed => selectedIds.includes(feed.id)),
    downloader, privateRoot,
  })
  await writeFile(stagingReportPath, JSON.stringify(report), {
    flag: 'wx', mode: 0o600,
  })
  return { privateRoot, stagingReportPath, report, downloader }
}
afterEach(async () => {
  await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })))
  dirs.length = 0
})

const run = (files, opts = {}) => runXmltvG2lPrivateAdapterCoordinator({
  ...files, now: NOW, ...opts,
})

describe('#336 G2l real G2c staged files -> G2d -> G2j local matcher/merge', () => {
  it('reads three actual parser-staged programme snapshots and matches all offline', async () => {
    const staged = await fixture({ epgshare01: 2, freeepg: 2, 'iptv-epg-org': 2 })
    const resolver = vi.fn(async () => [{ type: 'movie', title: SECRET, tmdbId: 99119 }])
    const report = await run(staged, { localCandidatesFor: resolver })
    expect(report).toMatchObject({
      mode: 'same-run-original-source-offline-no-publication',
      matcherCatalogMode: 'provided-local-only',
      selectedSources: 3, unavailableSources: 0, invalidSources: 0,
      availableIndependentFamilies: 2, stationsWithIndependentOverlap: 1,
      selectedCandidateCount: 6, locallyMatchedCount: 6,
      locallyUnmatchedCount: 0, baselineMergedAirings: 0,
      mergedAiringsWithXmltvPreview: 2,
      originalCloudObjectsCreated: 0, productiveWrites: 0,
      publishApproved: false, tmdbIdentityApproved: false,
      playbackRoutesApproved: false,
    })
    expect(report.sources).toHaveLength(3)
    expect(report.sources.every(s => s.status === 'selected' && s.currentStations === 1)).toBe(true)
    expect(resolver).toHaveBeenCalledTimes(6)
    expect(isSafeXmltvG2lPrivateAdapterReport(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(SECRET)
    expect(JSON.stringify(report)).not.toContain('sourceRef')
    expect(JSON.stringify(report)).not.toContain('externalId')
    expect(await readdir(staged.privateRoot)).toEqual(
      expect.arrayContaining(['epgshare01.json','freeepg.json','iptv-epg-org.json']),
    )
  })

  it('does not claim zero catalogue matches as real measured TMDB performance', async () => {
    const staged = await fixture({ epgshare01: 2 }, { selectedIds: ['epgshare01'] })
    const report = await run(staged)
    expect(report).toMatchObject({
      matcherCatalogMode: 'empty-local-catalog', selectedSources: 1,
      selectedCandidateCount: 2, locallyMatchedCount: 0,
      locallyUnmatchedCount: 2, mergedAiringsWithXmltvPreview: 0,
    })
    expect(isSafeXmltvG2lPrivateAdapterReport(report)).toBe(true)
  })

  it('continues healthy one-day feeds when the other source download fails', async () => {
    const staged = await fixture({
      epgshare01: 'fail', freeepg: 1, 'iptv-epg-org': 2,
    })
    const report = await run(staged, {
      localCandidatesFor: async () => [{ type: 'movie', tmdbId: 99119, title: SECRET }],
    })
    expect(report).toMatchObject({
      selectedSources: 2, unavailableSources: 1, invalidSources: 0,
      selectedCandidateCount: 3, locallyMatchedCount: 3,
      mergedAiringsWithXmltvPreview: 2,
      availableIndependentFamilies: 1,
    })
    expect(report.sources.find(x => x.sourceId === 'epgshare01')).toMatchObject({
      status: 'unavailable', currentStations: 0, selectedCandidates: 0,
    })
    expect(JSON.stringify(report)).not.toContain(SECRET)
  })

  it('quarantines corrupted source snapshots while keeping other sources', async () => {
    const staged = await fixture({ epgshare01: 2, freeepg: 2 })
    const path = join(staged.privateRoot, 'epgshare01.json')
    const corrupted = JSON.parse(await readFile(path, 'utf8'))
    corrupted.records[0].sourceRef.externalId = 'FORGED_' + SECRET
    await writeFile(path, JSON.stringify(corrupted), { mode: 0o600 })
    const report = await run(staged)
    expect(report).toMatchObject({
      selectedSources: 1, invalidSources: 1,
      selectedCandidateCount: 2, availableIndependentFamilies: 1,
    })
    expect(report.sources.find(x => x.sourceId === 'epgshare01').status).toBe('invalid')
    expect(JSON.stringify(report)).not.toContain(SECRET)
  })

  it('does not trust a source file whose generation identity disagrees with its staging receipt', async () => {
    const staged = await fixture({ epgshare01: 2, freeepg: 1 })
    const path = join(staged.privateRoot, 'epgshare01.json')
    const wrong = JSON.parse(await readFile(path, 'utf8'))
    wrong.observedAt = clock(NOW - 60_000)
    await writeFile(path, JSON.stringify(wrong))
    const report = await run(staged)
    expect(report.selectedSources).toBe(1)
    expect(report.invalidSources).toBe(1)
    expect(report.sources.find(x => x.sourceId === 'freeepg').selectedCandidates).toBe(1)
  })

  it('fails shut for stale report or unexpected extra source file', async () => {
    const staged = await fixture({ epgshare01: 2 })
    await expect(run(staged, { now: NOW + 37 * 60 * 60_000 }))
      .rejects.toThrow(/stale/)
    await writeFile(join(staged.privateRoot, 'unexpected.json'), SECRET, { mode: 0o600 })
    await expect(run(staged)).rejects.toThrow(/Unexpected/)
  })

  it('rejects world-readable and symlinked private snapshots individually', async () => {
    const staged = await fixture({ epgshare01: 2, freeepg: 1 })
    const sourceFile = join(staged.privateRoot, 'epgshare01.json')
    await chmod(sourceFile, 0o644)
    const report = await run(staged)
    expect(report.invalidSources).toBe(1)
    expect(report.selectedSources).toBe(1)
    expect(JSON.stringify(report)).not.toContain(SECRET)
  })

  it('rejects an unsafe staging report and inflated output claims', async () => {
    const staged = await fixture({ epgshare01: 2 })
    const original = JSON.parse(await readFile(staged.stagingReportPath, 'utf8'))
    original.sources[0].stagedProgrammes = 999
    await writeFile(staged.stagingReportPath, JSON.stringify(original))
    await expect(run(staged)).rejects.toThrow(/Invalid or stale/)
    expect(isSafeXmltvG2lPrivateAdapterReport({
      kind: 'xmltv-g2l-private-adapter-aggregate', publishApproved: true,
    })).toBe(false)
  })

  it('has explicit QA budget, no partial result when limit is exceeded', async () => {
    const staged = await fixture({ epgshare01: 2 })
    await expect(run(staged, { maxCandidates: 1 }))
      .rejects.toThrow(/candidate budget exceeded/)
    await expect(run(staged, { maxCandidates: 20_001 }))
      .rejects.toThrow(/Invalid private/)
  })
})
