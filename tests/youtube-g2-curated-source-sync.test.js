import {describe,it,expect,vi} from 'vitest'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {
  CURATED_FREE_PLAYLIST,CURATED_RENT_BUY_PLAYLIST,
  APPROVAL_BUNDLE_KIND,runCuratedYoutubeSourceSync,
  reconcileCuratedYoutubeSource,
} from '../scripts/youtube-g2-curated-source-sync.mjs'
import {
  runProductionCuratedSync,loadApprovals,createBudgetedYoutubeDeployApi,
  YOUTUBE_DEPLOY_API_LIMITS,
} from '../scripts/youtube-g2-curated-source-sync-live.mjs'
import {buildYoutubeVerifiedRouteIndex} from '../src/providers/youtubeVerifiedRouteIndex.js'
const NOW='2026-10-22T19:00:00.000Z'
const ids=['Abc12345678','Zbc12345678','Mbc12345678']
const video=(id)=>({
  id,snippet:{title:'Feature Film (1997)',channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',
    channelTitle:'Movie Channel',categoryId:'30'},
  contentDetails:{duration:'PT1H44M',regionRestriction:{allowed:['DE']}},
  status:{privacyStatus:'public'},
})
function api({missing=false,truncated=false}={}){
  return vi.fn(async(endpoint,params)=>{
    if(endpoint==='playlists')return {items:[
      {id:CURATED_FREE_PLAYLIST,snippet:{channelId:'UCx'},status:{privacyStatus:'public'}},
      {id:CURATED_RENT_BUY_PLAYLIST,snippet:{channelId:'UCy'},status:{privacyStatus:'public'}},
    ]}
    if(endpoint==='playlistItems')return {
      items:(params.playlistId===CURATED_FREE_PLAYLIST
        ?[ids[0],ids[1]]:[ids[1],ids[2]]).map((id,position)=>({
        contentDetails:{videoId:id},snippet:{position},
      })),
      ...(truncated&&params.playlistId===CURATED_FREE_PLAYLIST?{nextPageToken:'never-ends'}:{}),
    }
    if(endpoint==='videos')return {
      items:params.id.split(',').filter(id=>!(missing&&id===ids[0])).map(video),
    }
    throw Error('Unexpected YouTube endpoint '+endpoint)
  })
}
function approval(videoId=ids[0],playlistMode='free'){
  return {videoId,playlistMode,titleRef:{mediaType:'movie',tmdbId:539892},
    approvalSource:'independent-manual-review',approvalStatus:'approved',
    verifiedAt:NOW,workEvidence:'Independently confirmed film and cut',
    offerEvidence:'Independent tested German access and tariff',
    workIdentityVerified:true,fullWorkOrValidCutVerified:true,
    dePlaybackVerified:true,offerTypeVerified:true,sourceUseAuthorized:true,
    accessType:'free'}
}
function bundle(approvals=[approval()]){
  return {kind:APPROVAL_BUNDLE_KIND,schemaVersion:1,generatedAt:NOW,approvals}
}
describe('YouTube production shared API budget across source paths',()=>{
  it('forbids search.list and every unknown endpoint before making any request',async()=>{
    const underlying=vi.fn(async()=>({items:[]}))
    const budget=createBudgetedYoutubeDeployApi(underlying)
    await expect(budget.api('search',{q:'any'}))
      .rejects.toThrow('YOUTUBE_DEPLOY_ENDPOINT_NOT_ALLOWED')
    await expect(budget.api('channels',{part:'id'}))
      .rejects.toThrow('YOUTUBE_DEPLOY_ENDPOINT_NOT_ALLOWED')
    expect(underlying).not.toHaveBeenCalled()
    expect(budget.snapshot()).toEqual({
      playlists:0,playlistItems:0,videos:0,total:0,
    })
  })
  it('enforces an exact 31-call envelope including up to 10 reviewed-video batches',async()=>{
    const underlying=vi.fn(async()=>({items:[]}))
    const budget=createBudgetedYoutubeDeployApi(underlying)
    await budget.api('playlists',{})
    for(let i=0;i<10;i++)await budget.api('playlistItems',{})
    for(let i=0;i<20;i++)await budget.api('videos',{})
    expect(budget.snapshot()).toEqual({
      playlists:1,playlistItems:10,videos:20,total:31,
    })
    expect(YOUTUBE_DEPLOY_API_LIMITS).toEqual({
      playlists:1,playlistItems:10,videos:20,total:31,
    })
    for(const endpoint of ['playlists','playlistItems','videos']){
      await expect(budget.api(endpoint,{}))
        .rejects.toThrow('YOUTUBE_DEPLOY_SHARED_API_BUDGET_EXCEEDED')
    }
    expect(underlying).toHaveBeenCalledTimes(31)
  })
  it('reserves a request before a failed API attempt and never refunds it',async()=>{
    const underlying=vi.fn().mockRejectedValueOnce(Error('429 rate limited'))
      .mockResolvedValue({items:[]})
    const budget=createBudgetedYoutubeDeployApi(underlying)
    await expect(budget.api('videos',{})).rejects.toThrow('429 rate limited')
    expect(budget.snapshot()).toEqual({
      playlists:0,playlistItems:0,videos:1,total:1,
    })
    await budget.api('videos',{})
    expect(budget.snapshot().videos).toBe(2)
    expect(underlying).toHaveBeenCalledTimes(2)
  })
})

