import {describe,it,expect,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {
  TMDB_FIRST_APPROVAL_KIND,validateTmdbFirstApprovals,
  collectVerifiedTmdbFirstYoutubeAvailabilities,
} from '../scripts/youtube-g2-tmdb-first-approved-source.mjs'
import {
  CURATED_FREE_PLAYLIST,CURATED_RENT_BUY_PLAYLIST,
} from '../scripts/youtube-g2-curated-source-sync.mjs'
import {runProductionCuratedSync} from '../scripts/youtube-g2-curated-source-sync-live.mjs'
import {buildYoutubeVerifiedRouteIndex}
  from '../src/providers/youtubeVerifiedRouteIndex.js'

const NOW='2026-10-24T12:00:00.000Z'
const CHANNEL='UC'+'a'.repeat(22)
const NEW_ID='Tmdb1234567'
const FREE_ID='Abc12345678'
const BUY_ID='Zbc12345678'
const video=(id,channelId=CHANNEL)=>({
  id,snippet:{title:'Legitimate Feature Film (2000)',channelId,
    channelTitle:'Source publisher',categoryId:'30',publishedAt:'2020-01-01T00:00:00Z'},
  status:{privacyStatus:'public'},
  contentDetails:{duration:'PT1H40M',regionRestriction:{allowed:['DE']}},
})
const approval=(videoId=NEW_ID)=>({
  videoId,verifiedChannelId:CHANNEL,titleRef:{mediaType:'movie',tmdbId:240},
  approvalSource:'independent-manual-review',approvalStatus:'approved',
  accessType:'rent',verifiedAt:NOW,
  workEvidence:'Independent recorded exact full-film and edition observation',
  offerEvidence:'Independent current German offer and rental checkout evidence',
  workIdentityVerified:true,fullWorkOrValidCutVerified:true,
  dePlaybackVerified:true,offerTypeVerified:true,sourceUseAuthorized:true,
})
const bundle=(approvals=[approval()])=>({
  kind:TMDB_FIRST_APPROVAL_KIND,schemaVersion:1,generatedAt:NOW,approvals,
})
const sourceApi=(options={})=>vi.fn(async(endpoint,params)=>{
  if(endpoint==='playlists')return {items:[
    {id:CURATED_FREE_PLAYLIST,snippet:{channelId:'UCx'},status:{privacyStatus:'public'}},
    {id:CURATED_RENT_BUY_PLAYLIST,snippet:{channelId:'UCy'},status:{privacyStatus:'public'}},
  ]}
  if(endpoint==='playlistItems')return {
    items:(params.playlistId===CURATED_FREE_PLAYLIST?[FREE_ID]:[BUY_ID])
      .map((id,position)=>({contentDetails:{videoId:id},snippet:{position}})),
  }
  if(endpoint==='videos')return {items:params.id.split(',')
    .filter(id=>!options.missing||id!==NEW_ID)
    .map(id=>{
      const v=video(id,options.wrongChannel&&id===NEW_ID?'UC'+'z'.repeat(22):CHANNEL)
      if(options.blockDE&&id===NEW_ID)v.contentDetails.regionRestriction={blocked:['DE']}
      return v
    })}
  throw Error('Unexpected source API endpoint: '+endpoint)
})
describe('YouTube G2 AP3 – confirmed TMDB-first intake to SAME SourceEnvelope',()=>{
  it('requires independently approved film/cut/DE playback/tariff/use, never matcher score',()=>{
    expect(validateTmdbFirstApprovals(null,{now:NOW})).toEqual([])
    expect(validateTmdbFirstApprovals(bundle(),{now:NOW})).toHaveLength(1)
    for(const mutate of [
      x=>x.approvals[0].sourceUseAuthorized=false,
      x=>x.approvals[0].offerTypeVerified=false,
      x=>x.approvals[0].dePlaybackVerified=false,
      x=>x.approvals[0].fullWorkOrValidCutVerified=false,
      x=>x.approvals[0].approvalStatus='candidate',
      x=>x.approvals[0].verifiedChannelId=null,
      x=>x.approvals[0].titleRef.mediaType='series',
      x=>x.approvals[0].workEvidence='score 50',
      x=>x.approvals[0].accessType='free?',
      x=>x.approvals[0].verifiedAt='2026-08-01T00:00:00.000Z',
    ]){
      const b=bundle();mutate(b)
      expect(()=>validateTmdbFirstApprovals(b,{now:NOW})).toThrow()
    }
    const duplicate=bundle([approval(),approval()])
    expect(()=>validateTmdbFirstApprovals(duplicate,{now:NOW})).toThrow()
  })
  it('requires current official videos.list and rejects changed owner, missing and DE-blocked',async()=>{
    for(const opts of [{missing:true},{wrongChannel:true},{blockDE:true}]){
      const api=sourceApi(opts)
      const out=await collectVerifiedTmdbFirstYoutubeAvailabilities({
        youtubeApi:api,approvals:bundle(),now:NOW,
      })
      expect(out.verifiedAvailabilities).toHaveLength(0)
      expect(out.blocked).toHaveLength(1)
      expect(api.mock.calls.map(x=>x[0])).toEqual(['videos'])
      expect(out.youtubeSearchCalls).toBe(0)
    }
  })
  it('on absent reviewed evidence makes zero new API calls and zero routes',async()=>{
    const api=vi.fn()
    const out=await collectVerifiedTmdbFirstYoutubeAvailabilities({
      youtubeApi:api,approvals:null,now:NOW,
    })
    expect(out).toMatchObject({approvedInputRows:0,videoLookupCalls:0,
      verifiedAvailabilities:[],blocked:[],youtubeSearchCalls:0})
    expect(api).not.toHaveBeenCalled()
  })
  it('combines both curated playlist and TMDB-first verified video under one provider',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'youtube-ap3-'))
    try{
      const api=sourceApi()
      const status=await runProductionCuratedSync({
        youtubeApi:api,now:()=>NOW,approvals:null,tmdbFirstApprovals:bundle(),
        output:join(dir,'private'),verifiedEnvelopeOutput:join(dir,'source.json'),
        publicSummaryOutput:join(dir,'status.json'),
      })
      expect(status).toMatchObject({
        sourcePlaylistCount:2,inventoryVideoIds:2,approvedDEOfferRoutes:1,
        tmdbFirstVerifiedVideoRoutes:1,tmdbFirstBlockedVideoRoutes:0,
        providerBadgeAuthority:'tmdb-preserved',
      })
      const source=JSON.parse(await readFile(join(dir,'source.json'),'utf8'))
      expect(source).toMatchObject({sourceId:'youtube',sourceStatus:'healthy'})
      expect(source.records).toHaveLength(1)
      expect(source.records[0]).toMatchObject({providerId:'youtube',
        titleRef:{mediaType:'movie',tmdbId:240},accessType:'rent',
        playbackRoutes:[{target:'https://www.youtube.com/watch?v='+NEW_ID}]})
      const index=buildYoutubeVerifiedRouteIndex(source,{now:NOW})
      expect(index.entries).toHaveLength(1)
      expect(index.entries[0].verifiedVideoId).toBe(NEW_ID)
      expect(api.mock.calls.map(x=>x[0])).toEqual([
        'playlists','playlistItems','playlistItems','videos','videos'])
      expect(api.mock.calls.filter(x=>x[0]==='search')).toHaveLength(0)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
})
