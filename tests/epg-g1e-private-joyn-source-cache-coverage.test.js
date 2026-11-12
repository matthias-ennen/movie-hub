import { describe, expect, it } from 'vitest'
import {
  inspectJoynRestoredSourceCacheCoverage, isSafeJoynRestoredSourceCoverage,
} from '../scripts/epg-g1e-private-joyn-source-cache-coverage.mjs'
import { JoynMatchCache } from '../scripts/joyn-match-cache.mjs'
import { JOYN_MATCHER_VERSION } from '../scripts/joyn-tmdb-matcher.mjs'
import { localTmdbCandidates } from '../scripts/waipu-live-catalog.mjs'
import { titleLookup } from '../scripts/joyn-adapter-diagnostic.mjs'

const NOW = Date.parse('2026-11-12T12:00:00Z')
const START = Date.parse('2026-11-12T00:00:00Z')
const HOUR = 3_600_000
const SECRET = 'PRIVATE_JOYN_SOURCE_TITLE_MUST_NEVER_LEAVE_887722'
const programs = [
  { id: 'pA', title: `${SECRET}_A`, status: 'matched' },
  { id: 'pB', title: `${SECRET}_B`, status: 'context-mismatch' },
  { id: 'pC', title: `${SECRET}_C`, status: 'absent' },
  { id: 'pD', title: `${SECRET}_D`, status: 'expired' },
  { id: 'pE', title: `${SECRET}_E`, status: 'unmatched' },
]

function input() {
  const windows = []
  const checkpointWindows = {}
  for (let i = 0; i < 56; i++) {
    const from = START + i * 6 * HOUR
    const to = from + 6 * HOUR
    const rows = i === 2 ? programs.map((p, n) => {
      const start = START + 12 * HOUR + (n + 1) * 30 * 60_000
      const end = start + 20 * 60_000
      return {
        livestream: { id: 'channel-one' },
        program: {
          __typename: 'EpgEntryV2', id: p.id, title: p.title,
          description: 'Private source description',
          secondaryTitle: null,
        },
        start: start / 1000, end: end / 1000,
      }
    }) : []
    const fetchedAt = new Date(NOW - HOUR).toISOString()
    windows.push({ from, to, fetchedAt, items: rows })
    checkpointWindows[`${from}_${to}`] = { fetchedAt, count: rows.length, inventory: 'original-inventory' }
  }
  const catalog = { titles: [
    { type: 'movie', tmdbId: 101, title: programs[1].title },
    { type: 'movie', tmdbId: 102, title: programs[4].title },
  ] }
  const candidatesFor = titleLookup(localTmdbCandidates({ catalog, searchIndex: { entries: [] } }))
  const match = new JoynMatchCache({}, NOW)
  const makeCandidate = n => {
    const row = windows[2].items[n]
    return {
      title: row.program.title, secondaryTitle: null,
      description: row.program.description,
      startTime: new Date(row.start * 1000).toISOString(),
      endTime: new Date(row.end * 1000).toISOString(),
    }
  }
  match.set(makeCandidate(0), { decision: { status: 'matched' } }, [])
  match.set(makeCandidate(1), { decision: { status: 'unmatched' } }, [])
  match.set(makeCandidate(3), { decision: { status: 'matched' } }, [])
  match.set(makeCandidate(4), { decision: { status: 'unmatched' } }, candidatesFor(programs[4].title))
  // Matching source key but expired positive TTL.
  const positiveKeys = Object.keys(match.values).filter(k =>
    match.values[k]?.diagnostic?.decision?.status === 'matched')
  expect(positiveKeys).toHaveLength(2)
  match.values[positiveKeys[1]].checkedAt = new Date(NOW - 31 * 86_400_000).toISOString()

  return {
    status: {
      kind: 'joyn-sync-status', schemaVersion: 1, status: 'complete',
      generatedAt: new Date(NOW - HOUR).toISOString(),
      horizon: {
        start: new Date(START).toISOString(),
        endExclusive: new Date(START + 14 * 86_400_000).toISOString(),
      },
      coverage: [{ id: 'channel-one', title: 'ZDF', programs: 5 }],
      metrics: { windowsProcessed: 56 },
    },
    checkpoint: {
      kind: 'joyn-sync-checkpoint', schemaVersion: 1,
      windows: checkpointWindows,
    },
    windowRecords: windows,
    matchCache: {
      kind: 'joyn-match-cache', schemaVersion: 1,
      matcherVersion: JOYN_MATCHER_VERSION, entries: match.values,
    },
    catalog,
    searchIndex: { entries: [] },
    now: NOW,
  }
}

