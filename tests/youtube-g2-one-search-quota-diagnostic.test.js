import {describe,it,expect,vi} from 'vitest'
import {
  selectExactlyOnePreviouslyUnknownBadgedMovie,
  runOneSearchQuotaDiagnostic,
} from '../scripts/youtube-g2-one-search-quota-diagnostic.mjs'
const checkpoint={
  kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
  createdAt:'2026-10-24T10:00:00Z',updatedAt:'2026-10-24T16:00:00Z',
  evidenceStatus:'candidate-only-not-independent-DE-offer',
  verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
  entries:[{tmdbId:101,videoIds:['Abc12345678'],
    provenance:[{kind:'original-trusted-25-film-archive',runId:40086393094}]}],
}
const index={
  kind:'search-index',version:1,source:'tmdb',country:'DE',
  generatedAt:'2026-10-24T17:00:00Z',
  entries:[
    {type:'movie',tmdbId:101,title:'Known',providerIds:['youtube']},
    {type:'movie',tmdbId:102,title:'Unmatched Film',year:1995,providerIds:['youtube']},
    {type:'movie',tmdbId:103,title:'Irrelevant Google TV',providerIds:['google-tv']},
    ...Array.from({length:110},(_,i)=>({
      type:'movie',tmdbId:20000+i,title:'Other '+i,providerIds:['other']})),
  ],
}
index.count=index.entries.length
const at='2026-10-24T17:30:00.000Z'
describe('quota preflight: strictly ONE search.list call for a previously unresearched exact-badge movie',()=>{
  it('selects previously UNKNOWN global TMDB badge, never cached film or Google TV',()=>{
    const p=selectExactlyOnePreviouslyUnknownBadgedMovie(index,checkpoint)
    expect(p).toMatchObject({tmdbId:102,knownCandidateFilms:1,
      publicBadgedMovies:2})
    expect(p.query).toMatchObject({
      type:'video',regionCode:'DE',videoType:'movie',
      maxResults:10,part:'snippet',
    })
  })
  it('reports successful API without publishing a playback link',async()=>{
    const api=vi.fn(async()=>({items:[{id:{videoId:'Abc12345678'}}]}))
    const x=await runOneSearchQuotaDiagnostic({checkpoint,publicIndex:index,
      youtubeApi:api,now:at})
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0][0]).toBe('search')
    expect(x).toMatchObject({
      searchOutcome:'search-accessible',googleFailureClass:'OK',
      searchCallsAttempted:1,responseCandidateCount:1,
      quotaActuallyMeasured:false,quotaAvailableUnits:null,
      confirmedPlaybackRoutes:0,firestoreWrites:0,catalogWrites:0,
      noAutomaticRetry:true,
    })
    expect(x).not.toHaveProperty('videoCandidates')
    expect(JSON.stringify(x)).not.toContain('Abc12345678')
  })
  it('preserves distinct canonical search IDs privately without leaking into summary',async()=>{
    const ids=['Abc12345678','Abc12345678','Z1234567890','bad video id']
    const api=vi.fn(async()=>({items:ids.map(videoId=>({id:{videoId},
      snippet:{title:'private-source-title-DO-NOT-PUBLISH'}}))}))
    const capture=vi.fn()
    const summary=await runOneSearchQuotaDiagnostic({
      checkpoint,publicIndex:index,youtubeApi:api,
      onPrivateCandidates:capture,now:at,
    })
    expect(api).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith({
      tmdbId:102,generatedAt:at,videoIds:['Abc12345678','Z1234567890'],
    })
    expect(summary).toMatchObject({searchCallsAttempted:1,
      searchOutcome:'search-accessible',responseCandidateCount:4,
      confirmedPlaybackRoutes:0,quotaActuallyMeasured:false})
    for(const privateValue of ['Abc12345678','Z1234567890',
      'private-source-title-DO-NOT-PUBLISH']){
      expect(JSON.stringify(summary)).not.toContain(privateValue)
    }
  })
  it('never creates private candidates on 403/429 or invalid responses',async()=>{
    for(const status of [403,429]){
      const callback=vi.fn()
      const api=vi.fn(async()=>{throw Error(
        'YouTube API: HTTP '+status+' bei search [QUOTA_EXHAUSTED].')})
      const result=await runOneSearchQuotaDiagnostic({
        checkpoint,publicIndex:index,youtubeApi:api,now:at,
        onPrivateCandidates:callback,
      })
      expect(result.searchCallsAttempted).toBe(1)
      expect(api).toHaveBeenCalledTimes(1)
      expect(callback).not.toHaveBeenCalled()
    }
    const capture=vi.fn()
    await expect(runOneSearchQuotaDiagnostic({
      checkpoint,publicIndex:index,youtubeApi:async()=>({items:Array(11).fill({})}),
      onPrivateCandidates:capture,now:at,
    })).rejects.toThrow('G2_ONE_SEARCH_RESPONSE_UNTRUSTED')
    expect(capture).not.toHaveBeenCalled()
  })
  it('captures sanitized 429 quota error and refuses extra retries',async()=>{
    const api=vi.fn(async()=>{throw Error(
      'YouTube API: HTTP 429 bei search [QUOTA_EXHAUSTED]. API-Quota und Key-Restriktion prüfen; kein automatischer Retry.')})
    const x=await runOneSearchQuotaDiagnostic({checkpoint,publicIndex:index,
      youtubeApi:api,now:at})
    expect(api).toHaveBeenCalledTimes(1)
    expect(x).toMatchObject({
      searchOutcome:'search-throttled-429',googleFailureClass:'QUOTA_EXHAUSTED',
      searchCallsAttempted:1,responseCandidateCount:0,
    })
  })
  it('preserves request rejected status rather than treating it as quota open',async()=>{
    const api=vi.fn(async()=>{throw Error(
      'YouTube API: HTTP 403 bei search [QUOTA_EXHAUSTED].')})
    const x=await runOneSearchQuotaDiagnostic({checkpoint,publicIndex:index,
      youtubeApi:api,now:at})
    expect(x).toMatchObject({searchOutcome:'search-rejected-403',
      googleFailureClass:'QUOTA_EXHAUSTED'})
    expect(api).toHaveBeenCalledTimes(1)
  })
  it('rejects stale or forged public source, fabricated approvals, and unclassified errors',async()=>{
    const api=vi.fn()
    await expect(runOneSearchQuotaDiagnostic({
      checkpoint:{...checkpoint,verifiedDEOffers:3},
      publicIndex:index,youtubeApi:api,now:at,
    })).rejects.toThrow()
    expect(api).not.toHaveBeenCalled()
    expect(()=>selectExactlyOnePreviouslyUnknownBadgedMovie(
      {...index,source:'fallback'},checkpoint)).toThrow()
    await expect(runOneSearchQuotaDiagnostic({
      checkpoint,publicIndex:index,now:at,
      youtubeApi:async()=>{throw Error('secret-data-do-not-copy')},
    })).rejects.toThrow('secret-data-do-not-copy')
  })
})
