import {describe,it,expect,vi} from 'vitest'
import {
 normalizeYoutubeVideoCandidate,mapVerifiedYoutubeVideoToAvailability,
 buildYoutubeSourceEnvelope,
} from '../src/sources/adapters/youtubeContractMapper.js'
import {buildYoutubeTitleImportPreview} from '../src/sources/youtubeTitleImportPreview.js'
import {mergeSourceGenerations} from '../src/sources/sourceMerge.js'
import {runYoutubeLivePreflight,MAX_TMDB_CALLS} from '../scripts/youtube-adapter-live-preflight.mjs'

const AT='2026-10-22T07:00:00.000Z'
const ID1='KQeEIbN296U',ID2='7O9VkTxxTTI',ID3='KVyXVk0mePU'
const CHANNEL='UCGkHFrwE8KEuOHPVsIOskAg'
const source={channelId:CHANNEL,name:'Netzkino'}
function raw(id,title,minutes=100,options={}){
 const h=Math.floor(minutes/60),m=minutes%60
 return {
  id,
  snippet:{channelId:options.channelId||CHANNEL,channelTitle:'Netzkino',title,
   categoryId:'30',publishedAt:'2021-01-01T12:00:00Z'},
  contentDetails:{duration:'PT'+(h?h+'H':'')+m+'M',
   regionRestriction:options.regionRestriction},
  status:{privacyStatus:options.privacyStatus||'public'},
 }
}
const film=id=>({id,title:'War Story',original_title:'War Story',runtime:90,
 release_date:'2014-01-01',alternative_titles:{titles:[]},credits:{crew:[]}})

