import {describe,it,expect,vi} from 'vitest'
import {
  selectGlobalCachedYoutubeResearch,recheckGlobalCachedYoutubeCandidates,
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
