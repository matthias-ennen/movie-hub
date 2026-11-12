import { describe, expect, it, vi } from 'vitest'
import { matchJoynProgram } from '../scripts/joyn-tmdb-matcher.mjs'
import { JoynMatchCache } from '../scripts/joyn-match-cache.mjs'
import {
  mapJoynCandidateToBroadcastEvent,
  buildJoynSourceEnvelope,
} from '../src/sources/adapters/joynContractMapper.js'
import {
  collectApprovedJoynEvidence,
  runOptionalJoynEvidenceCapture,
} from '../scripts/epg-g1e-joyn-evidence-capture.mjs'

const START = '2026-11-14T08:00:00.000Z'
const END = '2026-11-14T10:00:00.000Z'
const OBSERVED = '2026-11-12T06:35:30.000Z'
const CHECKED = '2026-11-12T06:35:00.000Z'
const candidate = {
  title: 'Arrival',
  joynProgramId: 'joyn-program-123',
  joynChannelId: 'joyn-ard',
  channelTitle: 'Das Erste',
  startTime: START, endTime: END,
}
const localTitles = [{ type: 'movie', tmdbId: 329865,
  title: 'Arrival', originalTitle: 'Arrival', year: 2016 }]

async function sourceFixture({ entryCandidate = candidate } = {}) {
  const decision = await matchJoynProgram({ title: candidate.title }, {
    localCandidates: localTitles,
  })
  const event = mapJoynCandidateToBroadcastEvent(candidate, decision.match, {
    channelId: 'ard', observedAt: OBSERVED,
  })
  const envelope = buildJoynSourceEnvelope([event], { generatedAt: OBSERVED })
  return {
    adapterEnvelope: envelope,
    sourceEntries: [{ candidate: entryCandidate, channelId: 'ard' }],
    matcherDecisions: new Map([[candidate.joynProgramId, decision]]),
    provenanceByProgram: new Map([[candidate.joynProgramId, {
      origin: 'fresh', checkedAt: CHECKED,
    }]]),
  }
}

