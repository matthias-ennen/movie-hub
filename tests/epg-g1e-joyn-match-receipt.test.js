import { describe, expect, it } from 'vitest'
import { matchJoynProgram } from '../scripts/joyn-tmdb-matcher.mjs'
import { JoynMatchCache } from '../scripts/joyn-match-cache.mjs'
import { mapJoynCandidateToBroadcastEvent } from '../src/sources/adapters/joynContractMapper.js'
import { buildJoynApprovedEpgReceipt } from '../scripts/epg-g1e-joyn-match-receipt.mjs'
import { SharedEpgIdentityIndex } from '../src/sources/sharedEpgIdentityIndex.js'

const OBSERVED = '2026-11-12T06:35:30.000Z'
const CHECKED = '2026-11-12T06:35:00.000Z'
const START = '2026-11-14T08:00:00.000Z'
const END = '2026-11-14T10:00:00.000Z'
const sourceCandidate = {
  title: 'Arrival',
  joynProgramId: 'joyn-program-123',
  joynChannelId: 'joyn-channel-1',
  channelTitle: 'Das Erste',
  startTime: START,
  endTime: END,
}
const tmdbCandidates = [
  { tmdbId: 329865, type: 'movie', title: 'Arrival',
    originalTitle: 'Arrival', year: 2016 },
]

async function actualJoynFixture() {
  const matcherDecision = await matchJoynProgram({
    title: sourceCandidate.title,
  }, { localCandidates: tmdbCandidates })
  const broadcastEvent = mapJoynCandidateToBroadcastEvent(
    sourceCandidate, matcherDecision.match, { channelId: 'ard', observedAt: OBSERVED },
  )
  return { sourceCandidate, matcherDecision, broadcastEvent,
    sourceStatus: 'healthy', matchCheckedAt: CHECKED }
}

