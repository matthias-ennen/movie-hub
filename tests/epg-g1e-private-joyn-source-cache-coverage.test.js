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
  it('uses the original normalized title/description/duration and negative candidate context', () => {
    const report = inspectJoynRestoredSourceCacheCoverage(input())
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

  it('honours modified original source description and duration in hash identity', () => {
    const value = input()
    value.windowRecords[2].items[0].program.description = 'Different original description'
    value.windowRecords[2].items[4].end += 60
    const report = inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.match).toMatchObject({
      exactOriginalSourceKeyPresent: 2,
      exactOriginalSourceKeyAbsent: 3,
      reusablePositiveDecisions: 0,
      reusableNegativeDecisions: 0,
    })
  })

  it('never marks a stale but otherwise complete original source as current', () => {
    const value = input()
    value.status.generatedAt = new Date(NOW - 5 * 86_400_000).toISOString()
    const report = inspectJoynRestoredSourceCacheCoverage(value)
    expect(report.source.sourceRecent).toBe(false)
    expect(report.gate.usableForCurrentHorizon).toBe(false)
    expect(report.gate.freshOriginalMatcherReceiptsApproved).toBe(false)
  })

  it('rejects mismatched windows, incomplete 14-day source and corrupt snapshots', () => {
    const wrong = input()
    wrong.windowRecords[2].items.pop()
    expect(() => inspectJoynRestoredSourceCacheCoverage(wrong)).toThrow()
    const status = input()
    status.status.status = 'failed'
    expect(() => inspectJoynRestoredSourceCacheCoverage(status)).toThrow()
    const gap = input()
    gap.windowRecords.pop()
    expect(() => inspectJoynRestoredSourceCacheCoverage(gap)).toThrow()
    const badCache = input()
    badCache.matchCache.schemaVersion = 99
    expect(() => inspectJoynRestoredSourceCacheCoverage(badCache)).toThrow()
  })

  it('accepts only exact fixed aggregate schema and never an arbitrary raw title', () => {
    const report = inspectJoynRestoredSourceCacheCoverage(input())
    const rejected = [
      { ...report, rawOriginal: SECRET },
      { ...report, source: { ...report.source, title: SECRET } },
      { ...report, match: { ...report.match, exactOriginalSourceKeyAbsent: 9999 } },
      { ...report, gate: { ...report.gate, freshOriginalMatcherReceiptsApproved: true } },
      { ...report, gate: { ...report.gate, measuredProductionSavings: 100 } },
      { ...report, mode: SECRET },
    ]
    for (const item of rejected) expect(isSafeJoynRestoredSourceCoverage(item)).toBe(false)
  })
})
