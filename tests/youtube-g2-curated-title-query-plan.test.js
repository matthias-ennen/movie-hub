import { describe, it, expect } from 'vitest'
import { planCuratedTmdbQueries } from '../scripts/youtube-g2-curated-title-query-plan.mjs'

describe('G2 curated playlists: conservative observed title query repairs', () => {
  it('looks for the actual film Heat, not the promotional phrase "Heat in HD"', () => {
    const query = planCuratedTmdbQueries('Heat (ganzer Film auf Deutsch) in HD')
    expect(query.curatedQueryReason).toBe('remove-promotional-hd-suffix')
    expect(query.matchingTitle).toBe('Heat')
    expect(query.queries[0]).toBe('Heat')
    expect(query.queries).toContain('Heat in HD')
    expect(query.queries).toHaveLength(2)
  })
  it('recognizes a fixed collection label and preserves the explicit release year', () => {
    const query = planCuratedTmdbQueries(
      'Alte Deutsche Spielfilme ~ Knockin on Heaven s Door ~ 1997')
    expect(query).toMatchObject({
      matchingTitle:'Knockin on Heaven s Door (1997)',
      queries:['Knockin on Heaven s Door'],
      curatedQueryReason:'explicit-german-movie-collection-label-with-year',
    })
  })
  it('does not strip genuine title words or rewrite ordinary titles', () => {
    for (const raw of ['The Amateur', 'Terrified', 'Heat in HD', 'Heat (1995)']) {
      const p=planCuratedTmdbQueries(raw)
      expect(p.curatedQueryReason).toBeNull()
      expect(p.queries.length).toBeLessThanOrEqual(2)
    }
  })
  it('rejects ambiguous collection-like strings without a complete year', () => {
    const p=planCuratedTmdbQueries('Alte Deutsche Spielfilme ~ Something ~ 19')
    expect(p.curatedQueryReason).toBeNull()
  })
})
