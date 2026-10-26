import {describe,it,expect,vi} from 'vitest'
import {planFiveYoutubeSearches,researchFiveYouTubeMovies}
  from '../scripts/youtube-g2-five-search-public-batch.mjs'

const at='2026-10-26T11:00:00.000Z'
const index={
  kind:'search-index',version:1,source:'tmdb',country:'DE',
  generatedAt:'2026-10-26T10:00:00.000Z',
  entries:[
    {type:'movie',tmdbId:11,title:'Star Wars',providerIds:['youtube'],year:1977},
    {type:'movie',tmdbId:100,title:'Previously cached',providerIds:['youtube'],year:1975},
    ...[201,202,203,204,205,206].map(tmdbId=>({
      type:'movie',tmdbId,title:'Test Film '+tmdbId,
      originalTitle:'Test Film '+tmdbId,year:2000,
      providerIds:['youtube'],
    })),
    {type:'movie',tmdbId:10,title:'Google TV Only',providerIds:['google-tv']},
    ...Array.from({length:110},(_,i)=>({
      type:'movie',tmdbId:80000+i,title:'Else '+i,providerIds:['other'],
    })),
  ],
}
index.count=index.entries.length
const checkpoint={
  kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
  createdAt:'2026-10-24T10:00:00Z',updatedAt:'2026-10-24T16:00:00Z',
  evidenceStatus:'candidate-only-not-independent-DE-offer',
  verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
  entries:[{tmdbId:100,videoIds:['Abc12345678'],
    provenance:[{kind:'original-trusted-25-film-archive',runId:40086393094}]}],
}
const tmdb=async path=>{
  if(path==='/watch/providers/movie')return {
    results:[{provider_name:'YouTube',provider_id:192}]}
  if(/^\/movie\/\d+\/watch\/providers$/.test(path))
    return {results:{DE:{buy:[{provider_id:192}]}}}
  if(/^\/movie\/\d+$/.test(path)){
    const tmdbId=Number(path.split('/')[2])
    return {id:tmdbId,title:'Test Film '+tmdbId,
      original_title:'Test Film '+tmdbId,release_date:'2000-01-01',
      runtime:110,credits:{crew:[]}}
  }
  throw Error('Unexpected TMDB path')
}
// Offline substitute for the successful GCS admission readback. Live code
// obtains this only through Monitoring + GCS generation-CAS, never a flag.
const admission=()=>({
  source:'gcs-atomic-five-search-reservation',runId:601100,
  tmdbIds:[201,202,203,204,205],maximumSearchAttempts:5,
  internalReservationRecorded:true,quotaIsSharedAndNotGuaranteed:true,
  noAutomaticRetries:true,offerApproval:false,
})
const video=id=>({id,snippet:{title:'Test Film',channelTitle:'YouTube Movies',
  channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',categoryId:'30',
  publishedAt:'2025-01-01T00:00:00Z'},
  contentDetails:{duration:'PT1H50M'},status:{privacyStatus:'public'}})
describe('bounded 5-search MovieHub YouTube G2 pilot (#388)',()=>{
  it('selects exactly five distinct new current badges, excluding checkpoint, Star Wars and Google TV',()=>{
    const p=planFiveYoutubeSearches({publicIndex:index,checkpoint,now:at})
    expect(p.tmdbRefs.map(x=>x.tmdbId)).toEqual([201,202,203,204,205])
    expect(p.maxSearchAttempts).toBe(5)
    expect(p.publicationPermitted).toBe(false)
  })
  it('executes exactly five searches, zero retries and stores rows privately in progress',async()=>{
    const calls=[],progress=[]
    const api=vi.fn(async(path,params)=>{
      calls.push(path)
      if(path==='search')return {items:[{id:{videoId:'Abc12345678'}}]}
      if(path==='videos')return {items:[video('Abc12345678')]}
      throw Error('not allowed')
    })
    const waited=[]
    const r=await researchFiveYouTubeMovies({
      publicIndex:index,checkpoint,now:at,tmdbGet:tmdb,budgetAdmission:admission(),
      youtubeApi:api,wait:async ms=>{waited.push(ms)},
      onProgress:async p=>{progress.push(p)},
    })
    expect(calls.filter(x=>x==='search')).toHaveLength(5)
    expect(calls.filter(x=>x==='videos')).toHaveLength(5)
    expect(waited).toEqual([20000,20000,20000,20000])
    expect(progress).toHaveLength(5)
    expect(progress.map(p=>p.summary.completedMovies)).toEqual([1,2,3,4,5])
    expect(r.summary).toMatchObject({youtubeSearchAttempts:5,
      completedMovies:5,youtubeVideoLookups:5,maximumSearchAttempts:5,
      noAutomaticRetry:true,publicationPermitted:false,
      catalogWrites:0,firestoreWrites:0,badgeWrites:0})
    expect(JSON.stringify(r.summary)).not.toContain('Abc12345678')
  })
  it('on 403/429 stops immediately with no automatic retries or extra calls',async()=>{
    for(const blocked of ['403','429']){
      const seq=[],progress=[]
      const api=vi.fn(async path=>{
        seq.push(path)
        if(path==='search'){
          if(seq.filter(x=>x==='search').length===3)
            throw Error('YouTube API: HTTP '+blocked+' bei search [QUOTA_EXHAUSTED].')
          return {items:[]}
        }
        return {items:[]}
      })
      await expect(researchFiveYouTubeMovies({
        publicIndex:index,checkpoint,now:at,tmdbGet:tmdb,budgetAdmission:admission(),
        youtubeApi:api,wait:async()=>{},
        onProgress:async p=>progress.push(p),
      })).rejects.toThrow('HTTP '+blocked)
      expect(seq.filter(x=>x==='search')).toHaveLength(3)
      expect(progress).toHaveLength(2)
      expect(progress.at(-1).summary.completedMovies).toBe(2)
    }
  })
  it('refuses a valid plan without an authenticated shared reservation',async()=>{
    for(const budgetAdmission of [undefined,null,{},{
      ...admission(),tmdbIds:[201,202,203,204,206],
    },{
      ...admission(),maximumSearchAttempts:10,
    },{
      ...admission(),quotaIsSharedAndNotGuaranteed:false,
    }]){
      const yt=vi.fn(),tmdbGet=vi.fn()
      await expect(researchFiveYouTubeMovies({
        publicIndex:index,checkpoint,now:at,tmdbGet,youtubeApi:yt,
        budgetAdmission,
      })).rejects.toThrow('G2_FIVE_SEARCH_ATOMIC_RESERVATION_REQUIRED')
      expect(yt).not.toHaveBeenCalled()
      expect(tmdbGet).not.toHaveBeenCalled()
    }
  })
  it('rejects stale/fallback/forged indexes before TMDB or YouTube',async()=>{
    const bad=[{...index,source:'fallback'},
      {...index,generatedAt:'2026-08-01T10:00:00Z'},
      {...index,count:1}]
    for(const publicIndex of bad){
      const api=vi.fn(),get=vi.fn()
      await expect(researchFiveYouTubeMovies({
        publicIndex,checkpoint,now:at,youtubeApi:api,tmdbGet:get,
      })).rejects.toThrow()
      expect(api).not.toHaveBeenCalled()
      expect(get).not.toHaveBeenCalled()
    }
  })
})
