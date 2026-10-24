import {describe,it,expect,vi} from 'vitest'
import {TMDB_FIRST_GOLDEN} from '../scripts/youtube-g2-quality-golden.mjs'
import {
  getTrustedTmdbFirstKnownCandidates,validateKnownCandidateMap,
  G2_KNOWN_CANDIDATE_SOURCE_RUN,
} from '../scripts/youtube-g2-known-candidate-reuse.mjs'
import {runTmdbFirstLinkPilot} from '../scripts/youtube-g2-tmdb-first-link-pilot.mjs'
import {createYoutubeFullCatalogResearchPlan} from '../scripts/youtube-g2-full-catalog-queue.mjs'

const at='2026-10-24T13:00:00.000Z'
const status={single:'review-single-video-candidate',
  multiple:'review-multiple-video-editions',
  unresolved:'review-weak-or-unresolved-videos'}
const archive=()=>({
  summary:{
    mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',
    historicalCohortMovies:25,historicalCohortAccountedFor:25,
    selectedMovies:25,processedMovies:25,fullAccountInventory:'not-loaded',
    historicalPublicBadgeMissingIds:[],
    statusCounts:{
      'review-single-video-candidate':13,
      'review-multiple-video-editions':6,
      'review-weak-or-unresolved-videos':6,
    },
    priorDeviceCandidatesApprovedAsOffers:0,
    calls:{youtubeSearches:50,youtubeVideoLookups:5,tmdbGetRequests:51},
    publicationPermitted:false,verifiedDirectLinks:0,verifiedSeriesEpisodes:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  },
  rows:TMDB_FIRST_GOLDEN.map(g=>({
    tmdbId:g.tmdbId,mediaType:'movie',title:'Film '+g.tmdbId,
    status:status[g.observedClass],tmdbDeOfferTypes:['rent'],
    videoCandidates:[{videoId:g.leadVideoId,strong:g.observedClass!=='unresolved',
      videoTitle:'Historical candidate',channelTitle:'Historic source'}],
    publicationPermitted:false,reviewedVideoId:null,directPlaybackRoute:null,
  })),
})
const knownId='Abc12345678'
const publicIndex={
  kind:'search-index',version:1,source:'tmdb',country:'DE',
  generatedAt:at,
  entries:[
    {type:'movie',tmdbId:111,title:'Iron Soldier',year:2011,providerIds:['youtube']},
    ...Array.from({length:110},(_,i)=>({
      type:'movie',tmdbId:90000+i,title:'Other '+i,providerIds:['other']})),
  ],
}
publicIndex.count=publicIndex.entries.length
const movie={id:111,title:'Iron Soldier',original_title:'Iron Soldier',
  runtime:95,release_date:'2011-01-01'}