describe('YouTube canonical G2 source adapter, fail-closed publication contract',()=>{
 it('normalizes actual video metadata without confusing metadata with verified offers',()=>{
  const v=normalizeYoutubeVideoCandidate(raw(ID1,'War Story',90),{observedAt:AT})
  expect(v.videoId).toBe(ID1)
  expect(v.channelId).toBe(CHANNEL)
  expect(v.watchUrl).toBe('https://www.youtube.com/watch?v='+ID1)
  expect(v.screening.eligible).toBe(true)
  expect(v.deRegionSignal).toBe('unknown')
  expect(v.offerVerified).toBe(false)
  expect(v.workIdentityVerified).toBe(false)
 })
 it('rejects nonpublic / DE blocked / trailers / short videos in source screening',()=>{
  const bad=[
   [raw(ID1,'War Story',90,{privacyStatus:'private'}),'not-public'],
   [raw(ID1,'War Story',90,{regionRestriction:{blocked:['DE']}}),'DE-explicitly-excluded'],
   [raw(ID1,'War Story Trailer',90),'video-content-type-risk'],
   [raw(ID1,'War Story',12),'short-form-or-part'],
  ]
  for(const [input,why] of bad){
   const candidate=normalizeYoutubeVideoCandidate(input,{observedAt:AT})
   expect(candidate.screening).toEqual({eligible:false,rejectionReason:why})
  }
 })
 it('never promotes v1 leading match with no independent proof to a provider availability',()=>{
  const v=normalizeYoutubeVideoCandidate(raw(ID1,'War Story',90),{observedAt:AT})
  const y=mapVerifiedYoutubeVideoToAvailability(v,{mediaType:'movie',tmdbId:246013},{
   verifiedVideoId:ID1,workIdentityVerified:false,fullWorkOrValidCutVerified:false,
   dePlaybackVerified:false,offerTypeVerified:false,
   sourceUseAuthorized:false,accessType:'free',verifiedAt:AT,
  },{observedAt:AT})
  expect(y).toBeNull()
 })
 it('maps an independently verified and authorized exact-video offer into source-adapter schema, with expiration and exact route',()=>{
  const v=normalizeYoutubeVideoCandidate(raw(ID1,'War Story',90),{observedAt:AT})
  const verification={verifiedVideoId:ID1,workIdentityVerified:true,
   fullWorkOrValidCutVerified:true,dePlaybackVerified:true,offerTypeVerified:true,
   sourceUseAuthorized:true,accessType:'ads',verifiedAt:AT,
   workEvidence:'independent-film-inspection',offerEvidence:'DE-offer-and-playback-review'}
  const a=mapVerifiedYoutubeVideoToAvailability(v,{mediaType:'movie',tmdbId:246013},
   verification,{observedAt:AT})
  expect(a.titleRef).toEqual({mediaType:'movie',tmdbId:246013})
  expect(a.providerId).toBe('youtube')
  expect(a.accessType).toBe('ads')
  expect(a.playbackRoutes[0]).toMatchObject({
   mode:'APP_DEEP_LINK',scope:'title',target:'https://www.youtube.com/watch?v='+ID1,
  })
  expect(a.sourceRefs[0]).toMatchObject({sourceId:'youtube',externalId:ID1})
  expect(new Date(a.validUntil).getTime()-new Date(AT).getTime()).toBe(30*86400000)
  const envelope=buildYoutubeSourceEnvelope([a],{generatedAt:AT,sourceGenerationId:'youtube:test'})
  expect(envelope.records).toHaveLength(1)
  const merged=mergeSourceGenerations({generations:[envelope]}, {now:Date.parse(AT)})
  expect(merged.availabilities).toHaveLength(1)
  expect(merged.availabilities[0].titleRef.tmdbId).toBe(246013)
 })
 it('does not confuse inferred same-length metadata with offer type, and rejects stale verification',()=>{
  const v=normalizeYoutubeVideoCandidate(raw(ID1,'War Story',90),{observedAt:AT})
  const positive={verifiedVideoId:ID1,workIdentityVerified:true,
   fullWorkOrValidCutVerified:true,dePlaybackVerified:true,offerTypeVerified:true,
   sourceUseAuthorized:true,accessType:'free',verifiedAt:'2026-01-01T00:00:00Z'}
  expect(mapVerifiedYoutubeVideoToAvailability(v,{mediaType:'movie',tmdbId:246013},positive,{observedAt:AT})).toBeNull()
  expect(mapVerifiedYoutubeVideoToAvailability(v,{mediaType:'movie',tmdbId:246013},
   {...positive,verifiedAt:AT,accessType:'catalog'},{observedAt:AT})).toBeNull()
 })
})
describe('canonical existing versus new TMDB title import *preview*',()=>{
 const video=id=>normalizeYoutubeVideoCandidate(raw(id,'War Story',90),{observedAt:AT})
 const verdict=id=>({status:'review-leading-film-hypothesis',
   topCandidates:[{tmdbId:id,score:40}],confirmedFilm:false,confirmedOffer:false})
 it('distinguishes existing title enrichment and missing title candidate only with REAL catalog input',()=>{
  const rows=[{video:video(ID1),verdict:verdict(246013)},
   {video:video(ID2),verdict:verdict(10086)}]
  const p=buildYoutubeTitleImportPreview(rows,{
   knownTitleRefs:[{mediaType:'movie',tmdbId:246013}],reportGeneratedAt:AT,
  })
  expect(p.counts.matchedExisting).toBe(1)
  expect(p.counts.proposedNew).toBe(1)
  expect(p.candidates.map(x=>x.disposition)).toEqual([
   'preview-enrich-existing','preview-new-title-candidate'])
  expect(p.publicationPermitted).toBe(false)
  expect(p.catalogWrites).toBe(0)
  expect(p.candidates.every(x=>!x.accepted&&!x.toPublish&&!x.offerType)).toBe(true)
 })
 it('never calls an unknown catalog empty or silently creates new titles',()=>{
  const p=buildYoutubeTitleImportPreview([{video:video(ID1),verdict:verdict(246013)}],{
   reportGeneratedAt:AT,
  })
  expect(p.catalogStatus).toBe('not-loaded')
  expect(p.counts.catalogUnknown).toBe(1)
  expect(p.counts.proposedNew).toBe(0)
 })
 it('deduplicates VIDEO IDs but never pretends video count is unique movie work count',()=>{
  const p=buildYoutubeTitleImportPreview([
   {video:video(ID1),verdict:verdict(246013)},
   {video:video(ID1),verdict:verdict(246013)},
   {video:video(ID2),verdict:verdict(246013)},
  ],{knownTitleRefs:[],reportGeneratedAt:AT})
  expect(p.counts.seen).toBe(3)
  expect(p.counts.duplicateIds).toBe(1)
  expect(p.counts.proposedNew).toBe(2)
  expect(p.counts.potentialTitles).toBe(1)
 })
})
describe('one-publisher real-API-style G2 live preflight with injected mock APIs',()=>{
 function callbacks({wrongChannel=false}={}){
  const youtube=vi.fn(async(endpoint)=>{
   if(endpoint==='channels')return{items:[{
    id:CHANNEL,snippet:{title:'Netzkino'},
    contentDetails:{relatedPlaylists:{uploads:'UPLOADS123'}}}]}
   if(endpoint==='playlistItems')return{items:[
    {contentDetails:{videoId:ID1}},
    {contentDetails:{videoId:ID2}},
    {contentDetails:{videoId:ID3}},
   ]}
   if(endpoint==='videos')return{items:[
    raw(ID1,'War Story (Full Film)',90,{channelId:wrongChannel?'UCaaaaaaaaaaaaaaaaaaaaaa':CHANNEL}),
    raw(ID2,'A Movie Trailer',90),
    raw(ID3,'Game Compilation',90),
   ]}
   throw Error('Unexpected youtube endpoint '+endpoint)
  })
  const tmdb=vi.fn(async(path)=>{
   if(path==='/search/movie')return{results:[{id:246013}]}
   if(path==='/search/tv')return{results:[]}
   if(path==='/movie/246013')return film(246013)
   throw Error('Unexpected TMDB endpoint '+path)
  })
  return{youtube,tmdb}
 }
 it('reads only a single publisher, v1-matches eligible video, and never publishes to catalog',async()=>{
  const {youtube,tmdb}=callbacks()
  const report=await runYoutubeLivePreflight({youtube,tmdb,source,
   knownTitleRefs:[{mediaType:'movie',tmdbId:246013}],limit:10,now:()=>AT})
  expect(report.stats.youtubeCalls).toBe(3)
  expect(report.stats.tmdbCalls).toBe(3)
  expect(report.preview.catalogWrites).toBe(0)
  expect(report.preview.firestoreWrites).toBe(0)
  expect(report.preview.publicationPermitted).toBe(false)
  expect(report.rows).toHaveLength(3)
  expect(report.rows[0].verdict.topCandidates[0].tmdbId).toBe(246013)
  expect(report.preview.candidates[0].disposition).toBe('preview-enrich-existing')
  expect(report.preview.counts.screenedOut).toBe(2)
  expect(tmdb.mock.calls.every(x=>['/search/movie','/search/tv','/movie/246013'].includes(x[0]))).toBe(true)
  expect(report.report).toContain('NO production catalog')
 })
 it('hard-fails when a second publisher channel appears in this publisher report',async()=>{
  const {youtube,tmdb}=callbacks({wrongChannel:true})
  await expect(runYoutubeLivePreflight({youtube,tmdb,source,now:()=>AT}))
   .rejects.toThrow('Cross-channel video')
  expect(tmdb).not.toHaveBeenCalled()
 })
 it('never allows an unbounded or multi-publisher run',async()=>{
  const {youtube,tmdb}=callbacks()
  await expect(runYoutubeLivePreflight({youtube,tmdb,source,limit:21}))
   .rejects.toThrow(/Limit out of range/)
  expect(youtube).not.toHaveBeenCalled()
  expect(MAX_TMDB_CALLS).toBeLessThanOrEqual(100)
 })
})
