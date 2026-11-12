import { describe, expect, it } from 'vitest'
import { summarizePrivateJoynCacheTtl } from '../scripts/epg-g1e-private-joyn-cache-ttl-audit.mjs'

const NOW = Date.parse('2026-11-12T12:00:00Z')
const PRIVATE = 'SECRET_JOYN_ORIGINAL_TITLE_887722'
const at = daysAgo => new Date(NOW - daysAgo * 86_400_000).toISOString()
const matchEntry = (status, checkedAt, id) => ({
  checkedAt,
  diagnostic: { decision: { status, tmdbId: id }, title: PRIVATE,
    joynClassification: { privateSourceId: PRIVATE } },
})
function cache() {
  return {
    matchCache: {
      kind: 'joyn-match-cache', schemaVersion: 1, matcherVersion: 5,
      entries: {
        privateA: matchEntry('matched', at(1), 999),
        privateB: matchEntry('matched', at(31), 1000),
        privateC: matchEntry('unmatched', at(6), 1001),
        privateD: matchEntry('unmatched', at(8), 1002),
        privateE: matchEntry('matched', at(-1), 1003),
        privateF: { checkedAt: at(2), diagnostic: { decision: { status: 'ambiguous', title: PRIVATE } } },
      },
    },
    lookupCache: {
      kind: 'joyn-lookup-cache', schemaVersion: 1, entries: {
        privateQueryA: { checkedAt: at(1), value: { title: PRIVATE } },
        privateQueryB: { checkedAt: at(8), value: { title: PRIVATE } },
        privateQueryC: { checkedAt: 'not a date', value: { title: PRIVATE } },
      },
    },
    now: NOW,
  }
}

describe('G1e original Joyn cache read-only TTL upper-bound audit', () => {
  it('counts only TTL status upper bounds, not source-key matches or approvals', () => {
    const result = summarizePrivateJoynCacheTtl(cache())
    expect(result).toMatchObject({
      kind: 'g1e-private-joyn-cache-ttl-audit',
      mode: 'private-read-only',
      match: {
        entries: 6,
        compatibleMatcherVersion: true,
        ttlEligibleMatchedUpperBound: 1,
        ttlEligibleUnmatchedUpperBound: 1,
        expiredOrInvalidTime: 3,
        unclassifiedDecisions: 1,
      },
      lookup: {
        entries: 3,
        ttlEligibleResponseUpperBound: 1,
        expiredOrInvalidTime: 2,
      },
      gate: {
        currentProgrammeCacheHitsVerified: false,
        freshOriginalMatcherReceiptsApproved: false,
        measuredProductionSavings: null,
      },
    })
    const encoded = JSON.stringify(result)
    for (const forbidden of [PRIVATE, 'privateA', 'privateQueryB', '999', '1000']) {
      expect(encoded).not.toContain(forbidden)
    }
  })

  it('does not claim reusable match decisions for a mismatched matcher version', () => {
    const value = cache()
    value.matchCache.matcherVersion = 4
    const r = summarizePrivateJoynCacheTtl(value)
    expect(r.match).toMatchObject({
      compatibleMatcherVersion: false,
      ttlEligibleMatchedUpperBound: 0,
      ttlEligibleUnmatchedUpperBound: 0,
    })
    expect(r.gate.freshOriginalMatcherReceiptsApproved).toBe(false)
  })

  it('is fail-closed on malformed input or an invalid audit clock', () => {
    const value = cache()
    expect(() => summarizePrivateJoynCacheTtl({ ...value, now: NaN })).toThrow()
    expect(() => summarizePrivateJoynCacheTtl({ ...value, lookupCache: null })).toThrow()
    expect(() => summarizePrivateJoynCacheTtl({ ...value,
      matchCache: { ...value.matchCache, schemaVersion: 2 } })).toThrow()
    expect(() => summarizePrivateJoynCacheTtl({ ...value,
      matchCache: { ...value.matchCache, entries: [] } })).toThrow()
  })

  it('uses the strict 30-day positive and 7-day negative/response TTL edges', () => {
    const value = cache()
    value.matchCache.entries = {
      positiveLast: matchEntry('matched', at(29.99), 1),
      positiveExpired: matchEntry('matched', at(30), 2),
      negativeLast: matchEntry('unmatched', at(6.99), 3),
      negativeExpired: matchEntry('unmatched', at(7), 4),
    }
    value.lookupCache.entries = {
      last: { checkedAt: at(6.99), value: [] },
      expired: { checkedAt: at(7), value: [] },
    }
    const r = summarizePrivateJoynCacheTtl(value)
    expect(r.match.ttlEligibleMatchedUpperBound).toBe(1)
    expect(r.match.ttlEligibleUnmatchedUpperBound).toBe(1)
    expect(r.match.expiredOrInvalidTime).toBe(2)
    expect(r.lookup.ttlEligibleResponseUpperBound).toBe(1)
  })
})
