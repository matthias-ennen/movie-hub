import { describe, it, expect, vi } from 'vitest'
import { extractYouTubeMovieTitle, runtimeAgreement, analyzeYouTubeMovie, analyzeSample, assessYearlessCandidate, compareYearlessReviews } from '../scripts/youtube-tmdb-match-pilot.mjs'
import { SOURCES } from '../scripts/youtube-api-smoke.mjs'

const ID='abcdefghijk'
function video(overrides={}){
 return { id:ID, snippet:{title:'Viking Blood (2018) Abenteuer Action ganzer film auf deutsch',channelId:SOURCES[0].channelId},
  status:{privacyStatus:'public'}, contentDetails:{duration:'PT1H28M',regionRestriction:{allowed:['DE']}}, ...overrides }
}
function tmdbResults(results){return vi.fn(async()=>results)}
const a=(id, year, title='Viking Blood')=>({
  id, title, original_title:title, release_date:year+'-01-01', media_type:'movie', type:'movie',
})

describe('YouTube G1 TMDB research only',()=>{
 it('extracts only leading explicit release year and does not confuse upload dates or actors',()=>{
   expect(extractYouTubeMovieTitle('Viking Blood (2018) Abenteuer Action')).toEqual({title:'Viking Blood',productionYear:2018})
   expect(extractYouTubeMovieTitle('Film mit Schauspieler (Dokumentarfilm) 2026')).toEqual({
    title:'Film mit Schauspieler',productionYear:null,
   })
   expect(extractYouTubeMovieTitle('Gunner (2025) full movie')).toEqual({title:'Gunner',productionYear:2025})
   expect(extractYouTubeMovieTitle('Die Rache der Putzfrauen (ganze Komödie)')).toEqual({
    title:'Die Rache der Putzfrauen',productionYear:null,
   })
 })
 it('treats runtime disagreement and missing runtime as review',()=>{
   expect(runtimeAgreement(88*60,88).withinTolerance).toBe(true)
   expect(runtimeAgreement(45*60,95).withinTolerance).toBe(false)
   expect(runtimeAgreement(88*60,null).checked).toBe(false)
 })
 it('requires exact year and independent movie runtime evidence for provisional identity',async()=>{
   const lookup=tmdbResults([a(233,2018)])
   const details=vi.fn(async()=>({runtimeMinutes:90}))
   const r=await analyzeYouTubeMovie(video(),SOURCES[0].channelId,{searchTmdb:lookup,loadDetails:details})
   expect(r.status).toBe('provisional-identity')
   expect(r.tmdbId).toBe(233)
   expect(r.runtimeDeltaMinutes).toBe(2)
   expect(details).toHaveBeenCalledTimes(1)
 })
 it('never upgrades an ambiguous same-title film without independent year, even if TMDB search found something',async()=>{
   const r=await analyzeYouTubeMovie(video({snippet:{title:'Viking Blood (ganzer Film)',channelId:SOURCES[0].channelId}}),
      SOURCES[0].channelId,{searchTmdb:tmdbResults([a(233,2018)]),loadDetails:async()=>({runtimeMinutes:88})})
   expect(r.status).toBe('review')
   expect(r.reason).toBe('no-independent-year')
 })
 it('never upgrades inconsistent video runtime or foreign channels',async()=>{
   const bad=await analyzeYouTubeMovie(video({contentDetails:{duration:'PT60M'}}),SOURCES[0].channelId,{
     searchTmdb:tmdbResults([a(233,2018)]),loadDetails:async()=>({runtimeMinutes:95}),
   })
   expect(bad.status).toBe('review')
   expect(bad.reason).toBe('runtime-conflict')
   const no=await analyzeYouTubeMovie(video({snippet:{title:'Viking Blood (2018)',channelId:'not-the-publisher'}}),
     SOURCES[0].channelId,{searchTmdb:()=>{throw Error('must not query')}})
   expect(no.status).toBe('excluded')
 })
 it('reports possible duplicate TMDB identity without writing an offer or claiming playback',async()=>{
   const first=video()
   const second={...video(),id:'12345678901'}
   const result=await analyzeSample({
     byPublisher:[{source:SOURCES[0],ids:[ID,'12345678901']}],
     detailMap:new Map([[ID,first],['12345678901',second]]),
   },{searchTmdb:tmdbResults([a(233,2018)]),loadDetails:async()=>({runtimeMinutes:89})})
   expect(result.counts['provisional-identity']).toBe(2)
   expect(result.possibleDuplicateGroups).toEqual([{key:'movie:233',videoCount:2}])
   expect(result.report).toContain('nicht durchgeführt')
   expect(result.report).toContain('Keine MovieHub-Katalog')
   expect(result.report).not.toContain('TMDB_API_READ_TOKEN')
 })
 it('keeps the existing year-required result on the same sample unchanged',async()=>{
   const raw=video({snippet:{title:'Viking Blood (ganzer Film)',channelId:SOURCES[0].channelId}})
   const result=await analyzeSample({
     byPublisher:[{source:SOURCES[0],ids:[ID]}], detailMap:new Map([[ID,raw]]),
   },{searchTmdb:tmdbResults([a(233,2018)]),loadDetails:async()=>({runtimeMinutes:88})})
   expect(result.counts).toEqual({review:1})
   expect(result.decisions[0].reason).toBe('no-independent-year')
   expect(result.decisions[0].sharedMatcherStatus).toBe('unmatched')
   expect(result.decisions[0].candidateScore).toBe(70)
   expect(result.decisions[0].sharedMatcherMargin).toBeGreaterThanOrEqual(12)
 })
 it('prioritizes only for human review when unique exact alias and TMDB runtime align',async()=>{
   const result={reason:'no-independent-year',tmdbId:233,tmdbTitle:'Viking Blood',
    tmdbOriginalTitle:'Viking Blood',title:'Viking Blood',tmdbYear:2018,
    candidateScore:70,sharedMatcherMargin:70}
   expect(assessYearlessCandidate(result,video()).status).toBe('needs-runtime-detail')
   const picked=assessYearlessCandidate(result,video(),{runtimeMinutes:90,year:2018})
   expect(picked).toEqual({status:'priority-manual-review',reason:'exact-alias-plus-runtime',delta:2})
   expect(assessYearlessCandidate(result,video(),{runtimeMinutes:111,year:2018}).status).toBe('insufficient')
   expect(assessYearlessCandidate({...result,sharedMatcherMargin:2},video()).reason).toBe('weak-or-ambiguous-candidate')
   expect(assessYearlessCandidate({...result,title:'Viking Blood Edition'},video()).reason).toBe('no-exact-tmdb-alias')
   expect(assessYearlessCandidate(result,video(),{runtimeMinutes:90,year:2017}).reason).toBe('inconsistent-tmdb-year')
   expect(assessYearlessCandidate({...result,tmdbYear:null},video()).reason).toBe('missing-tmdb-year')
 })
 it('compares yearless reviews with detail caching without upgrading the baseline decisions',async()=>{
   const decisions=[{reason:'no-independent-year',status:'review',title:'Viking Blood',videoId:ID,tmdbId:233,
      tmdbTitle:'Viking Blood',tmdbOriginalTitle:'Viking Blood',tmdbYear:2018,candidateScore:70,
      sharedMatcherStatus:'unmatched',sharedMatcherMargin:70},
      {reason:'no-independent-year',status:'review',title:'Viking Blood',videoId:'12345678901',tmdbId:233,
      tmdbTitle:'Viking Blood',tmdbOriginalTitle:'Viking Blood',tmdbYear:2018,candidateScore:70,
      sharedMatcherStatus:'unmatched',sharedMatcherMargin:70},
      {reason:'year-conflict',status:'review',title:'Other film',videoId:'other'}]
   const details=vi.fn(async()=>({year:2018,runtimeMinutes:89}))
   const outcome=await compareYearlessReviews({
       decisions, detailMap:new Map([[ID,video()],['12345678901',video({id:'12345678901'})]]),
   },{loadDetails:details})
   expect(outcome.yearlessCount).toBe(2)
   expect(outcome.priorityCount).toBe(2)
   expect(outcome.attemptedDetails).toBe(1)
   expect(details).toHaveBeenCalledTimes(1)
   expect(decisions.map(x=>x.status)).toEqual(['review','review','review'])
   expect(outcome.report).toContain('nur eine Priorisierung für manuelle Prüfung')
   expect(outcome.report).toContain('Baseline unverändert')
   expect(outcome.report).not.toContain('TMDB_API_READ_TOKEN')
 })

})
