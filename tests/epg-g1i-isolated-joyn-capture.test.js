import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JoynLookupCache } from '../scripts/joyn-match-cache.mjs'
import { JoynTmdbSearchClient } from '../scripts/joyn-tmdb-matcher.mjs'
import { joynOriginalFirstResponseCache } from '../scripts/shared-tmdb-adapter-capture-stage.mjs'
import { loadOptionalSharedTmdbResponses } from '../scripts/shared-tmdb-response-store.mjs'
import {
  openIsolatedJoynTmdbCapture, finishIsolatedJoynTmdbCapture,
  isSafeIsolatedJoynCaptureSummary,
} from '../scripts/epg-g1i-isolated-joyn-capture.mjs'

const NOW = Date.parse('2026-11-13T17:00:00Z')
const TITLE = 'PRIVATE_SYNTHETIC_TITLE_NEVER_EMIT'
const key = JSON.stringify(['/search/movie', {
  language: 'de-DE', query: TITLE, include_adult: 'false',
}])
const movie = { id: 33211, title: TITLE, release_date: '2006-01-02' }
const roots = []
const snapshotFile = root => join(root,
  'artifacts/shared-tmdb/private/shared-tmdb-response-cache.json')
const completePilot = () => ({
  kind: 'g1e-isolated-private-original-source-capture', schemaVersion: 1,
  mode: 'capture',
  source: {
    joynOriginalGenerationHealthy: true,
    waipuOriginalGenerationHealthy: true,
  },
  gate: { sourceReceiptsCapturedPrivately: true, measuredProductionSavings: null },
})
async function dir() {
  const root = await mkdtemp(join(tmpdir(), 'moviehub-336-g1m-private-'))
  roots.push(root)
  return root
}
afterEach(async () => {
  await Promise.all(roots.map(d => rm(d, { force: true, recursive: true })))
  roots.length = 0
})
async function session(root, optIn = 'private-stage-capture-v1') {
  return openIsolatedJoynTmdbCapture({
    explicitOptIn: optIn, isPrivatePilot: true, projectRoot: root, now: NOW,
  })
}
function clientWithOriginalLookup(original, capture, fetchImpl) {
  return new JoynTmdbSearchClient({
    token: 'unit-only', responseCache: joynOriginalFirstResponseCache(original, capture),
    fetchImpl, paceMs: 0, maxRetries: 0,
  })
}
const response = () => ({
  ok: true, status: 200, headers: new Headers(),
  json: async () => ({ results: [movie], page: 1, total_pages: 1 }),
  text: async () => '',
})