describe('G1e Joyn matcher identity receipt and preserved cache checkedAt', () => {
  it('turns a REAL exact unique Joyn matcher decision into a source-proven identity only', async () => {
    const fixture = await actualJoynFixture()
    expect(fixture.matcherDecision).toMatchObject({
      status: 'matched', source: 'local', matcherVersion: 5,
      match: { tmdbId: 329865, type: 'movie', score: 100, margin: 100 },
    })
    const checked = buildJoynApprovedEpgReceipt(fixture)
    expect(checked).toMatchObject({
      accepted: true, evidence: {
        sourceId: 'joyn-epg', stationId: 'ard',
        title: 'Arrival', type: 'movie', tmdbId: 329865,
        startTime: START, endTime: END,
        checkedAt: CHECKED, matchMethod: 'joyn-v5:exact-title-evidence',
      },
    })
    expect(checked.evidence.productionYear).toBeNull()
    expect(JSON.stringify(checked)).not.toContain('app.joyn.de')
    expect(checked.evidence).not.toHaveProperty('playbackRoutes')
    const index = new SharedEpgIdentityIndex({ now: Date.parse(OBSERVED) })
    expect(index.addConfirmed(checked.evidence)).toBe(true)
    expect(index.lookup({
      stationId: 'ard', title: 'Arrival', type: 'movie',
      startTime: START, endTime: END,
    })).toMatchObject({ status: 'hit', identity: { tmdbId: 329865 } })
    // An unknown EPG production year MUST NOT be replaced by TMDB year 2016.
    expect(index.lookup({
      stationId: 'zdf', title: 'Arrival', type: 'movie',
      startTime: START, endTime: END,
    })).toMatchObject({ status: 'miss', reason: 'missing_year_for_title_reuse' })
  })

  it('rejects a changed programme title or programme ID even for a known TMDB identity', async () => {
    const fixture = await actualJoynFixture()
    const changed = buildJoynApprovedEpgReceipt({
      ...fixture, sourceCandidate: { ...sourceCandidate, title: 'Another film' },
    })
    expect(changed).toEqual({
      accepted: false, reason: 'joyn_source_title_or_programme_unverified',
    })
    const changedProgram = buildJoynApprovedEpgReceipt({
      ...fixture,
      sourceCandidate: { ...sourceCandidate, joynProgramId: 'unrelated-programme' },
    })
    expect(changedProgram).toEqual({ accepted: false, reason: 'source_ref_missing' })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, sourceCandidate: { ...sourceCandidate, startTime: '2026-11-14T09:00:00Z' },
    })).toEqual({ accepted: false, reason: 'approval_event_mismatch' })
  })

  it('rejects weak, ambiguous, mismatched and year-contradictory matches', async () => {
    const fixture = await actualJoynFixture()
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matcherDecision: { ...fixture.matcherDecision, status: 'unmatched' },
    })).toMatchObject({ accepted: false, reason: 'unconfirmed_joyn_match' })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matcherDecision: { ...fixture.matcherDecision, match: {
        ...fixture.matcherDecision.match, score: 89,
      } },
    })).toMatchObject({
      accepted: false, reason: 'joyn_match_not_strong_enough_for_cross_source',
    })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matcherDecision: { ...fixture.matcherDecision, match: {
        ...fixture.matcherDecision.match, margin: 0,
      } },
    })).toMatchObject({
      accepted: false, reason: 'joyn_match_not_strong_enough_for_cross_source',
    })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, sourceCandidate: { ...sourceCandidate, productionYear: 1998 },
    })).toEqual({ accepted: false, reason: 'source_tmdb_year_conflict' })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, sourceCandidate: { ...sourceCandidate, type: 'series' },
    })).toEqual({
      accepted: false, reason: 'joyn_source_title_or_programme_unverified',
    })
  })

  it('requires an explicit original match time, not a fabricated fresh current timestamp', async () => {
    const fixture = await actualJoynFixture()
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matchCheckedAt: null,
    })).toEqual({ accepted: false, reason: 'match_time_missing' })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matchCheckedAt: 'not-a-date',
    })).toEqual({ accepted: false, reason: 'match_time_missing' })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, sourceStatus: 'failed',
    })).toEqual({ accepted: false, reason: 'source_not_healthy' })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matchCheckedAt: '2026-11-01T06:35:00.000Z',
    })).toEqual({ accepted: false, reason: 'source_ref_missing' })
  })

  it('exposes cache timestamp without changing JoynMatchCache.get() semantics or hit counts', async () => {
    const fixture = await actualJoynFixture()
    const diagnostic = { decision: fixture.matcherDecision, title: sourceCandidate.title }
    const cache = new JoynMatchCache({}, Date.parse(CHECKED))
    cache.set(sourceCandidate, diagnostic, tmdbCandidates)
    expect(cache.get(sourceCandidate, tmdbCandidates)).toBe(diagnostic)
    expect(cache.hits).toBe(1)
    const proof = cache.getWithProvenance(sourceCandidate, tmdbCandidates)
    expect(proof).toMatchObject({
      diagnostic, checkedAt: CHECKED, origin: 'cache',
    })
    expect(cache.hits).toBe(2)
    const verified = buildJoynApprovedEpgReceipt({
      ...fixture, matcherDecision: proof.diagnostic.decision,
      matchCheckedAt: null, cachedMatch: proof,
    })
    expect(verified).toMatchObject({ accepted: true,
      evidence: { checkedAt: CHECKED, tmdbId: 329865 } })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matcherDecision: proof.diagnostic.decision,
      matchCheckedAt: OBSERVED, cachedMatch: proof,
    })).toEqual({ accepted: false, reason: 'cache_provenance_missing' })
  })

  it('rejects caches from earlier source generations even when Joyn itself can use them', async () => {
    const fixture = await actualJoynFixture()
    const old = Date.parse('2026-11-10T06:35:00.000Z')
    const cache = new JoynMatchCache({}, old)
    cache.set(sourceCandidate, { decision: fixture.matcherDecision }, tmdbCandidates)
    cache.now = Date.parse(CHECKED)
    const proof = cache.getWithProvenance(sourceCandidate, tmdbCandidates)
    expect(proof).not.toBeNull()
    expect(proof.checkedAt).toBe('2026-11-10T06:35:00.000Z')
    // Direct matcher autonomy remains unaffected.
    expect(proof.diagnostic.decision.status).toBe('matched')
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matcherDecision: proof.diagnostic.decision,
      matchCheckedAt: null, cachedMatch: proof,
    })).toEqual({ accepted: false, reason: 'source_ref_missing' })
  })

  it('does not accept hand-built cache provenance or contradictory series episode evidence', async () => {
    const fixture = await actualJoynFixture()
    const fakeProof = { origin: 'cache', checkedAt: CHECKED,
      diagnostic: { decision: { ...fixture.matcherDecision } } }
    expect(buildJoynApprovedEpgReceipt({
      ...fixture, matchCheckedAt: null, cachedMatch: fakeProof,
    })).toEqual({ accepted: false, reason: 'cache_provenance_missing' })
    expect(buildJoynApprovedEpgReceipt({
      ...fixture,
      broadcastEvent: { ...fixture.broadcastEvent,
        episode: { conflict: true, seasonNumber: null, episodeNumber: null },
      },
    })).toEqual({ accepted: false, reason: 'episode_conflict' })
  })
})