describe('G1e opt-in Joyn post-generation matcher evidence capture', () => {
  it('collects only actual fresh positive Joyn identities after a healthy source generation', async () => {
    const args = await sourceFixture()
    const result = collectApprovedJoynEvidence(args)
    expect(result).toMatchObject({
      status: 'complete', counts: { examined: 1, accepted: 1, rejected: 0 },
      approvedEvidence: [expect.objectContaining({
        stationId: 'ard', sourceId: 'joyn-epg', tmdbId: 329865,
        type: 'movie', title: 'Arrival',
        checkedAt: CHECKED, startTime: START, endTime: END,
      })],
    })
    expect(result.approvedEvidence[0]).not.toHaveProperty('playbackRoutes')
    expect(result.approvedEvidence[0]).not.toHaveProperty('providerIds')
    expect(JSON.stringify(result.approvedEvidence)).not.toContain('app.joyn')
  })

  it('leaves the opt-in hook inactive unless a caller explicitly provides a callback', async () => {
    const callback = vi.fn()
    expect(await runOptionalJoynEvidenceCapture(null, await sourceFixture())).toBeNull()
    expect(callback).not.toHaveBeenCalled()
  })

  it('gives the private test callback receipts but returns only safe aggregate counters', async () => {
    const callback = vi.fn(async () => {})
    const result = await runOptionalJoynEvidenceCapture(callback, await sourceFixture())
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0].approvedEvidence).toHaveLength(1)
    expect(result).toEqual({
      status: 'complete',
      counts: { examined: 1, accepted: 1, rejected: 0 },
      rejectedReasons: {},
    })
    expect(result).not.toHaveProperty('approvedEvidence')
    expect(JSON.stringify(result)).not.toContain('Arrival')
  })

  it('never allows an optional callback failure to affect the independent Joyn adapter', async () => {
    const report = await runOptionalJoynEvidenceCapture(
      async () => { throw new Error('Private G1e test sink offline') },
      await sourceFixture(),
    )
    expect(report).toEqual({
      status: 'unavailable', counts: null, rejectedReasons: {},
    })
  })

  it('preserves the actual cache checkedAt and rejects old cache decisions as cross-source proof', async () => {
    const args = await sourceFixture()
    const [decision] = args.matcherDecisions.values()
    const cache = new JoynMatchCache({}, Date.parse('2026-11-10T06:35:00.000Z'))
    cache.set(candidate, { decision }, localTitles)
    cache.now = Date.parse(CHECKED)
    const cachedProof = cache.getWithProvenance(candidate, localTitles)
    expect(cachedProof.checkedAt).toBe('2026-11-10T06:35:00.000Z')
    const argsCached = {
      ...args,
      matcherDecisions: new Map([[candidate.joynProgramId, cachedProof.diagnostic.decision]]),
      provenanceByProgram: new Map([[candidate.joynProgramId, {
        origin: 'cache', cachedMatch: cachedProof,
      }]]),
    }
    const report = collectApprovedJoynEvidence(argsCached)
    expect(report).toMatchObject({
      status: 'complete',
      counts: { examined: 1, accepted: 0, rejected: 1 },
      rejectedReasons: { source_ref_missing: 1 },
      approvedEvidence: [],
    })
    // Joyn can still reuse the matching cache independently.
    expect(cachedProof.diagnostic.decision.status).toBe('matched')
  })

  it('also accepts a cached decision only when it is genuinely from the same source generation', async () => {
    const args = await sourceFixture()
    const [decision] = args.matcherDecisions.values()
    const cache = new JoynMatchCache({}, Date.parse(CHECKED))
    cache.set(candidate, { decision }, localTitles)
    const proof = cache.getWithProvenance(candidate, localTitles)
    const report = collectApprovedJoynEvidence({
      ...args,
      matcherDecisions: new Map([[candidate.joynProgramId, proof.diagnostic.decision]]),
      provenanceByProgram: new Map([[candidate.joynProgramId, {
        origin: 'cache', cachedMatch: proof,
      }]]),
    })
    expect(report.counts).toEqual({ examined: 1, accepted: 1, rejected: 0 })
    expect(report.approvedEvidence[0].checkedAt).toBe(CHECKED)
  })

  it('rejects conflicting original EPG title, missing programme ID or different airing time', async () => {
    const args = await sourceFixture()
    const changed = await sourceFixture({
      entryCandidate: { ...candidate, title: 'Different EPG programme' },
    })
    expect(collectApprovedJoynEvidence(changed)).toMatchObject({
      counts: { examined: 1, accepted: 0, rejected: 1 },
    })
    const missing = collectApprovedJoynEvidence({
      ...args, matcherDecisions: new Map(),
    })
    expect(missing).toMatchObject({
      counts: { examined: 1, accepted: 0, rejected: 1 },
      rejectedReasons: { missing_original_source_match_or_time: 1 },
    })
    const wrongTime = collectApprovedJoynEvidence({
      ...args, sourceEntries: [{ candidate: {
        ...candidate, startTime: '2026-11-14T09:00:00.000Z',
      }, channelId: 'ard' }],
    })
    expect(wrongTime.counts.accepted).toBe(0)
  })

  it('refuses ambiguous duplicate source programme rows rather than picking the first', async () => {
    const args = await sourceFixture()
    const report = collectApprovedJoynEvidence({
      ...args, sourceEntries: [...args.sourceEntries, {
        candidate: { ...candidate, title: 'Other film' }, channelId: 'ard',
      }],
    })
    expect(report).toMatchObject({
      counts: { examined: 1, accepted: 0, rejected: 1 },
    })
  })

  it('fails safely on unhealthy or unbounded source generations', async () => {
    const args = await sourceFixture()
    expect(collectApprovedJoynEvidence({
      ...args, adapterEnvelope: {
        ...args.adapterEnvelope, sourceStatus: 'failed',
      },
    })).toMatchObject({
      status: 'unavailable',
      counts: { examined: 0, accepted: 0, rejected: 0 },
      approvedEvidence: [],
    })
    expect(collectApprovedJoynEvidence({
      ...args, sourceEntries: Array(125_001).fill(args.sourceEntries[0]),
    }).status).toBe('unavailable')
  })
})
