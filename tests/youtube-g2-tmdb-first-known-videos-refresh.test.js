import {describe,it,expect,vi} from 'vitest'
import {TMDB_FIRST_GOLDEN} from '../scripts/youtube-g2-quality-golden.mjs'
import {
  refreshKnownTmdbFirstVideoCandidates,renderCurrentKnownReview,
} from '../scripts/youtube-g2-tmdb-first-known-videos-refresh.mjs'

const NOW='2026-10-24T15:00:00.000Z'
const status={single:'review-single-video-candidate',
  multiple:'review-multiple-video-editions',
  unresolved:'review-weak-or-unresolved-videos'}
function original(){
  const rows=TMDB_FIRST_GOLDEN.map(g=>({
    mediaType:'movie',tmdbId:g.tmdbId,title:'Historical Film '+g.tmdbId,
    year:2000,status:status[g.observedClass],
    videoCandidates:[{
      videoId:g.leadVideoId,strong:g.observedClass!=='unresolved',
      videoTitle:'Old unconfirmed candidate',channelTitle:'Older uploader',
    }],tmdbDeOfferTypes:['rent'],reviewedVideoId:null,
    directPlaybackRoute:null,publicationPermitted:false,
  }))
  return {
    summary:{
      mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',
      selectedMovies:25,processedMovies:25,
      historicalCohortMovies:25,historicalCohortAccountedFor:25,
      historicalPublicBadgeMissingIds:[],
      fullAccountInventory:'not-loaded',
      priorDeviceCandidatesApprovedAsOffers:0,
      calls:{youtubeSearches:50,youtubeVideoLookups:4,tmdbGetRequests:51},
      statusCounts:Object.fromEntries([...new Set(Object.values(status))]
        .map(s=>[s,rows.filter(r=>r.status===s).length])),
      publicationPermitted:false,verifiedDirectLinks:0,verifiedSeriesEpisodes:0,
      catalogWrites:0,firestoreWrites:0,providerWrites:0,
      badgeWrites:0,nightlyWrites:0,
    },rows,
  }
}
function index(){
  const entries=[
    ...TMDB_FIRST_GOLDEN.map(g=>({
      type:'movie',tmdbId:g.tmdbId,title:'Historical Film '+g.tmdbId,
      providerIds:['youtube'],providerOffers:[],
    })),
    ...Array.from({length:100},(_,i)=>({
      type:'movie',tmdbId:9000000+i,title:'Other Movie',providerIds:[],
    })),
  ]
  return {kind:'search-index',version:1,country:'DE',source:'published',
    generatedAt:NOW,count:entries.length,entries}
}
const youtubeVideo=id=>({
  id,snippet:{title:'Historical Film (2000)',
    channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',channelTitle:'Publisher',categoryId:'30'},
  contentDetails:{duration:'PT1H40M',regionRestriction:{allowed:['DE']}},
  status:{privacyStatus:'public'},
})
function services({missing=null,offerGone=null}={}){
  const tmdbGet=vi.fn(async(path)=>{
    if(path==='/watch/providers/movie')
      return {results:[{provider_name:'YouTube',provider_id:192},
        {provider_name:'Google TV',provider_id:193}]}
    if(path.endsWith('/watch/providers'))return {results:{DE:
      {rent:offerGone&&path.includes('/movie/'+offerGone+'/')
        ?[{provider_id:193}]:[{provider_id:192}]}}}
    const id=Number(path.split('/')[2])
    return {id,original_title:'Historical Film',
      title:'Historical Film',runtime:100,release_date:'2000-01-01'}
  })
  const youtubeApi=vi.fn(async(path,params)=>{
    if(path!=='videos')throw Error('Unwanted YouTube search/list request')
    return {items:params.id.split(',').filter(id=>id!==missing).map(youtubeVideo)}
  })
  return {tmdbGet,youtubeApi}
}
describe('current video metadata recheck from historical source IDs without YouTube search',()=>{
  it('uses exact preexisting IDs, 0 searches, and no automatic playback approvals',async()=>{
    const qa=original(),api=services()
    const r=await refreshKnownTmdbFirstVideoCandidates({
      archive:qa,publicIndex:index(),...api,now:NOW,
    })
    expect(r.summary).toMatchObject({
      originalMovieCohort:25,currentPublicBadges:25,
      currentTmdbDEYoutubeOffers:25,
      archivedCandidateEntries:25,archivedDistinctIds:25,
      uniqueKnownIdsRequested:25,videoIdsResolved:25,
      unavailableOrDeletedVideoIds:0,videoLookups:1,
      youtubeSearchCalls:0,tmdbReadCalls:51,
      independentlyVerifiedDEOffers:0,publishedDirectRoutes:0,
      firestoreWrites:0,catalogWrites:0,providerWrites:0,badgeWrites:0,
    })
    expect(api.youtubeApi.mock.calls.map(c=>c[0])).toEqual(['videos'])
    expect(api.youtubeApi.mock.calls[0][1].id.split(','))
      .toEqual(qa.rows.map(x=>x.videoCandidates[0].videoId))
    expect(r.rows).toHaveLength(25)
    expect(r.rows.every(x=>x.publicationPermitted===false
      &&x.playbackRoute===null&&x.directPlaybackRoute===null
      &&x.approvedDEOffer===false)).toBe(true)
    expect(renderCurrentKnownReview(r)).toContain('Aktuelle YouTube Suchaufrufe: **0**')
  })
  it('marks disappeared videos/badges and lost DE offers without replacing or inventing links',async()=>{
    const qa=original(),pub=index()
    pub.entries.find(x=>x.tmdbId===qa.rows[0].tmdbId).providerIds=[]
    const goneId=qa.rows[1].tmdbId
    const missing=qa.rows[2].videoCandidates[0].videoId
    const api=services({offerGone:goneId,missing})
    const r=await refreshKnownTmdbFirstVideoCandidates({
      archive:qa,publicIndex:pub,...api,now:NOW,
    })
    expect(r.summary.currentPublicBadges).toBe(24)
    expect(r.summary.currentTmdbDEYoutubeOffers).toBe(23)
    expect(r.summary.uniqueKnownIdsRequested).toBe(23)
    expect(r.summary.videoIdsResolved).toBe(22)
    expect(r.summary.unavailableOrDeletedVideoIds).toBe(1)
    expect(r.rows[0].status).toBe('no-current-public-youtube-badge')
    expect(r.rows[1].status).toBe('no-current-tmdb-de-youtube-offer')
    expect(r.rows[2].currentMetadataResolvedForArchivedCandidates).toBe(0)
    expect(r.rows[2].playbackRoute).toBeNull()
  })
  it('rejects unsafe archived source before calling TMDB or YouTube APIs',async()=>{
    const api=services()
    const qa=original()
    qa.summary.firestoreWrites=1
    await expect(refreshKnownTmdbFirstVideoCandidates({
      archive:qa,publicIndex:index(),...api,now:NOW,
    })).rejects.toThrow()
    expect(api.tmdbGet).not.toHaveBeenCalled()
    expect(api.youtubeApi).not.toHaveBeenCalled()
  })
  it('rejects stale public index and unexpected response video IDs',async()=>{
    const qa=original(),pub=index(),api=services()
    await expect(refreshKnownTmdbFirstVideoCandidates({
      archive:qa,publicIndex:{...pub,generatedAt:'2026-09-01T00:00:00.000Z'},
      ...api,now:NOW,
    })).rejects.toThrow('CURRENT_KNOWN_VIDEO_PUBLIC_SOURCE_INVALID')
    expect(api.tmdbGet).not.toHaveBeenCalled()
    const other=services()
    other.youtubeApi=vi.fn(async()=>({items:[youtubeVideo('Unk12345678')]}))
    await expect(refreshKnownTmdbFirstVideoCandidates({
      archive:qa,publicIndex:pub,...other,now:NOW,
    })).rejects.toThrow('CURRENT_KNOWN_VIDEO_RESPONSE_UNTRUSTED')
  })
})