describe('MovieHub production two-playlist source / canonical verified availability',()=>{
  it('synchronizes the real two IDs sources, but never imports metadata alone',async()=>{
    const youtubeApi=api()
    const result=await runCuratedYoutubeSourceSync({
      youtubeApi,now:()=>NOW,approvals:null,
    })
    expect(result).toMatchObject({
      playlistSources:2,inventoryVideoIds:3,publishedVerifiedAvailabilities:0,
      approvedInputRows:0,reviewOnlyCandidates:3,
      catalogWrites:0,firestoreWrites:0,tmdbBadgeWrites:0,
      audit:{calls:{playlists:1,playlistItems:2,videos:1,search:0,tmdb:0}},
    })
    expect(result.sourceEnvelope).toMatchObject({
      sourceId:'youtube',sourceStatus:'healthy',records:[],
    })
    expect(youtubeApi.mock.calls.map(x=>x[0]))
      .toEqual(['playlists','playlistItems','playlistItems','videos'])
    expect(buildYoutubeVerifiedRouteIndex(result.sourceEnvelope,{now:NOW}).count).toBe(0)
  })
  it('maps ONLY separately approved, current single-playlist video to canonical route',async()=>{
    const result=await runCuratedYoutubeSourceSync({
      youtubeApi:api(),now:()=>NOW,approvals:bundle(),
    })
    expect(result.sourceEnvelope.records).toHaveLength(1)
    expect(result.publishedVerifiedAvailabilities).toBe(1)
    expect(result.reviewOnlyCandidates).toBe(2)
    const r=result.sourceEnvelope.records[0]
    expect(r).toMatchObject({
      kind:'availability',providerId:'youtube',
      region:'DE',accessType:'free',titleRef:{mediaType:'movie',tmdbId:539892},
      playbackRoutes:[{providerId:'youtube',scope:'title',
        mode:'APP_DEEP_LINK',target:'https://www.youtube.com/watch?v='+ids[0]}],
    })
    const index=buildYoutubeVerifiedRouteIndex(result.sourceEnvelope,{now:NOW})
    expect(index.count).toBe(1)
    expect(index.entries[0]).toMatchObject({verifiedVideoId:ids[0],tmdbId:539892})
  })
  it('suppresses approval whose current video metadata is missing; never removes TMDB badge',async()=>{
    const result=await runCuratedYoutubeSourceSync({
      youtubeApi:api({missing:true}),now:()=>NOW,approvals:bundle(),
    })
    expect(result.publishedVerifiedAvailabilities).toBe(0)
    expect(result.approvalCandidatesBlocked[0].reason)
      .toBe('missing-conflicting-or-ineligible-current-video')
    expect(result.tmdbBadgeWrites).toBe(0)
  })
  it('resolves FREE priority and publishes an overlap only with independent FREE approval',async()=>{
    const noApproval=await runCuratedYoutubeSourceSync({
      youtubeApi:api(),now:()=>NOW,approvals:null,
    })
    expect(noApproval.audit.crossPlaylistConflicts).toBe(1)
    expect(noApproval.audit.candidates.find(c=>c.videoId===ids[1])).toMatchObject({
      playlistModes:['free','rent-buy'],editorialOfferHint:'free',
      verifiedOfferType:null,playbackRoute:null,
    })
    expect(noApproval.publishedVerifiedAvailabilities).toBe(0)

    const result=await runCuratedYoutubeSourceSync({
      youtubeApi:api(),now:()=>NOW,approvals:bundle([approval(ids[1])]),
    })
    expect(result.publishedVerifiedAvailabilities).toBe(1)
    expect(result.sourceEnvelope.records).toHaveLength(1)
    expect(result.sourceEnvelope.records[0]).toMatchObject({
      accessType:'free',titleRef:{mediaType:'movie',tmdbId:539892},
    })
    expect(buildYoutubeVerifiedRouteIndex(result.sourceEnvelope,{now:NOW}).count).toBe(1)
    expect(result.catalogWrites).toBe(0)
    expect(result.tmdbBadgeWrites).toBe(0)
  })
  it('blocks an R&B approval for the overlapping ID despite independent claims',async()=>{
    const result=await runCuratedYoutubeSourceSync({
      youtubeApi:api(),now:()=>NOW,
      approvals:bundle([{...approval(ids[1],'rent-buy'),accessType:'rent'}]),
    })
    expect(result.publishedVerifiedAvailabilities).toBe(0)
    expect(result.approvalCandidatesBlocked).toHaveLength(1)
    expect(result.sourceEnvelope.records).toEqual([])
  })
  it('refuses a mismatched tariff and playlist approval',async()=>{
    await expect(runCuratedYoutubeSourceSync({
      youtubeApi:api(),now:()=>NOW,
      approvals:bundle([{...approval(ids[1],'free'),accessType:'rent'}]),
    })).rejects.toThrow('YOUTUBE_APPROVAL_MISSING_INDEPENDENT_EVIDENCE')
  })
  it('rejects incomplete pagination and expired or unverified claims',async()=>{
    await expect(runCuratedYoutubeSourceSync({
      youtubeApi:api({truncated:true}),now:()=>NOW,approvals:null,
    })).rejects.toThrow('YOUTUBE_CURATED_SOURCE_INCOMPLETE_OR_UNTRUSTED')
    await expect(runCuratedYoutubeSourceSync({
      youtubeApi:api(),now:()=>NOW,
      approvals:bundle([{...approval(),sourceUseAuthorized:false}]),
    })).rejects.toThrow('YOUTUBE_APPROVAL_MISSING_INDEPENDENT_EVIDENCE')
    await expect(runCuratedYoutubeSourceSync({
      youtubeApi:api(),now:()=>NOW,
      approvals:bundle([{...approval(),verifiedAt:'2026-08-01T00:00:00Z'}]),
    })).rejects.toThrow('YOUTUBE_APPROVAL_MISSING_INDEPENDENT_EVIDENCE')
  })
  it('writes a live source status manifest but NEVER the unverified video IDs as playing offers',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'youtube-curated-live-'))
    try{
      const q=join(dir,'private'),e=join(dir,'approved-source.json'),
        p=join(dir,'public-status.json')
      const status=await runProductionCuratedSync({
        youtubeApi:api(),approvals:null,now:()=>NOW,
        output:q,verifiedEnvelopeOutput:e,publicSummaryOutput:p,
      })
      const envelope=JSON.parse(await readFile(e,'utf8'))
      const publicStatus=JSON.parse(await readFile(p,'utf8'))
      expect(status).toMatchObject({
        sourcePlaylistCount:2,inventoryVideoIds:3,
        approvedDEOfferRoutes:0,providerBadgeAuthority:'tmdb-preserved',
        apiUsage:{playlists:1,playlistItems:2,videos:1,total:4},
        apiLimits:{playlists:1,playlistItems:10,videos:20,total:31},
      })
      expect(envelope.records).toEqual([])
      expect(publicStatus.apiUsage).toEqual({
        playlists:1,playlistItems:2,videos:1,total:4,
      })
      expect(publicStatus).not.toHaveProperty('candidates')
      expect(JSON.stringify(publicStatus)).not.toContain(ids[0])
    }finally{await rm(dir,{recursive:true,force:true})}
  })
})

