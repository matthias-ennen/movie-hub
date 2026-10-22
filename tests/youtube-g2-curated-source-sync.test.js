import {describe,it,expect,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {
  CURATED_FREE_PLAYLIST,CURATED_RENT_BUY_PLAYLIST,
  APPROVAL_BUNDLE_KIND,runCuratedYoutubeSourceSync,
  reconcileCuratedYoutubeSource,
} from '../scripts/youtube-g2-curated-source-sync.mjs'
import {runProductionCuratedSync} from '../scripts/youtube-g2-curated-source-sync-live.mjs'
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
  it('blocks an approval spanning the free/rent playlist overlap',async()=>{
    const result=await runCuratedYoutubeSourceSync({
      youtubeApi:api(),now:()=>NOW,approvals:bundle([approval(ids[1])]),
    })
    expect(result.audit.crossPlaylistConflicts).toBe(1)
    expect(result.publishedVerifiedAvailabilities).toBe(0)
    expect(result.approvalCandidatesBlocked).toHaveLength(1)
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
      })
      expect(envelope.records).toEqual([])
      expect(publicStatus).not.toHaveProperty('candidates')
      expect(JSON.stringify(publicStatus)).not.toContain(ids[0])
    }finally{await rm(dir,{recursive:true,force:true})}
  })
})