describe('#336 G1m: real original Joyn search client in isolated private capture job', () => {
  it('requires both exact opt-in and explicit isolated mode', async () => {
    const root = await dir()
    expect(await session(root, 'PRIVATE_G1E_CAPTURE_ONLY')).toBeNull()
    expect(await openIsolatedJoynTmdbCapture({
      explicitOptIn: 'private-stage-capture-v1', isPrivatePilot: false,
      projectRoot: root,
    })).toBeNull()
    expect(await finishIsolatedJoynTmdbCapture()).toBeNull()
    await expect(stat(snapshotFile(root))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('captures only an ORIGINAL Joyn TMDB HTTP search without affecting its lookup behavior', async () => {
    const root = await dir()
    const capture = await session(root)
    const lookup = new JoynLookupCache({}, NOW)
    const fetchImpl = vi.fn(async () => response())
    const joyn = clientWithOriginalLookup(lookup, capture, fetchImpl)
    expect((await joyn.search({ type: 'movie', title: TITLE }))[0].id).toBe(movie.id)
    expect(joyn.requestsStarted).toBe(1)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(lookup.get('tmdb-search-v1', key).results[0].id).toBe(movie.id)
    expect(capture.responseCache.get(key)).toBeNull()

    const aggregate = await finishIsolatedJoynTmdbCapture({
      capture, pilotReport: completePilot(),
    })
    expect(aggregate).toMatchObject({
      status: 'saved', newlyObservedHttpResponses: 1,
      liveNightlyRequestsAvoided: null, sharedSearchReadEnabled: false,
      originalMatcherIdentitiesApprovedByCache: false,
      xmltvPublicationApproved: false,
    })
    expect(isSafeIsolatedJoynCaptureSummary(aggregate)).toBe(true)
    expect(JSON.stringify(aggregate)).not.toContain(TITLE)
    expect((await loadOptionalSharedTmdbResponses(snapshotFile(root), {
      now: NOW,
    })).entries).toBe(1)
  })

  it('does not mistake an ORIGINAL Joyn lookup hit for a fresh TMDB response', async () => {
    const root = await dir()
    const capture = await session(root)
    const lookup = new JoynLookupCache({}, NOW)
    lookup.set('tmdb-search-v1', key, { results: [movie] })
    const fetchImpl = vi.fn(async () => { throw Error('No HTTP expected') })
    const joyn = clientWithOriginalLookup(lookup, capture, fetchImpl)
    expect((await joyn.search({ type: 'movie', title: TITLE }))[0].id).toBe(movie.id)
    expect(joyn.requestsStarted).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
    const out = await finishIsolatedJoynTmdbCapture({
      capture, pilotReport: completePilot(),
    })
    expect(out.status).toBe('no_new_responses')
    expect(out.newlyObservedHttpResponses).toBe(0)
    await expect(stat(snapshotFile(root))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never saves a private shared cache on incomplete original source generation', async () => {
    const root = await dir()
    const capture = await session(root)
    expect(capture.responseCache.set(key, { results: [movie] })).toBe(true)
    const incomplete = completePilot()
    incomplete.source.waipuOriginalGenerationHealthy = false
    const out = await finishIsolatedJoynTmdbCapture({
      capture, pilotReport: incomplete,
    })
    expect(out.status).toBe('not_complete')
    expect(out.newlyObservedHttpResponses).toBe(1)
    await expect(stat(snapshotFile(root))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not promote invalid original TMDB error bodies to shared cache', async () => {
    const root = await dir()
    const capture = await session(root)
    expect(capture.responseCache.set(key, {
      status_code: 429, results: [movie],
    })).toBe(false)
    const result = await finishIsolatedJoynTmdbCapture({
      capture, pilotReport: completePilot(),
    })
    expect(result.status).toBe('no_new_responses')
    expect(result.newlyObservedHttpResponses).toBe(0)
  })

  it('prevents repeat completion and never silently refreshes or reuses a shared hit', async () => {
    const root = await dir()
    const capture = await session(root)
    capture.responseCache.set(key, { results: [movie] })
    const first = await finishIsolatedJoynTmdbCapture({
      capture, pilotReport: completePilot(),
    })
    expect(first.status).toBe('saved')
    const second = await finishIsolatedJoynTmdbCapture({
      capture, pilotReport: completePilot(),
    })
    expect(second.status).toBe('already_finalized')
    expect(second.liveNightlyRequestsAvoided).toBeNull()
    expect(capture.responseCache.get(key)).toBeNull()
  })

  it('rejects unknown source pilot shapes and fabricated safe output fields', async () => {
    const root = await dir()
    const capture = await session(root)
    capture.responseCache.set(key, { results: [movie] })
    const out = await finishIsolatedJoynTmdbCapture({
      capture, pilotReport: { ...completePilot(), schemaVersion: 3 },
    })
    expect(out.status).toBe('not_complete')
    expect(isSafeIsolatedJoynCaptureSummary({
      ...out, sourceTitle: TITLE,
    })).toBe(false)
    expect(isSafeIsolatedJoynCaptureSummary({
      ...out, liveNightlyRequestsAvoided: 5,
    })).toBe(false)
    expect(isSafeIsolatedJoynCaptureSummary({
      ...out, sharedSearchReadEnabled: true,
    })).toBe(false)
    expect(isSafeIsolatedJoynCaptureSummary({
      ...out, newlyObservedHttpResponses: 451,
    })).toBe(false)
  })

  it('confirms the production workflow has no capture token and no unconditional activation', async () => {
    const { readFile } = await import('node:fs/promises')
    const privateWorkflow = await readFile(
      '.github/workflows/shared-epg-g1e-private-joyn-capture.yml', 'utf8')
    expect(privateWorkflow).toContain("MOVIEHUB_SHARED_TMDB_CAPTURE: 'private-stage-capture-v1'")
    expect(privateWorkflow).toContain("PRIVATE_G1E_CAPTURE_ONLY")
    expect(privateWorkflow).toContain("github.event_name == 'workflow_dispatch'")
    const nightly = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')
    expect(nightly).not.toContain('MOVIEHUB_SHARED_TMDB_CAPTURE')
    expect(nightly).not.toContain('private-stage-capture-v1')
  })
})
