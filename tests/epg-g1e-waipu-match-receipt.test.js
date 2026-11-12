import { describe, expect, it } from 'vitest'
import { matchWaipuProgram } from '../scripts/waipu-tmdb-matcher.mjs'
import { mapWaipuAiringToBroadcastEvent } from '../src/sources/adapters/waipuContractMapper.js'
import { buildWaipuApprovedEpgReceipt } from '../scripts/epg-g1e-waipu-match-receipt.mjs'
import { SharedEpgIdentityIndex } from '../src/sources/sharedEpgIdentityIndex.js'

const generatedAt = '2026-11-12T06:35:30.000Z'
const startTime = '2026-11-13T08:00:00.000Z'
const stopTime = '2026-11-13T10:00:00.000Z'
const broadcast = {
  programId: 'waipu-program-1',
  stationId: 'ard', stationName: 'Das Erste',
  title: 'The Man from Toronto', startTime, stopTime,
}
const input = {
  title: 'The Man from Toronto',
  originalTitle: 'The Man from Toronto',
  aliases: ['The Man from Toronto'],
  productionYear: 2022, type: 'movie',
  productionCountries: ['Vereinigte Staaten'],
}
const candidate = {
  tmdbId: 667739, type: 'movie',
  title: 'The Man from Toronto',
  originalTitle: 'The Man from Toronto', year: 2022,
}

async function acceptedFixture() {
  const decision = await matchWaipuProgram(input, {
    localCandidates: [candidate],
    now: () => Date.parse('2026-11-12T06:35:00.000Z'),
  })
  const event = mapWaipuAiringToBroadcastEvent({
    type: 'movie', tmdbId: candidate.tmdbId,
  }, broadcast, { observedAt: generatedAt })
  return { sourceBroadcast: broadcast, normalizedInput: input,
    matcherDecision: decision, broadcastEvent: event, sourceStatus: 'healthy' }
}

describe('G1e optional trusted Waipu source-title matcher receipt', () => {
  it('builds an exact and source-verified positive receipt from the REAL Waipu matcher', async () => {
    const args = await acceptedFixture()
    expect(args.matcherDecision.status).toBe('matched')
    const result = buildWaipuApprovedEpgReceipt(args)
    expect(result).toMatchObject({
      accepted: true, evidence: {
        sourceId: 'waipu-epg', stationId: 'ard', title: 'The Man from Toronto',
        tmdbId: 667739, type: 'movie', productionYear: 2022,
        startTime, endTime: stopTime,
        matchMethod: 'waipu-v5:exact-title-evidence',
      },
    })
    expect(JSON.stringify(result)).not.toContain('app.waipu.tv')
    expect(result.evidence).not.toHaveProperty('playbackRoutes')
    const index = new SharedEpgIdentityIndex({ now: Date.parse(generatedAt) })
    expect(index.addConfirmed(result.evidence)).toBe(true)
    expect(index.lookup({ stationId: 'ard', title: broadcast.title,
      startTime, endTime: stopTime, type: 'movie', productionYear: 2022 }))
      .toMatchObject({ status: 'hit', identity: { tmdbId: 667739 } })
  })

  it('refuses a TMDB-derived replacement of the real original EPG title', async () => {
    const args = await acceptedFixture()
    expect(buildWaipuApprovedEpgReceipt({
      ...args, sourceBroadcast: { ...broadcast, title: 'An unrelated programme' },
    })).toEqual({
      accepted: false, reason: 'original_epg_title_or_episode_unverified',
    })
    expect(buildWaipuApprovedEpgReceipt({
      ...args, sourceBroadcast: { ...broadcast, title: '' },
    }).accepted).toBe(false)
  })

  it('never promotes uncertain or unapproved Waipu decisions into cross-adapter index evidence', async () => {
    const args = await acceptedFixture()
    expect(buildWaipuApprovedEpgReceipt({
      ...args, matcherDecision: { ...args.matcherDecision, status: 'unmatched' },
    })).toMatchObject({ accepted: false, reason: 'unconfirmed_waipu_match' })
    expect(buildWaipuApprovedEpgReceipt({
      ...args, matcherDecision: {
        ...args.matcherDecision, match: { ...args.matcherDecision.match, score: 78 },
      },
    })).toMatchObject({ accepted: false,
      reason: 'waipu_match_not_strong_enough_for_cross_source' })
    expect(buildWaipuApprovedEpgReceipt({
      ...args, matcherDecision: {
        ...args.matcherDecision, match: { ...args.matcherDecision.match, margin: 0 },
      },
    })).toMatchObject({ accepted: false,
      reason: 'waipu_match_not_strong_enough_for_cross_source' })
    expect(buildWaipuApprovedEpgReceipt({
      ...args, matcherDecision: {
        ...args.matcherDecision, match: { ...args.matcherDecision.match, signals: ['title:55'] },
      },
    })).toMatchObject({ accepted: false,
      reason: 'waipu_match_not_strong_enough_for_cross_source' })
  })

  it('refuses stale matcher decisions and requires the exact source program identity', async () => {
    const args = await acceptedFixture()
    expect(buildWaipuApprovedEpgReceipt({
      ...args, matcherDecision: {
        ...args.matcherDecision, checkedAt: '2026-11-09T06:35:00.000Z',
      },
    })).toEqual({ accepted: false, reason: 'source_ref_missing' })
    expect(buildWaipuApprovedEpgReceipt({
      ...args, sourceBroadcast: { ...broadcast, programId: 'another-waipu-program' },
    })).toEqual({ accepted: false, reason: 'source_ref_missing' })
    expect(buildWaipuApprovedEpgReceipt({
      ...args, sourceStatus: 'degraded',
    })).toEqual({ accepted: false, reason: 'source_not_healthy' })
  })

  it('rejects film year contradictions even if the matcher output was marked matched', async () => {
    const args = await acceptedFixture()
    expect(buildWaipuApprovedEpgReceipt({
      ...args, matcherDecision: { ...args.matcherDecision,
        match: { ...args.matcherDecision.match, year: 1990 } },
    })).toEqual({ accepted: false, reason: 'source_tmdb_year_conflict' })
  })

  it('does not invent series season numbers when waipu episode fields disagree', async () => {
    const args = await acceptedFixture()
    expect(buildWaipuApprovedEpgReceipt({
      ...args, normalizedInput: { ...input, seasonNumber: 1 },
      broadcastEvent: { ...args.broadcastEvent,
        episode: { seasonNumber: 2, episodeNumber: 1 } },
    })).toEqual({ accepted: false,
      reason: 'original_epg_title_or_episode_unverified' })
  })
})
