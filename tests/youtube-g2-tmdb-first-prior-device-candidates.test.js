import {describe,it,expect} from 'vitest'
import {
  TMDB_FIRST_KNOWN_DEVICE_CANDIDATES,
  TMDB_FIRST_PRIOR_DEVICE_CANDIDATE_KIND,
  planTmdbFirstPriorDeviceCandidates,
} from '../scripts/youtube-g2-tmdb-first-prior-device-candidates.mjs'
import {runTmdbFirstLinkPilot} from '../scripts/youtube-g2-tmdb-first-link-pilot.mjs'

const observedAt='2026-10-24T09:40:00.000Z'
const seed={mediaType:'movie',tmdbId:9479,title:'Nightmare Before Christmas',year:1993}
const deviceId='nJf67zNZhoc'
const evidence={tmdbId:9479,videoId:deviceId,
  evidenceKind:TMDB_FIRST_PRIOR_DEVICE_CANDIDATE_KIND,
  independentlyVerifiedDEOffer:false}
const publicIndex={
  kind:'search-index',version:1,source:'tmdb',country:'DE',
  generatedAt:'2026-10-24T09:00:00.000Z',count:150,
  entries:[{type:'movie',tmdbId:9479,title:seed.title,year:1993,providerIds:['youtube']},
    ...Array.from({length:149},(_,i)=>({
      type:'movie',tmdbId:100000+i,title:'Unrelated '+i,year:2020,
      providerIds:['prime'],
    }))],
}
const correctMovie={id:9479,title:seed.title,original_title:'The Nightmare Before Christmas',
  runtime:76,release_date:'1993-10-09',alternative_titles:{titles:[]},
  credits:{crew:[]},external_ids:{}}
const movieVideo={id:deviceId,
  snippet:{title:'The Nightmare Before Christmas (1993) Full Movie',
    channelId:'UCexample',channelTitle:'YouTube Movies',
    categoryId:'30',publishedAt:'2020-10-01T00:00:00Z'},
  contentDetails:{duration:'PT1H16M',regionRestriction:{allowed:['DE']}},
  status:{privacyStatus:'public'},
}
const tmdbGet=async path=>{
  if(path==='/watch/providers/movie')return {results:[{provider_name:'YouTube',provider_id:192}]}
  if(path==='/movie/9479/watch/providers')
    return {results:{DE:{rent:[{provider_id:192}]}}}
  if(path==='/movie/9479')return correctMovie
  throw Error('Unexpected TMDB read '+path)
}