describe('G1e original private source key/context coverage without network calls', () => {
  it('uses the original normalized title/description/duration and negative candidate context', async () => {
    const report = await inspectJoynRestoredSourceCacheCoverage(input())
    expect(report).toMatchObject({
      kind: 'g1e-private-joyn-original-cache-coverage',
      mode: 'private-read-only',
      source: {
        completeBaseWindowsVerified: 56, sourceRecent: true,
        horizonIncludesNow: true,
        originalRawWindowRows: 5, normalizedRemainingOriginalPrograms: 5,
      },
      match: {
        compatibleMatcherVersion: true, originalCacheEntries: 4,
        exactOriginalSourceKeyPresent: 4, exactOriginalSourceKeyAbsent: 1,
        exactKeyRejectedByOriginalPolicy: 2,
        reusablePositiveDecisions: 1, reusableNegativeDecisions: 1,
        distinctOriginalSourceKeys: 5,
        distinctMissingOriginalKeys: 1,
        distinctRejectedOriginalKeys: 2,
        distinctReusablePositiveKeys: 1,
        distinctReusableNegativeKeys: 1,
      },
      offlineLocalPreflight: {
        distinctMissingKeysInspected: 1,
        locallyMatchedWithoutExternalCalls: 0,
        unresolvedWithoutLocalCandidates: 1,
        unresolvedWithLocalCandidates: 0,
        providerOrTmdbQueriesStarted: 0,
      },
      offlineLocalRejectionReasons: {
        noCandidateAboveMinimumScore: 0,
        belowAcceptanceScore: 0,
        ambiguousScoreMargin: 0,
        ambiguousExactTitle: 0,
      },
      offlineLocalCandidateContext: {
        exactlyOneLocalCandidate: 0,
        multipleLocalCandidates: 0,
        exactAmbiguityWithSourceDescription: 0,
        exactAmbiguityWithoutSourceDescription: 0,
      },
      gate: {
        sourceKeyAndCandidateContextCompared: true,
        usableForCurrentHorizon: true,
        freshOriginalMatcherReceiptsApproved: false,
        measuredProductionSavings: null,
      },
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(SECRET)
    expect(JSON.stringify(report)).not.toContain('channel-one')
    expect(JSON.stringify(report)).not.toContain('Private source description')
  })

  it('deduplicates repeated programme IDs into one missing ORIGINAL key without leaking IDs', async () => {
    const value = input()
    const original = value.windowRecords[2].items[2] // synthetic missing key
    const repeat = {
      ...original, livestream: { ...original.livestream },
      program: { ...original.program, id: 'private-repeated-programme' },
      start: original.start + 3600, end: original.end + 3600,
    }
    value.windowRecords[2].items.push(repeat)
    const key = `${value.windowRecords[2].from}_${value.windowRecords[2].to}`
    value.checkpoint.windows[key].count++
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.source).toMatchObject({
      originalRawWindowRows: 6, normalizedRemainingOriginalPrograms: 6,
    })
    expect(report.match).toMatchObject({
      exactOriginalSourceKeyAbsent: 2,
      distinctMissingOriginalKeys: 1,
      distinctOriginalSourceKeys: 5,
      reusablePositiveDecisions: 1,
      reusableNegativeDecisions: 1,
    })
    expect(report.offlineLocalPreflight).toMatchObject({
      distinctMissingKeysInspected: 1,
      unresolvedWithoutLocalCandidates: 1,
      providerOrTmdbQueriesStarted: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain('private-repeated-programme')
    expect(JSON.stringify(report)).not.toContain(SECRET)
  })

  it('counts local-only successful matches without any remote TMDB or source calls', async () => {
    const value = input()
    value.catalog.titles.push({
      type: 'movie', tmdbId: 203, title: programs[2].title,
    })
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.match.distinctMissingOriginalKeys).toBe(1)
    expect(report.offlineLocalPreflight).toEqual({
      distinctMissingKeysInspected: 1,
      locallyMatchedWithoutExternalCalls: 1,
      unresolvedWithoutLocalCandidates: 0,
      unresolvedWithLocalCandidates: 0,
      providerOrTmdbQueriesStarted: 0,
    })
    expect(report.gate.freshOriginalMatcherReceiptsApproved).toBe(false)
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(programs[2].title)
    expect(JSON.stringify(report)).not.toContain('203')
  })

  it('distinguishes ambiguous local candidates from no local candidate', async () => {
    const value = input()
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 205, title: programs[2].title },
      { type: 'series', tmdbId: 206, title: programs[2].title },
    )
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineLocalPreflight).toMatchObject({
      distinctMissingKeysInspected: 1,
      locallyMatchedWithoutExternalCalls: 0,
      unresolvedWithoutLocalCandidates: 0,
      unresolvedWithLocalCandidates: 1,
      providerOrTmdbQueriesStarted: 0,
    })
    expect(report.offlineLocalRejectionReasons).toEqual({
      noCandidateAboveMinimumScore: 0,
      belowAcceptanceScore: 0,
      ambiguousScoreMargin: 0,
      ambiguousExactTitle: 1,
    })
    expect(report.offlineLocalCandidateContext).toEqual({
      exactlyOneLocalCandidate: 0,
      multipleLocalCandidates: 1,
      exactAmbiguityWithSourceDescription: 1,
      exactAmbiguityWithoutSourceDescription: 0,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
  })

  it('counts ambiguous exact-title reasons separately when the source description is absent', async () => {
    const value = input()
    value.windowRecords[2].items[2].program.description = null
    value.catalog.titles.push(
      { type: 'movie', tmdbId: 305, title: programs[2].title },
      { type: 'movie', tmdbId: 306, title: programs[2].title },
    )
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.offlineLocalRejectionReasons.ambiguousExactTitle).toBe(1)
    expect(report.offlineLocalCandidateContext).toEqual({
      exactlyOneLocalCandidate: 0,
      multipleLocalCandidates: 1,
      exactAmbiguityWithSourceDescription: 0,
      exactAmbiguityWithoutSourceDescription: 1,
    })
    expect(isSafeJoynRestoredSourceCoverage(report)).toBe(true)
    expect(JSON.stringify(report)).not.toContain(programs[2].title)
  })

  it('honours modified original source description and duration in hash identity', async () => {
    const value = input()
    value.windowRecords[2].items[0].program.description = 'Different original description'
    value.windowRecords[2].items[4].end += 60
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.match).toMatchObject({
      exactOriginalSourceKeyPresent: 2,
      exactOriginalSourceKeyAbsent: 3,
      reusablePositiveDecisions: 0,
      reusableNegativeDecisions: 0,
    })
  })

  it('never marks a stale but otherwise complete original source as current', async () => {
    const value = input()
    value.status.generatedAt = new Date(NOW - 5 * 86_400_000).toISOString()
    const report = await inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.source.sourceRecent).toBe(false)
    expect(report.gate.usableForCurrentHorizon).toBe(false)
    expect(report.gate.freshOriginalMatcherReceiptsApproved).toBe(false)
  })

  it('rejects mismatched windows, incomplete 14-day source and corrupt snapshots', async () => {
    const wrong = input()
    wrong.windowRecords[2].items.pop()
    await expect(inspectJoynRestoredSourceCacheCoverage(wrong)).rejects.toThrow()
    const status = input()
    status.status.status = 'failed'
    await expect(inspectJoynRestoredSourceCacheCoverage(status)).rejects.toThrow()
    const gap = input()
    gap.windowRecords.pop()
    await expect(inspectJoynRestoredSourceCacheCoverage(gap)).rejects.toThrow()
    const badCache = input()
    badCache.matchCache.schemaVersion = 99
    await expect(inspectJoynRestoredSourceCacheCoverage(badCache)).rejects.toThrow()
  })

  it('accepts only exact fixed aggregate schema and never an arbitrary raw title', async () => {
    const report = await inspectJoynRestoredSourceCacheCoverage(input())
    const rejected = [
      { ...report, rawOriginal: SECRET },
      { ...report, source: { ...report.source, title: SECRET } },
      { ...report, match: { ...report.match, exactOriginalSourceKeyAbsent: 9999 } },
      { ...report, match: { ...report.match, distinctMissingOriginalKeys: 1000 } },
      { ...report, match: { ...report.match, distinctReusablePositiveKeys: 1000 } },
      { ...report, match: { ...report.match, distinctOriginalSourceKeys: 99999 } },
      { ...report, match: { ...report.match, rawOriginalHash: SECRET } },
      { ...report, offlineLocalPreflight: { ...report.offlineLocalPreflight, privateTitle: SECRET } },
      { ...report, offlineLocalPreflight: { ...report.offlineLocalPreflight, distinctMissingKeysInspected: 0 } },
      { ...report, offlineLocalPreflight: { ...report.offlineLocalPreflight, providerOrTmdbQueriesStarted: 1 } },
      { ...report, offlineLocalPreflight: { ...report.offlineLocalPreflight, locallyMatchedWithoutExternalCalls: 999 } },
      { ...report, offlineLocalRejectionReasons: { ...report.offlineLocalRejectionReasons, rawReason: SECRET } },
      { ...report, offlineLocalRejectionReasons: { ...report.offlineLocalRejectionReasons, ambiguousExactTitle: 1 } },
      { ...report, offlineLocalCandidateContext: { ...report.offlineLocalCandidateContext, rawTitle: SECRET } },
      { ...report, offlineLocalCandidateContext: { ...report.offlineLocalCandidateContext, multipleLocalCandidates: 2 } },
      { ...report, gate: { ...report.gate, freshOriginalMatcherReceiptsApproved: true } },
      { ...report, gate: { ...report.gate, measuredProductionSavings: 100 } },
      { ...report, mode: SECRET },
    ]
    for (const item of rejected) expect(isSafeJoynRestoredSourceCoverage(item)).toBe(false)
  })
})
