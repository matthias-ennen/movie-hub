import { describe, it, expect } from 'vitest'
import { summarizeJoynClassificationCoverage } from '../scripts/joyn-classification-coverage.mjs'

describe('Joyn full classification coverage', () => {
  it('counts each program once and separates cached and fresh source evidence', () => {
    const entries = new Map([
      ['PRIVATE_ID_1', { joynClassification: { type: 'movie' }, decision: { status: 'matched' } }],
      ['PRIVATE_ID_2', { joynClassification: { type: 'series' }, decision: { status: 'unmatched' } }],
      ['PRIVATE_ID_3', { joynClassification: { type: null, reason: 'not_needed' }, decision: { status: 'matched' } }],
      ['PRIVATE_ID_4', { decision: { status: 'unmatched' }, title: 'PRIVATE_TITLE' }],
      ['PRIVATE_ID_5', { joynClassification: { type: null }, decision: { status: 'matched', match: { type: 'movie' } } }],
    ])
    const r = summarizeJoynClassificationCoverage(entries, new Set(['PRIVATE_ID_1', 'PRIVATE_ID_4']))
    expect(r.all).toMatchObject({ total: 5, matched: 3, unresolved: 2, byClassification: {
      movie: { total: 1, matched: 1, unresolved: 0 }, series: { total: 1, matched: 0, unresolved: 1 },
      notNeeded: { total: 1, matched: 1, unresolved: 0 }, unknown: { total: 2, matched: 1, unresolved: 1 },
    } })
    expect(r.cache).toMatchObject({ total: 2, matched: 1, unresolved: 1 })
    expect(r.fresh).toMatchObject({ total: 3, matched: 2, unresolved: 1 })
    expect(JSON.stringify(r)).not.toContain('PRIVATE_')
  })
  it('retains zero rather than inventing a classification when no programs are present', () => {
    const r = summarizeJoynClassificationCoverage(new Map(), new Set())
    for (const b of Object.values(r)) {
      expect(b.total).toBe(0)
      expect(b.matched).toBe(0)
      expect(b.unresolved).toBe(0)
      expect(Object.values(b.byClassification).every(v => v.total === 0)).toBe(true)
    }
  })
})
