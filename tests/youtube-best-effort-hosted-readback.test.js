import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {buildYoutubeBestEffortLinkIndex}
  from '../src/providers/youtubeBestEffortRouteIndex.js'
import {verifyLiveBestEffortLinkPublication,LIVE_BEST_EFFORT_URL,
  selectPublishedYoutubeDeviceTestCases}
  from '../scripts/verify-youtube-best-effort-publication.mjs'

const NOW='2026-10-25T14:00:00Z',OBS='2026-10-25T13:00:00Z'
const qa=()=>({
  summary:{
    kind:'moviehub-youtube-g2-global-known-video-no-search-recheck',
    generatedAt:OBS,rowsChecked:1,searchCalls:0,privateReviewArtifact:true,
    publicationPermitted:false,independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
    firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
  },
  rows:[{tmdbId:100,status:'review-single-video-candidate',
    candidateDiscoveryMode:'trusted-previous-candidate-ids',
    tmdbDeOfferTypes:['free'],reviewedVideoId:null,
    directPlaybackRoute:null,publicationPermitted:false,
    videoCandidates:[{
      videoId:'0nBiidtN7ZU',score:45,titleLevel:4,runtimeDelta:2,
      strong:true,yearMismatch:false,sequelConflict:false,sourceTypeRisk:false,
      regionSignal:'unknown',
    }],
  }],
})
const index=()=>buildYoutubeBestEffortLinkIndex(qa(),{now:OBS})
const response=(body,{status=200,type='application/json',
  caching='no-store'}={})=>({
    status,ok:status>=200&&status<300,
    headers:{get:k=>k==='content-type'?type:k==='cache-control'?caching:null},
    json:async()=>body,
})
const options={now:Date.parse(NOW)}
describe('actual Firebase YouTube link-only HTTP publication probe',()=>{
  it('requires the exact current link index and no-store on real HTTP readback',async()=>{
    const data=index()
    const req=vi.fn(async()=>response(data))
    expect(await verifyLiveBestEffortLinkPublication({
      ...options,expected:data,request:req,
    })).toEqual({published:true,count:1,revoked:false})
    expect(req.mock.calls[0][0].origin).toBe('https://movie-hub-62459.web.app')
    expect(req.mock.calls[0][0].pathname).toBe('/youtube-best-effort-title-links.json')
    expect(req.mock.calls[0][1]).toMatchObject({
      cache:'no-store',redirect:'error',
    })
  })
  it('detects mismatch, missing JSON, expired route, wrong headers and bad hosts',async()=>{
    const current=index()
    for(const badResponse of [
      response({...current,count:0}),
      response({}, {type:'text/html'}),
      response(current,{caching:'public,max-age=3600'}),
      response(current,{status:404}),
    ]){
      await expect(verifyLiveBestEffortLinkPublication({
        ...options,expected:current,request:async()=>badResponse,
      })).rejects.toThrow()
    }
    const old=structuredClone(current)
    old.sourceObservedAt='2026-10-01T13:00:00Z'
    await expect(verifyLiveBestEffortLinkPublication({
      ...options,expected:old,request:async()=>response(old),
    })).rejects.toThrow('YOUTUBE_BEST_EFFORT_PREPARED_LINKS_UNSAFE')
    await expect(verifyLiveBestEffortLinkPublication({
      ...options,expected:current,url:'https://evil.example/best-effort.json',
      request:async()=>response(current),
    })).rejects.toThrow('YOUTUBE_BEST_EFFORT_LIVE_VERIFY_HOST_FORBIDDEN')
  })
  it('treats 404 and Firebase SPA html as successful link revocation, not live routes',async()=>{
    for(const live of [
      response(null,{status:404,type:'text/plain'}),
      response(null,{status:200,type:'text/html'}),
    ]){
      expect(await verifyLiveBestEffortLinkPublication({
        ...options,expected:null,request:async()=>live,
      })).toEqual({published:false,count:0,revoked:true})
    }
    await expect(verifyLiveBestEffortLinkPublication({
      ...options,expected:null,request:async()=>response(index(),{
        type:'text/plain',
      }),
    })).rejects.toThrow('YOUTUBE_BEST_EFFORT_STALE_LINKS_NOT_REVOKED')
    await expect(verifyLiveBestEffortLinkPublication({
      ...options,expected:null,request:async()=>response(index()),
    })).rejects.toThrow('YOUTUBE_BEST_EFFORT_STALE_LINKS_NOT_REVOKED')
  })
  it('offers concrete high-scoring device test films from public badged MovieHub titles',()=>{
    const links=index()
    const original=links.entries[0]
    links.entries.push({...original,key:'movie:200',tmdbId:200,
      videoId:'abcdefghijk',target:'https://www.youtube.com/watch?v=abcdefghijk',
      score:49})
    links.count=2
    const publicIndex={
      kind:'search-index',version:1,country:'DE',source:'tmdb',
      count:3,entries:[
        {type:'movie',tmdbId:100,title:'Ein Film (2026)',year:2026,
          providerOffers:[{id:'youtube',offerTypes:['rent']}]},
        {type:'movie',tmdbId:200,title:' Ein | zweiter <Film> ',year:2020,
          providerIds:['youtube']},
        {type:'movie',tmdbId:300,title:'Nicht enthalten',year:2024,
          providerIds:['youtube']},
      ],
    }
    const selected=selectPublishedYoutubeDeviceTestCases(links,publicIndex,options)
    expect(selected).toEqual([
      {tmdbId:200,title:'Ein zweiter Film',year:2020,
        videoId:'abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk'},
      {tmdbId:100,title:'Ein Film 2026',year:2026,
        videoId:'0nBiidtN7ZU',url:'https://www.youtube.com/watch?v=0nBiidtN7ZU'},
    ])
    expect(JSON.stringify(selected)).not.toContain('rent')
    expect(JSON.stringify(selected)).not.toContain('Nicht enthalten')
  })
  it('does not expose unbadged films or stale/revoked/forged YouTube links',()=>{
    const links=index()
    const publicIndex={kind:'search-index',version:1,country:'DE',
      source:'tmdb',count:1,entries:[{type:'movie',tmdbId:100,
        title:'Nur öffentlich',providerIds:['netflix']}]}
    expect(selectPublishedYoutubeDeviceTestCases(links,publicIndex,options)).toEqual([])
    publicIndex.entries[0].providerOffers=[{id:'youtube'}]
    expect(selectPublishedYoutubeDeviceTestCases(links,publicIndex,options))
      .toHaveLength(1)
    links.entries[0].target='https://some-other-site.invalid'
    expect(selectPublishedYoutubeDeviceTestCases(links,publicIndex,options)).toEqual([])
    links.entries[0].target='https://www.youtube.com/watch?v=0nBiidtN7ZU'
    expect(selectPublishedYoutubeDeviceTestCases(links,publicIndex,{
      now:Date.parse('2026-11-02T12:00:00Z'),
    })).toEqual([])
  })
  it('skips malformed, duplicate or fallback catalog identities and never uses private QA',()=>{
    const links=index()
    const item={type:'movie',tmdbId:100,title:'Test Film',providerIds:['youtube']}
    const base={kind:'search-index',version:1,country:'DE',source:'tmdb',
      count:1,entries:[item]}
    for(const bad of [
      {...base,source:'fallback'},
      {...base,country:'US'},
      {...base,count:3},
      {...base,entries:[item,item],count:2},
      {...base,entries:[{...item,providerIds:{includes:()=>true}}]},
      {...base,entries:[{...item,providerIds:null,providerOffers:{id:'youtube'}}]},
    ]){
      expect(selectPublishedYoutubeDeviceTestCases(links,bad,options)).toEqual([])
    }
    expect(selectPublishedYoutubeDeviceTestCases(links,base,{
      ...options,limit:0,
    })).toEqual([])
  })
  it('independently audits deployed YouTube links even if generic data readback fails',()=>{
    const wf=readFileSync(new URL('../.github/workflows/deploy-firebase.yml',
      import.meta.url),'utf8')
    const deploy=wf.indexOf('npx firebase-tools deploy')
    const ordinary=wf.indexOf('node scripts/verify-published-data.mjs',deploy)
    const http=wf.indexOf('node scripts/verify-youtube-best-effort-publication.mjs')
    expect(deploy).toBeGreaterThan(-1)
    expect(ordinary).toBeGreaterThan(deploy)
    expect(http).toBeGreaterThan(ordinary)
    const readback=wf.slice(wf.lastIndexOf('- name: Verify hosted best-effort link index',http),http)
    expect(readback).toContain("!cancelled() && steps.firebase_deploy.outcome == 'success'")
    expect(readback).not.toContain("steps.publication_verify.outcome == 'success'")
    // The shared publication audit still fails the whole deploy on mismatch:
    // it must not become continue-on-error merely to print device cases.
    const standard=wf.slice(wf.lastIndexOf('- name: Verify actually published source generations',http),http)
    expect(standard).toContain('run: node scripts/verify-published-data.mjs')
    expect(standard).not.toContain('continue-on-error: true')
  })
})