describe('TMDB-first historical device candidates: search miss recovery, not availability approval',()=>{
  it('includes the 25-pilot known search miss and both previously user-tested films',()=>{
    expect(TMDB_FIRST_KNOWN_DEVICE_CANDIDATES).toHaveLength(3)
    expect(TMDB_FIRST_KNOWN_DEVICE_CANDIDATES.map(c=>c.tmdbId).sort((a,b)=>a-b))
      .toEqual([238,9479,872585])
    expect(TMDB_FIRST_KNOWN_DEVICE_CANDIDATES.find(c=>c.tmdbId===9479).videoId)
      .toBe(deviceId)
    expect(TMDB_FIRST_KNOWN_DEVICE_CANDIDATES.every(c=>
      c.independentlyVerifiedDEOffer===false)).toBe(true)
  })
  it('preserves exact TMDB identity and never imports candidates for unselected works',()=>{
    const result=planTmdbFirstPriorDeviceCandidates([seed])
    expect([...result]).toEqual([[9479,deviceId]])
    expect([...planTmdbFirstPriorDeviceCandidates([
      {mediaType:'movie',tmdbId:999,year:2020},
    ])]).toEqual([])
  })
  it('recovers an exact known video absent from BOTH searches through videos.list only',async()=>{
    const log=[]
    const youtubeApi=async(path,params)=>{
      log.push({path,params})
      if(path==='search')return {items:[]}
      if(path==='videos')return {items:[movieVideo]}
      throw Error('Unexpected YouTube API '+path)
    }
    const result=await runTmdbFirstLinkPilot({
      publicIndex,seedRefs:[{mediaType:'movie',tmdbId:9479}],limit:1,
      tmdbGet,youtubeApi,now:()=>observedAt,
    })
    expect(result.summary.calls).toEqual({
      youtubeSearches:2,youtubeVideoLookups:1,tmdbGetRequests:3,
    })
    expect(result.summary).toMatchObject({
      priorDeviceCandidatesResearched:1,
      priorDeviceCandidatesMissingFromSearch:1,
      priorDeviceCandidatesResolvedViaVideoDetails:1,
      priorDeviceCandidatesInTop10:1,
      priorDeviceCandidatesApprovedAsOffers:0,
      verifiedDirectLinks:0,publicationPermitted:false,
      catalogWrites:0,firestoreWrites:0,badgeWrites:0,
    })
    expect(result.rows[0].priorDeviceCandidate).toMatchObject({
      videoId:deviceId,returnedByCurrentSearch:false,
      currentVideoMetadataAvailable:true,
      inTop10RankedCandidates:true,
      offerOrPlaybackIndependentlyVerified:false,publicationPermitted:false,
    })
    expect(result.rows[0].videoCandidates.map(c=>c.videoId)).toContain(deviceId)
    expect(result.rows[0].directPlaybackRoute).toBeNull()
    expect(log.map(x=>x.path)).toEqual(['search','search','videos'])
    expect(log.at(-1).params.id).toBe(deviceId)
  })
  it('does not fabricate a link when the formerly observed ID is now removed, private or blocked',async()=>{
    for(const videos of [[],[{...movieVideo,status:{privacyStatus:'private'}}],
      [{...movieVideo,contentDetails:{duration:'PT1H16M',regionRestriction:{blocked:['DE']}}}]]){
      const result=await runTmdbFirstLinkPilot({
        publicIndex,seedRefs:[{mediaType:'movie',tmdbId:9479}],limit:1,
        tmdbGet,now:()=>observedAt,
        youtubeApi:async path=>path==='search'?{items:[]}:{items:videos},
      })
      expect(result.rows[0].directPlaybackRoute).toBeNull()
      expect(result.rows[0].videoCandidates).toHaveLength(0)
      expect(result.summary.verifiedDirectLinks).toBe(0)
      expect(result.rows[0].priorDeviceCandidate.currentVideoMetadataAvailable)
        .toBe(videos.length===1)
      expect(result.rows[0].priorDeviceCandidate.inTop10RankedCandidates).toBe(false)
    }
  })
  it('is read-only even if the ID is returned from normal search too',async()=>{
    const result=await runTmdbFirstLinkPilot({
      publicIndex,seedRefs:[{mediaType:'movie',tmdbId:9479}],limit:1,
      tmdbGet,now:()=>observedAt,
      youtubeApi:async path=>path==='search'
        ?{items:[{id:{videoId:deviceId}}]}:{items:[movieVideo]},
    })
    expect(result.summary.calls.youtubeSearches).toBe(2)
    expect(result.summary.calls.youtubeVideoLookups).toBe(1)
    expect(result.rows[0].priorDeviceCandidate.returnedByCurrentSearch).toBe(true)
    expect(result.rows[0].videoCandidates.filter(x=>x.videoId===deviceId))
      .toHaveLength(1)
    expect(result.summary.priorDeviceCandidatesMissingFromSearch).toBe(0)
    expect(result.summary.priorDeviceCandidatesApprovedAsOffers).toBe(0)
  })
  it('fails closed on conflicting cross-work video IDs, forged approvals and series inputs',()=>{
    const a=[evidence,{...evidence,tmdbId:238}]
    expect(()=>planTmdbFirstPriorDeviceCandidates([
      seed,{mediaType:'movie',tmdbId:238},
    ],a)).toThrow('TMDB_FIRST_PRIOR_DEVICE_CONFLICTING_IDENTITIES')
    for(const c of [{...evidence,approved:true},
      {...evidence,independentlyVerifiedDEOffer:true},
      {...evidence,evidenceKind:'verified-offer'}]){
      expect(()=>planTmdbFirstPriorDeviceCandidates([seed],[c]))
        .toThrow('TMDB_FIRST_PRIOR_DEVICE_NOT_SAFE_FOR_REVIEW')
    }
    expect(()=>planTmdbFirstPriorDeviceCandidates([
      {mediaType:'series',tmdbId:9479},
    ],[evidence])).toThrow('TMDB_FIRST_PRIOR_DEVICE_SEED_INVALID')
  })
})
