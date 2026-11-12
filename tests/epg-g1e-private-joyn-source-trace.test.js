import { describe, expect, it } from 'vitest'
import {
  summarizePrivateJoynCaptureFailureTrace,
  isSafePrivateJoynTrace,
} from '../scripts/epg-g1e-private-joyn-source-trace.mjs'

const NOW = Date.parse('2026-11-12T18:00:00.000Z')
const STARTED = NOW - 3 * 60_000
const privateTitle = 'PRIVATE JOYN 14 DAYS SECRET ORIGINAL EPG TITLE 667739'

function epg(status = 'complete') {
  return {
    kind: 'joyn-sync-status', schemaVersion: 1, status,
    generatedAt: new Date(STARTED + 20_000).toISOString(),
    horizon: { privateProgramme: privateTitle },
    coverage: [{ title: privateTitle, channelId: 'secret-channel' }],
    failure: {
      code: status === 'failed'
        ? 'JOYN_EPG_REQUEST_BUDGET' : undefined,
      message: 'Private title ' + privateTitle,
    },
    metrics: {
      requestsStarted: 220,
      windowsProcessed: status === 'failed' ? 46 : 56,
      cacheHits: 0, retries: 0, splitWindows: 82,
      privateProgrammeTitle: privateTitle,
    },
  }
}
function matching(status = 'failed', code = 'JOYN_CLASSIFICATION_BUDGET') {
  return {
    kind: 'joyn-matching-progress', generatedAt:
      new Date(STARTED + 30_000).toISOString(), status,
    processed: 1200, total: 11_000, matchCacheHits: 900,
    tmdbRequests: 12, algoliaRequests: 90, seriesDetailRequests: 7,
    failure: {
      code, message: 'private title ' + privateTitle,
      url: 'https://www.joyn.de/play/' + privateTitle,
    },
    privateProgrammeTitle: privateTitle,
  }
}
const run = (e, m, extras = {}) =>
  summarizePrivateJoynCaptureFailureTrace({
    epgStatus: e, matcherProgress: m,
    startedAt: STARTED, now: NOW, maxEpgRequests: 250,
    ...extras,
  })

describe('G1e private Joyn original-source stage trace: privacy and provenance', () => {
  it('distinguishes a complete EPG from a failing original classifier budget', () => {
    const trace = run(epg(), matching())
    expect(trace).toEqual({
      kind: 'g1e-private-joyn-source-stage',
      phase: 'original-matcher',
      epg: {
        status: 'complete', processedBaseWindows: 56,
        expectedBaseWindows: 56, cachedBaseWindows: 0,
        recursiveWindowSplits: 82, retryStarts: 0,
        startedEpgRequests: 220, epgBudget: 250, failureClass: null,
      },
      matcher: {
        status: 'failed', processedOriginalPrograms: 1200,
        totalOriginalPrograms: 11_000, originalMatchCacheHits: 900,
        startedTmdbSearches: 12, startedAlgoliaRequests: 90,
        startedSeriesDetailRequests: 7,
        failureClass: 'JOYN_CLASSIFICATION_BUDGET',
      },
    })
    expect(isSafePrivateJoynTrace(trace)).toBe(true)
    const encoded = JSON.stringify(trace)
    expect(encoded).not.toContain(privateTitle)
    expect(encoded).not.toContain('667739')
    expect(encoded).not.toContain('secret-channel')
    expect(encoded).not.toContain('https://')
  })

  it('only reports an EPG budget stop, ignoring old or irrelevant matcher state', () => {
    const trace = run(epg('failed'), matching())
    expect(trace).toMatchObject({
      phase: 'epg-sync',
      epg: {
        status: 'failed', processedBaseWindows: 46,
        failureClass: 'JOYN_EPG_REQUEST_BUDGET',
      },
    })
    expect(trace).not.toHaveProperty('matcher')
    expect(isSafePrivateJoynTrace(trace)).toBe(true)
  })

  it('distinguishes after-EPG, post-matcher, and unknown matcher errors', () => {
    expect(run(epg(), null)).toMatchObject({
      phase: 'post-epg-before-matcher',
    })
    expect(run(epg(), matching('complete'))).toMatchObject({
      phase: 'post-matcher-publication',
      matcher: { status: 'complete', failureClass: null },
    })
    expect(run(epg(), matching('failed', 'secret programme ' + privateTitle)))
      .toMatchObject({
        phase: 'original-matcher',
        matcher: { failureClass: 'OTHER_MATCHER_ERROR' },
      })
    expect(run(epg('failed'), matching())).not.toHaveProperty('matcher')
  })

  it('never publishes old restored original progress or fake fresh timestamps', () => {
    const stale = new Date(STARTED - 4 * 60_000).toISOString()
    expect(run({ ...epg(), generatedAt: stale }, matching())).toBeNull()
    expect(run(epg(), { ...matching(), generatedAt: stale }))
      .not.toHaveProperty('matcher')
    expect(run(epg(), matching(), { startedAt: NaN })).toBeNull()
    expect(run(epg(), matching(), { now: STARTED - 1 })).toBeNull()
    expect(run(epg(), matching(), { maxEpgRequests: 400 })).toBeNull()
  })

  it('rejects extra original titles in either aggregate layer, impossible bounds and invented codes', () => {
    const original = run(epg(), matching())
    const bad = [
      { ...original, title: privateTitle },
      { ...original, epg: { ...original.epg, originalId: privateTitle } },
      { ...original, matcher: { ...original.matcher, privateData: privateTitle } },
      { ...original, matcher: { ...original.matcher, startedAlgoliaRequests: 91 } },
      { ...original, matcher: { ...original.matcher, failureClass: privateTitle } },
      { ...original, epg: { ...original.epg, startedEpgRequests: 251 } },
      { ...original, epg: { ...original.epg, expectedBaseWindows: 55 } },
      { ...original, phase: privateTitle },
    ]
    for (const entry of bad) expect(isSafePrivateJoynTrace(entry)).toBe(false)
    expect(isSafePrivateJoynTrace(null)).toBe(false)
  })

  it('refuses to treat an incomplete 56-window source as a completed healthy EPG', () => {
    expect(run({ ...epg(), metrics: {
      ...epg().metrics, windowsProcessed: 52,
    } }, matching())).toBeNull()
    expect(run({ ...epg(), metrics: {
      ...epg().metrics, requestsStarted: 260,
    } }, matching())).toBeNull()
    expect(run({ ...epg(), metrics: {
      ...epg().metrics, cacheHits: 57,
    } }, matching())).toBeNull()
  })
})
