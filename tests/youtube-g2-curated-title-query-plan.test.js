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
  it.each([
    ['Wishmaster 2: Evil Never Dies FANTASY, HORROR Full Movie in English',
      'Wishmaster 2: Evil Never Dies', 'english-genre-and-full-movie-tail'],
    ['Stalingrad [1993] Ganzer FIlm mit Thomas Kretschmann, Jochen Nickel, Dominique Horwitz',
      'Stalingrad', 'explicit-source-year-and-cast-tail'],
    ['So Weit Die Füße Tragen (bewegender Abenteuerfilm und Kriegsdrama mit 7,3 IMDb-Bewertung)',
      'So Weit Die Füße Tragen', 'imdb-description-tail'],
    ['The Watcher Thriller mit Keanu Reeves Ganzer Film',
      'The Watcher', 'genre-actor-and-full-film-tail'],
    ['Nürnberg (2026)', 'Nuremberg', 'official-original-title-alias-release-year-review'],
  ])('repairs real 58-ID source searches without modifying video-title provenance: %s',
    (source, firstQuery, reason) => {
      const result = planCuratedTmdbQueries(source)
      expect(result.rawTitle).toBe(source)
      expect(result.queries[0]).toBe(firstQuery)
      expect(result.queries.length).toBeLessThanOrEqual(2)
      expect(result.curatedQueryReason).toBe(reason)
    })

  it('treats the German 2026 theatrical year as provenance, NOT confirmed original-film release year', () => {
    const result = planCuratedTmdbQueries('Nürnberg (2026)')
    expect(result.matchingTitle).toBe('Nuremberg')
    expect(result.queries).toEqual(['Nuremberg', 'Nürnberg'])
    expect(result.reportedYear).toBe(2026)
  })

  it('keeps already clean full titles, short ambiguous titles and lookalikes untouched', () => {
    for (const raw of [
      'Wishmaster 2: Evil Never Dies', 'Stalingrad (1993)',
      'So Weit Die Füße Tragen', 'The Watcher',
      'Nürnberg', 'IT', 'Full Movie in English',
      'The Watcher of the Woods', 'Stalingrad [1993] Preview',
    ]) {
      const plan = planCuratedTmdbQueries(raw)
      expect(plan.rawTitle).toBe(raw)
      expect(plan.curatedQueryReason).toBeNull()
    }
    expect(planCuratedTmdbQueries('IT').queries).toEqual([])
  })

  it('rejects ambiguous collection-like strings without a complete year', () => {
    const p=planCuratedTmdbQueries('Alte Deutsche Spielfilme ~ Something ~ 19')
    expect(p.curatedQueryReason).toBeNull()
  })
})
