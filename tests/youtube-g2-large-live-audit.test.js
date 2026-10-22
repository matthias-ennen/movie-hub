import {describe,it,expect,vi} from 'vitest'
import {runYoutubeLargeAudit,TARGET,MAX_TMDB,MAX_YOUTUBE,MAX_PAGES} from '../scripts/youtube-g2-large-live-audit.mjs'
import {previouslyReviewedYouTubeIds,knownG1VideoIds} from '../scripts/youtube-g2-prior-video-ids.mjs'
import {NETZKINO_BASELINE_20_VIDEO_IDS} from '../scripts/youtube-adapter-live-preflight.mjs'

const CHANNEL='UCGkHFrwE8KEuOHPVsIOskAg'
const NOW='2026-10-22T08:00:00.000Z'
const all=Array.from({length:175},(_,i)=>'N'+String(i).padStart(10,'0'))
const video=id=>({
 id,snippet:{channelId:CHANNEL,channelTitle:'Netzkino',
  title:'War Story (Ganzer Film in voller Länge)',categoryId:'30',
  publishedAt:'2024-01-01T00:00:00Z'},
 contentDetails:{duration:'PT1H35M'},
 status:{privacyStatus:'public'},
})
const movie={id:246013,title:'War Story',original_title:'War Story',
 release_date:'2014-01-01',runtime:95,
 alternative_titles:{titles:[]},credits:{crew:[]}}
function createApi({shortIndices=[],wrongChannel=false,includeOld=false,available=all.length}={}){
 let n=0
 const ids=(includeOld
  ?[...previouslyReviewedYouTubeIds.slice(0,5),...all]:all).slice(0,available)
 const youtube=vi.fn(async(p,q)=>{
  if(p==='channels')return{items:[{
   id:CHANNEL,snippet:{title:'Netzkino'},
   contentDetails:{relatedPlaylists:{uploads:'UPLOADS_NETZKINO'}},
  }]}
  if(p==='playlistItems'){
   const offset=q.pageToken?Number(q.pageToken):0
   const part=ids.slice(offset,offset+50)
   return{items:part.map(videoId=>({contentDetails:{videoId}})),
    ...(offset+50<ids.length?{nextPageToken:String(offset+50)}:{})}
  }
  if(p==='videos')return{items:q.id.split(',').map(id=>{
   const v=video(id)
   if(shortIndices.includes(n++))v.contentDetails.duration='PT30S'
   if(wrongChannel)v.snippet.channelId='UCaaaaaaaaaaaaaaaaaaaaaa'
   return v
  })}
  throw Error('Unexpected endpoint '+p)
 })
 const tmdb=vi.fn(async(p)=>{
  if(p==='/search/movie')return{results:[{id:246013}]}
  if(p==='/search/tv')return{results:[]}
  if(p==='/movie/246013')return movie
  throw Error('Unexpected TMDB path '+p)
 })
 return {youtube,tmdb}
}
describe('YouTube G2 >100 NEW live video audit contract',()=>{
 it('has frozen 100+20 historical IDs, excludes duplicates and keeps frozen matcher v1',()=>{
  expect(knownG1VideoIds).toHaveLength(100)
  expect(NETZKINO_BASELINE_20_VIDEO_IDS).toHaveLength(20)
  expect(previouslyReviewedYouTubeIds.length).toBeGreaterThanOrEqual(100)
  expect(TARGET).toBe(125)
  expect(MAX_TMDB).toBeLessThanOrEqual(800)
  expect(MAX_YOUTUBE).toBeLessThanOrEqual(26)
  expect(MAX_PAGES).toBeLessThanOrEqual(12)
 })
 it('fetches MORE THAN 100 unique NEW screened video IDs from exactly one channel',async()=>{
  const {youtube,tmdb}=createApi({includeOld:true})
  const result=await runYoutubeLargeAudit({youtube,tmdb,
   source:{channelId:CHANNEL},target:125,now:()=>NOW,
  })
  expect(result.summary.newEligibleUniqueVideos).toBe(125)
  expect(result.rows).toHaveLength(125)
  expect(new Set(result.rows.map(x=>x.video.videoId)).size).toBe(125)
  expect(result.summary.previouslyKnownIdsExcluded).toBe(5)
  expect(result.summary.youtubeCalls).toBeLessThanOrEqual(MAX_YOUTUBE)
  expect(result.summary.tmdbCalls).toBeLessThanOrEqual(MAX_TMDB)
  expect(result.summary.firestoreWrites).toBe(0)
  expect(result.summary.catalogWrites).toBe(0)
  expect(result.summary.badgeWrites).toBe(0)
  expect(result.summary.publicationPermitted).toBe(false)
  expect(result.summary.catalogStatus).toBe('not-loaded')
  expect(result.summary.independentlyConfirmedMovies).toBe(0)
  expect(result.summary.verifiedDEOffers).toBe(0)
  expect(result.rows[0].prepared.matchingTitle).toBe('War Story')
  expect(result.rows[0].verdict.topCandidates[0].tmdbId).toBe(246013)
  expect(youtube.mock.calls.every(([name])=>['channels','playlistItems','videos'].includes(name))).toBe(true)
  expect(tmdb.mock.calls.every(([name])=>['/search/movie','/search/tv','/movie/246013'].includes(name))).toBe(true)
  expect(result.report).toContain('125/125')
 })
 it('fails closed on fewer than 101 suitable new IDs, without TMDB queries or writes',async()=>{
  const {youtube,tmdb}=createApi({available:85})
  await expect(runYoutubeLargeAudit({youtube,tmdb,source:{channelId:CHANNEL},
   target:125,now:()=>NOW})).rejects.toThrow(/INSUFFICIENT_NEW_ELIGIBLE_IDS/)
  expect(tmdb).not.toHaveBeenCalled()
 })
 it('rejects a video belonging to another publisher before matching and import',async()=>{
  const {youtube,tmdb}=createApi({wrongChannel:true})
  await expect(runYoutubeLargeAudit({youtube,tmdb,source:{channelId:CHANNEL},
   target:125,now:()=>NOW})).rejects.toThrow(/CROSS_CHANNEL_SOURCE_ABORT/)
  expect(tmdb).not.toHaveBeenCalled()
 })
 it('rejects small targets, invalid channel IDs and invalid previous ID manifests before external requests',async()=>{
  const {youtube,tmdb}=createApi()
  for(const opt of [
   {target:100},{target:126},{maxPages:13},{priorIds:['not-youtube-id']},
   {source:{channelId:'YOUTUBE'}}
  ]){
   await expect(runYoutubeLargeAudit({youtube,tmdb,now:()=>NOW,...opt})).rejects.toThrow()
  }
  expect(youtube).not.toHaveBeenCalled()
  expect(tmdb).not.toHaveBeenCalled()
 })
})