const rawVideo={id:knownId,
  snippet:{title:'Iron Soldier (2011) Ganzer Film',channelTitle:'Example',
    channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',categoryId:'30'},
  contentDetails:{duration:'PT1H35M',regionRestriction:{allowed:['DE']}},
  status:{privacyStatus:'public'}}
const tmdbGet=vi.fn(async path=>path==='/watch/providers/movie'
  ?{results:[{provider_name:'YouTube',provider_id:192}]}
  :path==='/movie/111/watch/providers'
    ?{results:{DE:{rent:[{provider_id:192}]}}}
    :movie)
function inv(){
  const keys=['browse','personal-tmdb','profile-state','movie-hub','waipu','joyn']
  return {
    kind:'title-candidate-inventory',schemaVersion:2,
    identity:'media-type+tmdb-id',generatedAt:at,
    policy:{candidateSources:keys},
    sourceStats:Object.fromEntries(keys.map(x=>[x,{}])),
    candidates:[{key:'movie:111',type:'movie',tmdbId:111,sources:['browse']}],
    counts:{canonicalCandidates:1},
  }
}
describe('YouTube TMDB-first existing video candidates reuse, no search repeat',()=>{
  it('accepts only the authenticated original 25-film QA without granting any routes',()=>{
    const x=getTrustedTmdbFirstKnownCandidates(archive())
    expect(G2_KNOWN_CANDIDATE_SOURCE_RUN).toBe(40086393094)
    expect(x.size).toBe(25)
    expect(x.get(TMDB_FIRST_GOLDEN[0].tmdbId))
      .toEqual([TMDB_FIRST_GOLDEN[0].leadVideoId])
    expect([...x.values()].every(v=>v.length===1)).toBe(true)
    for(const mutation of [
      q=>{q.summary.firestoreWrites=1},
      q=>{q.summary.verifiedDirectLinks=1},
      q=>{q.rows[0].tmdbId=q.rows[1].tmdbId},
      q=>{q.rows[0].videoCandidates[0].videoId='bad'},
      q=>{q.rows[0].videoCandidates.push(q.rows[0].videoCandidates[0])},
    ]){
      const qa=archive();mutation(qa)
      expect(()=>getTrustedTmdbFirstKnownCandidates(qa)).toThrow()
    }
  })
  it('rejects arbitrary, duplicate and overlong video ID maps before any APIs',async()=>{
    for(const input of [
      [],new Map([['111',[knownId]]]),new Map([[111,[]]]),
      new Map([[111,['bad']]]),new Map([[111,[knownId,knownId]]]),
      new Map([[111,Array.from({length:11},(_,i)=>
        'A'+String(i).padStart(10,'0'))]]),
    ]){
      expect(()=>validateKnownCandidateMap(input)).toThrow()
      const api=vi.fn()
      await expect(runTmdbFirstLinkPilot({
        publicIndex,tmdbGet:api,youtubeApi:api,
        seedRefs:[{mediaType:'movie',tmdbId:111}],limit:10,
        knownVideoCandidatesByTmdbId:input,now:()=>at,
      })).rejects.toThrow()
      expect(api).not.toHaveBeenCalled()
    }
  })
  it('uses just videos.list on known work ID, re-scores current metadata and never approves',async()=>{
    const yt=vi.fn(async(path,params)=>{
      if(path!=='videos')throw Error('Redundant search.list request!')
      expect(params.id).toBe(knownId)
      return {items:[rawVideo]}
    })
    const result=await runTmdbFirstLinkPilot({
      publicIndex,tmdbGet,youtubeApi:yt,
      seedRefs:[{mediaType:'movie',tmdbId:111}],limit:10,
      knownVideoCandidatesByTmdbId:new Map([[111,[knownId]]]),
      now:()=>at,
    })
    expect(yt.mock.calls.map(x=>x[0])).toEqual(['videos'])
    expect(result.summary.calls.youtubeSearches).toBe(0)
    expect(result.summary.calls.youtubeVideoLookups).toBe(1)
    expect(result.summary).toMatchObject({
      knownCandidateReuseMovies:1,knownCandidateReusedVideoIds:1,
      avoidedYoutubeSearchCalls:2,verifiedDirectLinks:0,
      catalogWrites:0,firestoreWrites:0,badgeWrites:0,
    })
    expect(result.rows[0].candidateDiscoveryMode).toBe('trusted-previous-candidate-ids')
    expect(result.rows[0].videoCandidates[0].videoId).toBe(knownId)
    expect(result.rows[0].directPlaybackRoute).toBeNull()
    expect(result.rows[0].publicationPermitted).toBe(false)
  })
  it('still searches new work IDs, without granting offer routes',async()=>{
    const yt=vi.fn(async(path)=>{
      if(path==='search')return {items:[{id:{videoId:knownId}}]}
      return {items:[rawVideo]}
    })
    const result=await runTmdbFirstLinkPilot({
      publicIndex,tmdbGet,youtubeApi:yt,
      seedRefs:[{mediaType:'movie',tmdbId:111}],limit:10,
      knownVideoCandidatesByTmdbId:new Map(),now:()=>at,
    })
    expect(yt.mock.calls.map(x=>x[0])).toEqual(['search','search','videos'])
    expect(result.summary.calls.youtubeSearches).toBe(2)
    expect(result.summary.knownCandidateReuseMovies).toBe(0)
    expect(result.rows[0].candidateDiscoveryMode).toBe('new-search')
    expect(result.rows[0].directPlaybackRoute).toBeNull()
  })
  it('plans 0 paid searches for 1 known film; unknown films keep budget',()=>{
    const baseline=createYoutubeFullCatalogResearchPlan({
      inventory:inv(),publicIndex,now:at,offset:0,limit:1,
    })
    const reused=createYoutubeFullCatalogResearchPlan({
      inventory:inv(),publicIndex,now:at,offset:0,limit:1,
      knownVideoCandidatesByTmdbId:new Map([[111,[knownId]]]),
    })
    expect(baseline.batch).toMatchObject({
      youtubeSearchCallsPlanned:2,youtubeSearchCallsAvoided:0,
      knownCandidateReuseMovies:0,
    })
    expect(reused.batch).toMatchObject({
      knownCandidateReuseMovies:1,knownCandidateReusedVideoIds:1,
      youtubeSearchCallsAvoided:2,youtubeSearchCallsPlanned:0,
      estimatedYoutubeSearchQuotaUnits:0,
    })
    expect(reused.batch.queueIdentity).toBe(baseline.batch.queueIdentity)
    expect(reused.plan[0].playbackRoute).toBeNull()
    expect(reused.publicationPermitted).toBe(false)
  })
})
