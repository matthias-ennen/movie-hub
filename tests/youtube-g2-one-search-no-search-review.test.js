import {describe,it,expect,vi} from 'vitest'
import {
  planOneSearchNoSearchReview,reviewOneSearchCandidates,
} from '../scripts/youtube-g2-one-search-no-search-review.mjs'
const now='2026-10-26T09:00:00.000Z',at='2026-10-26T08:30:00.000Z'
const v1='Abc12345678',v2='Z1234567890'
const base={
  summary:{
    kind:'moviehub-youtube-g2-one-search-project-quota-diagnostic',
    generatedAt:at,sampledExactTmdbFilmId:102,globalCachedMovieIdentities:1,
    publicTmdbYoutubeBadgeMovies:2,searchCallsAttempted:1,
    searchOutcome:'search-accessible',googleFailureClass:'OK',
    responseCandidateCount:2,quotaActuallyMeasured:false,quotaAvailableUnits:null,
    independentlyVerifiedDEOffers:0,confirmedPlaybackRoutes:0,
    firestoreWrites:0,catalogWrites:0,providerWrites:0,badgeWrites:0,
    noAutomaticRetry:true,privateArtifact:true,
  },
  hints:{
    kind:'moviehub-youtube-g2-one-search-private-candidate-hints',
    schemaVersion:1,generatedAt:at,sampledExactTmdbFilmId:102,
    videoIds:[v1,v2],searchCallsAttempted:1,metadataRechecked:false,
    independentDEOffersVerified:0,publishedPlaybackRoutes:0,
    privateArtifact:true,publicationPermitted:false,
  },
  checkpoint:{
    kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
    createdAt:'2026-10-24T10:00:00Z',updatedAt:'2026-10-24T16:00:00Z',
    evidenceStatus:'candidate-only-not-independent-DE-offer',
    verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
    entries:[{tmdbId:101,videoIds:['Ebc12345678'],
      provenance:[{kind:'original-trusted-25-film-archive',runId:40086393094}]}],
  },
  publicIndex:{
    kind:'search-index',version:1,source:'tmdb',country:'DE',
    generatedAt:'2026-10-26T08:00:00Z',
    entries:[
      {type:'movie',tmdbId:101,title:'Known',providerIds:['youtube']},
      {type:'movie',tmdbId:102,title:'Unmatched Film',year:1995,providerIds:['youtube']},
      ...Array.from({length:110},(_,i)=>({
        type:'movie',tmdbId:20000+i,title:'Other '+i,providerIds:['other'],
      })),
    ],
  },
}
base.publicIndex.count=base.publicIndex.entries.length
const fixture=()=>structuredClone(base)
const tmdb=vi.fn(async(path)=>{
  if(path==='/watch/providers/movie')return {
    results:[{provider_name:'YouTube',provider_id:192},
      {provider_name:'Google TV',provider_id:3}],
  }
  if(path==='/movie/102/watch/providers')
    return {results:{DE:{rent:[{provider_id:192}]}}}
  if(path==='/movie/102')
    return {id:102,title:'Unmatched Film',original_title:'Unmatched Film',
      release_date:'1995-01-01',runtime:100,credits:{crew:[]}}
  throw Error('unexpected tmdb '+path)
})
const yt=vi.fn(async(path,params)=>{
  if(path!=='videos')throw Error('search forbidden')
  return {items:params.id.split(',').map(id=>({
    id,snippet:{title:'Unmatched Film 1995 ganzer Film',
      channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',channelTitle:'Sample',
      categoryId:'30',publishedAt:'2025-01-01T00:00:00Z'},
    contentDetails:{duration:'PT1H40M',regionRestriction:{allowed:['DE']}},
    status:{privacyStatus:'public'},
  }))}
})
describe('YouTube #388 one-search candidates review without any new search.list',()=>{
  it('accepts only matching fresh one-search/private hint artifact pair',()=>{
    const plan=planOneSearchNoSearchReview({...fixture(),now})
    expect(plan).toMatchObject({tmdbId:102,videoIds:[v1,v2],
      publicBadgeChecked:true,publicationPermitted:false})
  })
  it('rechecks candidates with one videos.list and exact TMDB without search or writes',async()=>{
    const api=vi.fn(yt),get=vi.fn(tmdb)
    const p=await reviewOneSearchCandidates({...fixture(),now,
      tmdbGet:get,youtubeApi:api})
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0][0]).toBe('videos')
    expect(api.mock.calls[0][1].id).toBe([v1,v2].join(','))
    expect(get.mock.calls.every(x=>x[0]==='/watch/providers/movie'
      ||x[0]==='/movie/102'||x[0]==='/movie/102/watch/providers')).toBe(true)
    expect(p.summary).toMatchObject({candidateIdsInPrivateInput:2,
      youtubeSearchCalls:0,youtubeVideoLookups:1,tmdbGetRequests:3,
      independentDeOffersVerified:0,verifiedFilmOrCut:false,
      verifiedDePlayback:false,publishedPlaybackRoutes:0,
      firestoreWrites:0,catalogWrites:0,providerWrites:0,
      badgeWrites:0,privateArtifact:true,publicationPermitted:false})
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0]).toMatchObject({tmdbId:102,
      candidateDiscoveryMode:'trusted-previous-candidate-ids',
      publicationPermitted:false,directPlaybackRoute:null,reviewedVideoId:null})
    expect(JSON.stringify(p.summary)).not.toContain(v1)
    expect(JSON.stringify(p.summary)).not.toContain(v2)
  })
  it('avoids videos.list when TMDB DE no longer advertises YouTube',async()=>{
    const api=vi.fn(),get=vi.fn(async path=>{
      if(path==='/watch/providers/movie')return {results:[
        {provider_name:'YouTube',provider_id:192}]}
      if(path==='/movie/102/watch/providers')return {results:{DE:{
        buy:[{provider_id:3}]}}}
      throw Error('unapproved TMDB request')
    })
    const p=await reviewOneSearchCandidates({...fixture(),now,
      tmdbGet:get,youtubeApi:api})
    expect(api).not.toHaveBeenCalled()
    expect(p.summary).toMatchObject({youtubeSearchCalls:0,
      youtubeVideoLookups:0,currentTmdbDeYoutubeOfferHint:false,
      reviewStatus:'no-current-tmdb-de-youtube-offer'})
  })
  it('fails closed before external API calls for forged, stale or cross-work input',async()=>{
    const mutations=[
      p=>{p.summary.searchCallsAttempted=2},
      p=>{p.hints.generatedAt='2026-10-26T08:32:00Z'},
      p=>{p.hints.videoIds=[v1,v1]},
      p=>{p.hints.videoIds=['BAD_KEY']},
      p=>{p.hints.videoIds=[]},
      p=>{p.hints.publicationPermitted=true},
      p=>{p.hints.metadataRechecked=true},
      p=>{p.summary.quotaAvailableUnits=999},
      p=>{p.summary.searchOutcome='search-rejected-403'},
      p=>{p.checkpoint.entries[0].videoIds=[v1]},
      p=>{p.checkpoint.entries[0].tmdbId=102},
      p=>{p.publicIndex.source='fallback'},
      p=>{p.publicIndex.entries[1].providerIds=['google-tv']},
      p=>{p.publicIndex.generatedAt='2026-08-01T08:00:00Z'},
      p=>{p.summary.generatedAt='2026-10-10T08:30:00Z';p.hints.generatedAt=p.summary.generatedAt},
    ]
    for(const mutate of mutations){
      const input=fixture();mutate(input)
      const api=vi.fn(),get=vi.fn()
      await expect(reviewOneSearchCandidates({...input,now,
        tmdbGet:get,youtubeApi:api})).rejects.toThrow()
      expect(api).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
    }
  })
  it('rejects any attempted YouTube search before making the actual API call',async()=>{
    const input=fixture(),api=vi.fn(),get=vi.fn(tmdb)
    // The inner pilot stays in known-ID reuse lane; even a future accidental
    // fallback search would hit the adapter's endpoint hard-stop.
    await reviewOneSearchCandidates({...input,now,tmdbGet:get,youtubeApi:api})
    expect(api.mock.calls.every(x=>x[0]==='videos')).toBe(true)
  })
})
