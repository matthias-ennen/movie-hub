import { describe, it, expect, vi } from 'vitest'
import { prepareYouTubeMovieSearchTitle } from '../scripts/youtube-g2-title-query-prep.mjs'
import {
 NETZKINO_BASELINE_20_VIDEO_IDS, BASELINE_G2_RUN, BASELINE_MATCH_COUNTS,
 runYoutubeLivePreflight,
} from '../scripts/youtube-adapter-live-preflight.mjs'

const cases = [
 ['JELLA HAASE in 4 KÖNIGE – ein etwas anderer Weihnachtsfilm (Ganzer Film in voller Länge auf Deutsch)', '4 KÖNIGE'],
 ['NICOLE KIDMAN in MARGOT UND DIE HOCHZEIT (Komödie ganzer Film, Komödien Filme Deutsch komplett 2026)', 'MARGOT UND DIE HOCHZEIT'],
 ['Presidio (ACTION THRILLER mit SEAN CONNERY Filme Deutsch komplett, Actionfilme in voller Länge neu)', 'Presidio'],
 ['Wolfsmilch (OSCAR nominiertes Meisterwerk mit JACK NICHOLSON & MERYL STREEP, ganzer Film Deutsch)', 'Wolfsmilch'],
 ['Tone-Deaf (SCHWARZE HORRORKOMÖDIE in voller Länge, Horror Comedy Filme Deutsch komplett neu 2026)', 'Tone-Deaf'],
 ['Mirrors (MYSTERY HORROR mit KIEFER SUTHERLAND Filme Deutsch komplett, Horrorfilme in voller Länge)', 'Mirrors'],
 ['UND WIEDER 48 STUNDEN – EDDIE MURPHY & NICK NOLTE sind zurück! (Action Komödie ganzer Film Deutsch)', 'UND WIEDER 48 STUNDEN'],
 ['Target - Zielscheibe (ACTION THRILLER mit GENE HACKMAN Filme Deutsch komplett, Krimi Thriller 2026)', 'Target - Zielscheibe'],
 ['Freitag der 13. - Das letzte Kapitel (TEIL 4 der KULT HORRORFILM REIHE, Horrorfilme in voller Länge)', 'Freitag der 13. - Das letzte Kapitel'],
 ['Apache Junction - Stadt der Gesetzlosen (WESTERN ACTIONFILM in voller Länge, Filme Deutsch komplett)', 'Apache Junction - Stadt der Gesetzlosen'],
 ['UND WIEDER IST FREITAG DER 13. (Horrorfilme in voller Länge)', 'UND WIEDER IST FREITAG DER 13.'],
 ['2010: The Year We Make Contact', '2010: The Year We Make Contact'],
]
describe('YouTube G2 publisher SEO title query hygiene – matcher v1 untouched',()=>{
 it.each(cases)('extracts exact film search from real SEO title %s', (input,expected)=>{
  const r=prepareYouTubeMovieSearchTitle(input)
  expect(r.matchingTitle).toBe(expected)
  expect(r.queries[0]).toBe(expected)
  expect(r.rawTitle).toBe(input)
  expect(r.queries.length).toBeGreaterThan(0)
  expect(r.queries.length).toBeLessThanOrEqual(2)
 })
 it('does not strip genuine sequel numbers, subtitle, movie years or non-SEO parentheses',()=>{
  expect(prepareYouTubeMovieSearchTitle('Freitag der 13. - Das letzte Kapitel').queries[0])
   .toBe('Freitag der 13. - Das letzte Kapitel')
  expect(prepareYouTubeMovieSearchTitle('Film (1984)').queries[0]).toBe('Film (1984)')
  expect(prepareYouTubeMovieSearchTitle('Forever - Ab jetzt für immer').queries)
   .toEqual(['Forever - Ab jetzt für immer','Forever'])
  expect(prepareYouTubeMovieSearchTitle('War Story (Full Film)').queries).toEqual(['War Story'])
 })
 it('has exactly the original 20 VIDEO IDs, never newer videos misrepresented as baseline',()=>{
  expect(NETZKINO_BASELINE_20_VIDEO_IDS).toHaveLength(20)
  expect(new Set(NETZKINO_BASELINE_20_VIDEO_IDS).size).toBe(20)
  expect(NETZKINO_BASELINE_20_VIDEO_IDS.every(v=>/^[A-Za-z0-9_-]{11}$/.test(v))).toBe(true)
  expect(BASELINE_G2_RUN).toBe(39737252995)
  expect(Object.values(BASELINE_MATCH_COUNTS).reduce((s,x)=>s+x,0)).toBe(20)
 })
 it('re-fetches pinned IDs from ONE channel, never latest playlist, no publication',async()=>{
  const channel='UCGkHFrwE8KEuOHPVsIOskAg',videoId=NETZKINO_BASELINE_20_VIDEO_IDS[0]
  const youtube=vi.fn(async(p)=>{
   if(p==='channels')return {items:[{id:channel,snippet:{title:'Netzkino'},
    contentDetails:{relatedPlaylists:{uploads:'UPLOADS'}}}]}
   if(p==='videos')return {items:[{id:videoId,snippet:{
    channelId:channel,title:'Presidio (ACTION THRILLER mit SEAN CONNERY Filme Deutsch komplett)',
    channelTitle:'Netzkino',categoryId:'30',publishedAt:'2022-01-01T00:00:00Z',
   },status:{privacyStatus:'public'},contentDetails:{duration:'PT97M'}}]}
   throw Error('Latest uploads must not be queried in baseline replay')
  })
  const tmdb=vi.fn(async(p,params)=>{
   if(p==='/search/movie'){
    expect(params.query).toBe('Presidio')
    return {results:[{id:22030}]}
   }
   if(p==='/search/tv')return {results:[]}
   if(p==='/movie/22030')return {id:22030,title:'Presidio',original_title:'The Presidio',
    runtime:97,release_date:'1988-01-01',alternative_titles:{titles:[]},credits:{crew:[]}}
   throw Error('Unexpected TMDB query')
  })
  const r=await runYoutubeLivePreflight({youtube,tmdb,
   source:{channelId:channel,name:'Netzkino'},
   videoIdsSnapshot:[videoId],limit:1,
   now:()=> '2026-10-22T07:00:00Z'})
  expect(youtube.mock.calls.map(x=>x[0])).toEqual(['channels','videos'])
  expect(r.stats.youtubeCalls).toBe(2)
  expect(r.stats.sourceVideoIds).toBe(1)
  expect(r.stats.detailResolved).toBe(1)
  expect(r.rows[0].prepared.matchingTitle).toBe('Presidio')
  expect(r.rows[0].verdict.topCandidates[0].tmdbId).toBe(22030)
  expect(r.preview.publicationPermitted).toBe(false)
  expect(r.preview.firestoreWrites).toBe(0)
  expect(r.preview.catalogWrites).toBe(0)
 })
 it('rejects forged replay manifest or cross-channel mixing even when metadata comes live',async()=>{
  const youtube=vi.fn(async()=>({items:[]}))
  const tmdb=vi.fn(async()=>({}))
  await expect(runYoutubeLivePreflight({youtube,tmdb,
   source:{channelId:'UCGkHFrwE8KEuOHPVsIOskAg'},limit:2,
   videoIdsSnapshot:[NETZKINO_BASELINE_20_VIDEO_IDS[0],NETZKINO_BASELINE_20_VIDEO_IDS[0]],
  })).rejects.toThrow(/Pinned video-ID replay/)
  expect(tmdb).not.toHaveBeenCalled()
 })
})