// The versioned manifest is intentionally absent from the repository until
// real independent evidence is reviewed. These fixtures are synthetic only.
describe('G2 approval source intake is durable and fail-closed',()=>{
  it('returns no approvals when both inputs are absent',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'youtube-g2-intake-'))
    try{
      expect(await loadApprovals(join(dir,'runtime.json'),join(dir,'reviewed.json'))).toBeNull()
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('reads a reviewed bundle and lets existing independent evidence gate publish only verified rows',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'youtube-g2-intake-'))
    try{
      const runtime=join(dir,'runtime.json'),reviewed=join(dir,'reviewed.json')
      const approved=bundle([approval(ids[0])])
      await writeFile(reviewed,JSON.stringify(approved))
      expect(await loadApprovals(runtime,reviewed)).toEqual(approved)
      const status=await runProductionCuratedSync({
        youtubeApi:api(),now:()=>NOW,approvalInput:runtime,reviewedApprovalInput:reviewed,
        output:join(dir,'private'),verifiedEnvelopeOutput:join(dir,'envelope.json'),
        publicSummaryOutput:join(dir,'status.json'),
      })
      expect(status.approvedDEOfferRoutes).toBe(1)
      const envelope=JSON.parse(await readFile(join(dir,'envelope.json'),'utf8'))
      expect(envelope.records).toHaveLength(1)
      expect(buildYoutubeVerifiedRouteIndex(envelope,{now:NOW}).count).toBe(1)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('rejects two competing approval sources rather than silently overriding one',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'youtube-g2-intake-'))
    try{
      const runtime=join(dir,'runtime.json'),reviewed=join(dir,'reviewed.json')
      await writeFile(runtime,JSON.stringify(bundle()))
      await writeFile(reviewed,JSON.stringify(bundle()))
      await expect(loadApprovals(runtime,reviewed)).rejects.toThrow('YOUTUBE_APPROVAL_SOURCES_AMBIGUOUS')
      await expect(runProductionCuratedSync({
        youtubeApi:api(),now:()=>NOW,approvalInput:runtime,reviewedApprovalInput:reviewed,
        output:join(dir,'private'),verifiedEnvelopeOutput:join(dir,'envelope.json'),
        publicSummaryOutput:join(dir,'status.json'),
      })).rejects.toThrow('YOUTUBE_APPROVAL_SOURCES_AMBIGUOUS')
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('does not silently accept malformed or unapproved versioned evidence',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'youtube-g2-intake-'))
    try{
      const runtime=join(dir,'runtime.json'),reviewed=join(dir,'reviewed.json')
      await writeFile(reviewed,'{invalid')
      await expect(loadApprovals(runtime,reviewed)).rejects.toThrow()
      await writeFile(reviewed,JSON.stringify(bundle([
        {...approval(),fullWorkOrValidCutVerified:false},
      ])))
      await expect(runProductionCuratedSync({
        youtubeApi:api(),now:()=>NOW,approvalInput:runtime,reviewedApprovalInput:reviewed,
        output:join(dir,'private'),verifiedEnvelopeOutput:join(dir,'envelope.json'),
        publicSummaryOutput:join(dir,'status.json'),
      })).rejects.toThrow('YOUTUBE_APPROVAL_MISSING_INDEPENDENT_EVIDENCE')
    }finally{await rm(dir,{recursive:true,force:true})}
  })
})
