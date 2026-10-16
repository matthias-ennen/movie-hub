import { describe, it, expect, vi } from 'vitest'
import { sourceTitleQueryCandidates, MAX_EXTRA_SOURCE_QUERIES } from '../scripts/source-title-query-variants.mjs'
import { compareUnmatchedQueryQuality } from '../scripts/youtube-g1-review-diagnostics.mjs'

const vid = n => 'A' + String(n).padStart(10, '0')

describe('Source-neutral provider-title query proposals', () => {
  it('removes only observed, explicit cast-introduction prefixes', () => {
    expect(sourceTitleQueryCandidates('NICOLE KIDMAN in MARGOT UND DIE HOCHZEIT (Komödie ganzer Film)',
      'NICOLE KIDMAN in MARGOT UND DIE HOCHZEIT')).toContainEqual({
      title: 'MARGOT UND DIE HOCHZEIT', reason:'cast-prefix',
    })
    expect(sourceTitleQueryCandidates('MERYL STREEP in GLAUBENSFRAGE', 'MERYL STREEP in GLAUBENSFRAGE'))
      .toContainEqual({title:'GLAUBENSFRAGE',reason:'cast-prefix'})
    expect(sourceTitleQueryCandidates('RALPH FIENNES ist SPIDER', 'RALPH FIENNES ist SPIDER'))
      .toContainEqual({title:'SPIDER',reason:'cast-prefix'})
    expect(sourceTitleQueryCandidates('ROBERT DE NIRO in DIE BRÜCKE VON SAN LUIS REY',
      'ROBERT DE NIRO in DIE BRÜCKE VON SAN LUIS REY'))
      .toContainEqual({title:'DIE BRÜCKE VON SAN LUIS REY', reason:'cast-prefix'})
  })
  it('handles self-evident actor advertising tails without chopping real hyphen subtitles', () => {
    expect(sourceTitleQueryCandidates('UND WIEDER 48 STUNDEN – EDDIE MURPHY & NICK NOLTE sind zurück!',
      'UND WIEDER 48 STUNDEN – EDDIE MURPHY & NICK NOLTE sind zurück!'))
      .toContainEqual({title:'UND WIEDER 48 STUNDEN',reason:'cast-promo-tail'})
    expect(sourceTitleQueryCandidates('EDDIE MURPHY & NICK NOLTE haben NUR 48 STUNDEN',
      'EDDIE MURPHY & NICK NOLTE haben NUR 48 STUNDEN'))
      .toContainEqual({title:'NUR 48 STUNDEN',reason:'cast-pair-prefix'})
    expect(sourceTitleQueryCandidates('Knight Moves - Ein mörderisches Spiel',
      'Knight Moves - Ein mörderisches Spiel')).toEqual([])
    expect(sourceTitleQueryCandidates('Die Reise in die Vergangenheit (2010)',
      'Die Reise in die Vergangenheit (2010)')).toEqual([])
    expect(sourceTitleQueryCandidates('The Man in the High Castle',
      'The Man in the High Castle')).toEqual([])
  })
  it('only trims genre footers with contextual markers; never mistakes marketing for a whole film', () => {
    expect(sourceTitleQueryCandidates('Josie - Gefährliche Begegnung Drama Thriller 👿 Starring Sophie Turner',
      'Josie - Gefährliche Begegnung Drama Thriller 👿 Starring Sophie Turner'))
      .toContainEqual({title:'Josie - Gefährliche Begegnung',reason:'recognised-genre-footer'})
    expect(sourceTitleQueryCandidates('Netzkino: The Quiet Place | Ganzer Film auf Deutsch',
      'Netzkino: The Quiet Place'))
      .toContainEqual({title:'The Quiet Place',reason:'explicit-publisher-prefix'})
    expect(sourceTitleQueryCandidates('Drama Thriller', 'Drama Thriller')).toEqual([])
    expect(sourceTitleQueryCandidates('THE MOVIE 2025', 'THE MOVIE 2025')).toEqual([])
    expect(sourceTitleQueryCandidates('Film - Drama', 'Film - Drama')).toEqual([])
  })
  it('never emits unlimited search strings or silently derives a release year', () => {
    const list=sourceTitleQueryCandidates('RALPH FIENNES ist SPIDER | Ganzer Film auf Deutsch',
      'RALPH FIENNES ist SPIDER',99)
    expect(list.length).toBeLessThanOrEqual(MAX_EXTRA_SOURCE_QUERIES)
    expect(list.every(x=>typeof x.title==='string' && typeof x.reason==='string')).toBe(true)
    expect(list.every(x=>!x.title.includes('2026'))).toBe(true)
  })
})

describe('G1 unmatched A/B comparison',()=>{
  it('keeps the old unmatched status and only reports new search hints',async()=>{
    const p1={videoId:vid(1),oldTitle:'MERYL STREEP in GLAUBENSFRAGE',
      rawTitle:'MERYL STREEP in GLAUBENSFRAGE',variants:['MERYL STREEP in GLAUBENSFRAGE (2008)'],status:'no-search-results'}
    const p2={videoId:vid(2),oldTitle:'Knight Moves - Ein mörderisches Spiel',
      rawTitle:'Knight Moves - Ein mörderisches Spiel',variants:[],status:'no-safe-query-variant'}
    const query=vi.fn(async ({title})=>title==='GLAUBENSFRAGE'?
      [{id:123, title:'Glaubensfrage', release_date:'2008-01-01'}]:[])
    const x=await compareUnmatchedQueryQuality({problems:[p1,p2]},{searchTmdb:query})
    expect(x.compared).toBe(2)
    expect(x.addedQueries).toBe(1)
    expect(x.casesWithNewHints).toBe(1)
    expect(x.casesWithoutFreshVariants).toBe(1)
    expect(query).toHaveBeenCalledTimes(1)
    expect(x.rows[0].hints).toEqual([{tmdbId:123,title:'Glaubensfrage',year:2008}])
    expect(x.rows[0].baseline).toBe('no-search-results')
    expect(p1.status).toBe('no-search-results')
    expect(x.report).toContain('KEIN neuer Match')
    expect(x.report).not.toContain('provisional-identity')
  })
  it('rejects malformed API responses instead of mislabeling them as no result',async()=>{
    await expect(compareUnmatchedQueryQuality({problems:[{
      videoId:vid(1),oldTitle:'RALPH FIENNES ist SPIDER',rawTitle:'RALPH FIENNES ist SPIDER',
      variants:[],status:'no-search-results',
    }]},{searchTmdb:async()=>null})).rejects.toThrow('did not return a list')
  })
})
