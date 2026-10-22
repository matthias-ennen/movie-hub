import { describe, expect, it, vi } from 'vitest'
import {runYoutubeLargeAudit} from '../scripts/youtube-g2-large-live-audit.mjs'

const SRC_A='UCaaaaaaaaaaaaaaaaaaaaaa', SRC_B='UCbbbbbbbbbbbbbbbbbbbbbb'
const sources=[{channelId:SRC_A,name:'A'},{channelId:SRC_B,name:'B'}]
const CASES=Array.from({length:125},(_,i)=>({
 videoId:'V'+String(i).padStart(10,'0'),
 channelId:i<90?SRC_A:SRC_B,
 status:'review-no-movie-candidate',
}))
const movie={id:246013,title:'Iron Soldier',original_title:'Iron Soldier',
 release_date:'2011-01-01',runtime:95,
 alternative_titles:{titles:[]},credits:{crew:[]}}
function api({changeChannel=false,removeVideo=false}={}){
 const youtube=vi.fn(async(endpoint,params)=>{
  if(endpoint==='channels')return {items:sources.map(x=>({
   id:x.channelId,snippet:{title:x.name},
   contentDetails:{relatedPlaylists:{uploads:'playlist-'+x.channelId}},
  }))}
  if(endpoint==='playlistItems')throw Error('DO NOT REQUEST LATEST UPLOADS IN REPLAY')
  if(endpoint==='videos')return {items:params.id.split(',').filter((id,i)=>!(removeVideo&&id===CASES[0].videoId))
   .map(id=>{
    const item=CASES.find(x=>x.videoId===id)
    return{id,snippet:{channelId:changeChannel?SRC_B:item.channelId,
     channelTitle:'Publisher',categoryId:'30',
     title:'Iron Soldier (2011) [Action] [Sci-Fi] Ganzer Film auf Deutsch'},
     contentDetails:{duration:'PT1H35M'},
     status:{privacyStatus:'public'},
    }
   })}
  throw Error('Unexpected source endpoint '+endpoint)
 })
 const tmdb=vi.fn(async(endpoint,params)=>{
  if(endpoint==='/search/movie'){
   expect(params.query).toBe('Iron Soldier')
   return{results:[{id:246013}]}
  }
  if(endpoint==='/search/tv')return {results:[]}
  if(endpoint==='/movie/246013')return movie
  throw Error('Unexpected TMDB endpoint '+endpoint)
 })
 return{youtube,tmdb}
}
describe('YouTube G2 exact 125-ID reference replay for independent before/after',()=>{
 it('runs exact same 125 videos live with source provenance and matcher status delta',async()=>{
  const {youtube,tmdb}=api()
  const result=await runYoutubeLargeAudit({youtube,tmdb,
   sources,priorIds:[],replayCases:CASES,replayRunId:'39754462653',
   now:()=> '2026-10-22T09:50:00.000Z',
  })
  expect(result.summary.replayMode).toBe(true)
  expect(result.rows).toHaveLength(125)
  expect(result.rows.map(x=>x.video.videoId)).toEqual(CASES.map(x=>x.videoId))
  expect(result.rows[0].prepared.matchingTitle).toBe('Iron Soldier (2011)')
  expect(result.rows[0].prepared.queries[0]).toBe('Iron Soldier')
  expect(result.summary.comparison).toMatchObject({
   replayRunId:'39754462653',sourceCases:125,sameVideoIds:true,
   previousNoMovie:125,previousNoMovieNowHasCandidates:125,
  })
  expect(result.summary.comparison.bySource).toHaveLength(2)
  expect(result.summary.publisherChannelIds).toEqual([SRC_A,SRC_B])
  expect(result.summary.catalogWrites).toBe(0)
  expect(result.summary.firestoreWrites).toBe(0)
  expect(result.summary.publicationPermitted).toBe(false)
  expect(youtube.mock.calls.map(x=>x[0])).toEqual(['channels','videos','videos','videos'])
  expect(result.report).toContain('39754462653')
 })
 it('rejects duplicate, wrong publisher and missing video IDs before TMDB matching',async()=>{
  const {youtube,tmdb}=api()
  for(const invalid of [
   [...CASES.slice(0,124),CASES[0]],
   [...CASES.slice(0,124),{...CASES[124],channelId:'UCcccccccccccccccccccccc'}],
   CASES.slice(0,124),
  ]){
   await expect(runYoutubeLargeAudit({youtube,tmdb,sources,priorIds:[],
    replayCases:invalid})).rejects.toThrow('INVALID_125_VIDEO_REPLAY_MANIFEST')
  }
  expect(youtube).not.toHaveBeenCalled()
  expect(tmdb).not.toHaveBeenCalled()
 })
 it('rejects a changed channel and a removed live video, never quietly substitutes latest uploads',async()=>{
  for(const setup of [{changeChannel:true},{removeVideo:true}]){
   const {youtube,tmdb}=api(setup)
   await expect(runYoutubeLargeAudit({youtube,tmdb,sources,priorIds:[],
    replayCases:CASES})).rejects.toThrow(/REPLAY_(CHANNEL_CHANGED|VIDEO_REMOVED)/)
   expect(tmdb).not.toHaveBeenCalled()
   expect(youtube.mock.calls.some(x=>x[0]==='playlistItems')).toBe(false)
  }
 })
})
