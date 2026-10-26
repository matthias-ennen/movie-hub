import {describe,it,expect,vi} from 'vitest'
import {
  selectGlobalCachedYoutubeResearch,recheckGlobalCachedYoutubeCandidates,
  MAX_REUSE_MOVIES,
  globalCachedReviewReport,
} from '../scripts/youtube-g2-global-known-no-search-live.mjs'
const now='2026-10-24T17:00:00.000Z'
const ids=Array.from({length:27},(_,i)=>101+i)
const videoId=id=>'Y'+String(id).padStart(10,'0')
function checkpoint(){
  return {
    kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
    createdAt:'2026-10-24T10:00:00Z',updatedAt:'2026-10-24T16:00:00Z',
    evidenceStatus:'candidate-only-not-independent-DE-offer',
    verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
    entries:ids.map(tmdbId=>({
      tmdbId,videoIds:[videoId(tmdbId)],
      provenance:[{kind:'published-editorial-playlist-hint',runId:40108251915}],
    })),
  }
}
function publicIndex(){
  const entries=[
    ...ids.map(tmdbId=>({type:'movie',tmdbId,
      title:'Film '+tmdbId,originalTitle:'Film '+tmdbId,
      year:2010,providerIds:tmdbId===127?[]:['youtube']})),
    ...Array.from({length:120},(_,i)=>({
      type:'movie',tmdbId:10000+i,title:'Other '+i,providerIds:['other'],
    })),
  ]
  return {kind:'search-index',version:1,source:'tmdb',country:'DE',
    generatedAt:'2026-10-24T16:00:00Z',count:entries.length,entries}
}
function services(){
  const calls=[]
  const tmdbGet=vi.fn(async path=>{
    calls.push(path)
    if(path==='/watch/providers/movie')return {
      results:[{provider_name:'YouTube',provider_id:192},
        {provider_name:'Google TV',provider_id:3}]}
    const tmdbId=Number(path.split('/')[2])
    if(path.endsWith('/watch/providers'))return {
      results:{DE:{buy:[{provider_id:tmdbId===102?3:192}]}}}
    return {id:tmdbId,title:'Film '+tmdbId,
      original_title:'Film '+tmdbId,release_date:'2010-01-01',
      runtime:100,alternative_titles:{titles:[]},credits:{crew:[]}}
  })
  const youtubeApi=vi.fn(async(endpoint,params)=>{
    if(endpoint!=='videos')throw Error('YouTube search must never happen')
    return {items:params.id.split(',').map(id=>({
      id,snippet:{title:'Film '+Number(id.slice(1))+' 2010 Ganzer Film',
        channelTitle:'Sample',channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',
        categoryId:'30',publishedAt:'2020-01-01T00:00:00Z'},
      contentDetails:{duration:'PT1H40M',regionRestriction:{allowed:['DE']}},
      status:{privacyStatus:'public'},
    }))}
  })
  return {tmdbGet,youtubeApi,calls}
}
describe('global cached TMDB-first real data review without YouTube search.list',()=>{
  it('enumerates every stored global film, accounts for vanished badges, splits at 25',()=>{
    const plan=selectGlobalCachedYoutubeResearch({
      checkpoint:checkpoint(),publicIndex:publicIndex(),now})
    expect(plan).toMatchObject({
      storedGlobalFilmIds:27,currentPublicBadgeFilmIds:26,
      noCurrentPublicBadgeFilmIds:1,noCurrentPublicBadgeTmdbIds:[127],
    })
    expect(plan.batchPlan.map(x=>x.length)).toEqual([25,1])
    expect(plan.selection).toHaveLength(26)
    expect(plan.knownVideoCandidatesByTmdbId.size).toBe(27)
  })
  it('preserves the trusted 250-film baseline as the private checkpoint exceeds 250',()=>{
    expect(MAX_REUSE_MOVIES).toBe(250)
    const c=checkpoint()
    c.entries=Array.from({length:250},(_,i)=>({
      tmdbId:3000+i,videoIds:[videoId(3000+i)],
      provenance:[{kind:'published-editorial-playlist-hint',runId:40108251915}],
    }))
    const p=publicIndex()
    p.entries=c.entries.map(r=>({type:'movie',tmdbId:r.tmdbId,
      title:'Known '+r.tmdbId,year:2010,providerIds:['youtube']}))
    p.count=p.entries.length
    const planned=selectGlobalCachedYoutubeResearch({
      checkpoint:c,publicIndex:p,now,
    })
    expect(planned.storedGlobalFilmIds).toBe(250)
    expect(planned.batchPlan).toHaveLength(10)
    expect(planned.batchPlan.every(chunk=>chunk.length===25)).toBe(true)
    // A newly discovered film with smaller TMDB ID cannot displace the
    // previously curated baseline just because the checkpoint grew.
    c.entries.push({tmdbId:100,videoIds:['Z1234567890'],
      provenance:[{kind:'successful-readonly-full-catalog-batch',runId:40108251915}]})
    c.entries.sort((a,b)=>a.tmdbId-b.tmdbId)
    const continued=selectGlobalCachedYoutubeResearch({
      checkpoint:c,publicIndex:p,now,
    })
    expect(continued).toMatchObject({
      sharedCheckpointCandidateFilms:251,deferredCandidateFilms:1,
      storedGlobalFilmIds:250,reviewCoverage:'bounded-baseline-partial',
    })
    expect(continued.selection).toHaveLength(250)
    expect(continued.selection).not.toContain(100)
    expect(continued.knownVideoCandidatesByTmdbId.size).toBe(250)
  })
  it('quarantines an exact video collision with a film outside the daily cohort',()=>{
    const c=checkpoint(),p=publicIndex()
    c.entries=Array.from({length:250},(_,i)=>({
      tmdbId:3000+i,videoIds:[videoId(3000+i)],
      provenance:[{kind:'original-trusted-25-film-archive',runId:40108251915}],
    }))
    c.entries.push({
      tmdbId:9000,videoIds:[videoId(3000)],
      provenance:[{kind:'successful-readonly-full-catalog-batch',runId:40108251915}],
    })
    p.entries=c.entries.map(e=>({type:'movie',tmdbId:e.tmdbId,
      title:'Known '+e.tmdbId,providerIds:['youtube']}))
    p.count=p.entries.length
    const plan=selectGlobalCachedYoutubeResearch({checkpoint:c,publicIndex:p,now})
    expect(plan).toMatchObject({
      sharedCheckpointCandidateFilms:251,storedGlobalFilmIds:249,
      deferredCandidateFilms:2,crossTitleCollisionFilms:2,
      currentPublicBadgeFilmIds:249,reviewCoverage:'bounded-baseline-partial',
    })
    expect(plan.selection).not.toContain(3000)
    expect(plan.selection).not.toContain(9000)
    expect(plan.knownVideoCandidatesByTmdbId.has(3000)).toBe(false)
  })
  it('bounds a validated 3,500-film checkpoint without stale-video mass processing',()=>{
    const c=checkpoint(),p=publicIndex()
    c.entries=Array.from({length:3500},(_,i)=>({
      tmdbId:i+10,videoIds:[videoId(i+10)],
      provenance:[{kind:i<247?'original-trusted-25-film-archive'
        :'successful-readonly-full-catalog-batch',runId:40108251915}],
    }))
    p.entries=c.entries.map(e=>({type:'movie',tmdbId:e.tmdbId,
      title:'Known '+e.tmdbId,providerIds:['youtube']}))
    p.count=p.entries.length
    const plan=selectGlobalCachedYoutubeResearch({checkpoint:c,publicIndex:p,now})
    expect(plan).toMatchObject({
      sharedCheckpointCandidateFilms:3500,storedGlobalFilmIds:250,
      deferredCandidateFilms:3250,reviewCoverage:'bounded-baseline-partial',
      currentPublicBadgeFilmIds:250,
    })
    expect(plan.batchPlan).toHaveLength(10)
    expect(plan.batchPlan.every(group=>group.length===25)).toBe(true)
    expect(plan.knownVideoCandidatesByTmdbId.size).toBe(250)
    expect(plan.selection).toContain(10)
    expect(plan.selection).toContain(256)
    expect(plan.selection).not.toContain(257)
  })
  it('never lets the remaining unreviewed checkpoint impersonate a verified source',async()=>{
    const c=checkpoint(),p=publicIndex(),s=services()
    c.entries.push({
      tmdbId:9999999,videoIds:['Z1234567890'],
      provenance:[{kind:'successful-readonly-full-catalog-batch',runId:40108251915}],
    })
    const outcome=await recheckGlobalCachedYoutubeCandidates({
      checkpoint:c,publicIndex:p,now,...s,
    })
    expect(outcome.summary).toMatchObject({
      globalStoredCandidateFilms:28,sharedCheckpointCandidateFilms:28,
      deferredCandidateFilms:0,reviewCoverage:'complete',
      independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
      searchCalls:0,
    })
    expect(outcome.rows).toHaveLength(26)
    expect(outcome.summary.globalStoredCandidateFilms
      +outcome.summary.deferredCandidateFilms)
      .toBe(outcome.summary.sharedCheckpointCandidateFilms)
  })
  it('rechecks 26 film identities in 2 batches using videos.list; zero searches, zero offers',async()=>{
    const s=services()
    const outcome=await recheckGlobalCachedYoutubeCandidates({
      checkpoint:checkpoint(),publicIndex:publicIndex(),now,...s,
    })
    expect(outcome.summary).toMatchObject({
      globalStoredCandidateFilms:27,currentBadgeCachedFilms:26,
      cachedFilmsWithoutCurrentPublicBadge:1,
      filmsWithCurrentTmdbDeYoutubeOffers:25,
      filmsWithoutCurrentTmdbDeYoutubeOffers:1,
      rowsChecked:26,searchCalls:0,
      reusedVideoCandidateIds:25,avoidedYoutubeSearchCalls:50,
      videosListBatches:2,independentlyVerifiedDeOffers:0,
      publishedDirectRoutes:0,firebaseWrites:0,catalogWrites:0,
      badgeWrites:0,publicationPermitted:false,
    })
    expect(s.youtubeApi.mock.calls.map(c=>c[0])).toEqual(['videos','videos'])
    expect(outcome.rows).toHaveLength(26)
    expect(new Set(outcome.rows.map(x=>x.tmdbId)).size).toBe(26)
    expect(outcome.rows.find(r=>r.tmdbId===102).status)
      .toBe('no-current-tmdb-de-youtube-offer')
    expect(outcome.noCurrentPublicBadgeTmdbIds).toEqual([127])
    expect(outcome.rows.every(x=>x.directPlaybackRoute===null
      &&x.publicationPermitted===false&&x.reviewedVideoId===null)).toBe(true)
    expect(globalCachedReviewReport(outcome)).toContain('search.list Anfragen: **0**')
  })
  it('rejects stale index, forged checkpoint approval, wrong movie and any unapproved API call',async()=>{
    const c=checkpoint(),p=publicIndex(),s=services()
    expect(()=>selectGlobalCachedYoutubeResearch({
      checkpoint:{...c,approvedDirectRoutes:1},publicIndex:p,now,
    })).toThrow()
    expect(()=>selectGlobalCachedYoutubeResearch({
      checkpoint:c,publicIndex:{...p,source:'fallback'},now,
    })).toThrow()
    expect(()=>selectGlobalCachedYoutubeResearch({
      checkpoint:c,publicIndex:{...p,generatedAt:'2026-09-01T12:00:00Z'},now,
    })).toThrow()
    const broken=services()
    broken.tmdbGet=vi.fn(async(path,...rest)=>{
      const resp=await s.tmdbGet(path,...rest)
      if(path==='/movie/101')return {...resp,id:999}
      return resp
    })
    await expect(recheckGlobalCachedYoutubeCandidates({
      checkpoint:c,publicIndex:p,now,...broken,
    })).rejects.toThrow('TMDB_TITLE_ID_MISMATCH')
    expect(broken.youtubeApi).not.toHaveBeenCalled()
    expect(s.youtubeApi).not.toHaveBeenCalled()
  })
})
