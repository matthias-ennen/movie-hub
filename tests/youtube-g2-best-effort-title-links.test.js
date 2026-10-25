import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  buildYoutubeBestEffortLinkIndex,selectYoutubeBestEffortTitleRoute,
  BEST_EFFORT_YOUTUBE_KIND,
} from '../src/providers/youtubeBestEffortRouteIndex.js'
import {loadYoutubeBestEffortTitleLinks}
  from '../src/providers/youtubeBestEffortRouteRuntime.js'
import {getProviderDestination} from '../src/data/catalog.js'
import {launchProviderPlaybackRoute}
  from '../src/providers/providerPlaybackLaunch.js'

const NOW='2026-10-25T12:00:00Z'
const ID='0nBiidtN7ZU'
const item={type:'movie',tmdbId:539892,title:'Freaks',
  tmdbProviderIds:['youtube'],tmdbProviderOffers:[{id:'youtube',offerTypes:['rent','buy']}]}
const top=()=>({videoId:ID,score:49,titleLevel:4,runtimeDelta:2.5,strong:true,
  yearMismatch:false,sequelConflict:false,sourceTypeRisk:false,regionSignal:'unknown'})
const row=()=>({tmdbId:539892,status:'review-single-video-candidate',
  candidateDiscoveryMode:'trusted-previous-candidate-ids',
  tmdbDeOfferTypes:['rent','buy'],reviewedVideoId:null,
  directPlaybackRoute:null,publicationPermitted:false,videoCandidates:[top()]})
const qa=()=>({summary:{
  kind:'moviehub-youtube-g2-global-known-video-no-search-recheck',
  generatedAt:NOW,rowsChecked:1,searchCalls:0,privateReviewArtifact:true,
  publicationPermitted:false,independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
  firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
},rows:[row()]})
const build=()=>buildYoutubeBestEffortLinkIndex(qa(),{now:NOW})
const props={now:Date.parse(NOW),hasYoutubeBadge:true}

describe('Best-effort exact YouTube link without inventing verified offers',()=>{
  it('produces one current watch link and keeps TMDB offer/badge unchanged',()=>{
    const index=build()
    expect(index).toMatchObject({kind:BEST_EFFORT_YOUTUBE_KIND,count:1,
      claimedOfferTypes:[],verifiedDEOffers:0,verifiedPlaybackRoutes:0,
      entries:[{key:'movie:539892',videoId:ID,
        quality:'probable-video-not-verified',target:'https://www.youtube.com/watch?v='+ID}]})
    expect(JSON.stringify(index)).not.toContain('"rent"')
    const route=selectYoutubeBestEffortTitleRoute(index,item,props)
    expect(route).toMatchObject({mode:'APP_DEEP_LINK',scope:'title',
      target:'https://www.youtube.com/watch?v='+ID,
      verificationStatus:'best-effort-not-verified'})
    const fallback=getProviderDestination('youtube',item.title)
    const bridge={openProviderRoute:vi.fn()}
    expect(launchProviderPlaybackRoute({
      providerId:'youtube',title:item.title,route,fallbackUrl:fallback,nativeBridge:bridge,
    })).toBe(true)
    expect(bridge.openProviderRoute).toHaveBeenCalledWith(
      'youtube',item.title,'APP_DEEP_LINK','title',
      'https://www.youtube.com/watch?v='+ID,fallback)
    expect(item.tmdbProviderOffers).toEqual([{id:'youtube',offerTypes:['rent','buy']}])
  })
  it('does not enrich missing badges, other movies or series',()=>{
    const index=build()
    expect(selectYoutubeBestEffortTitleRoute(index,item,{...props,hasYoutubeBadge:false})).toBeNull()
    expect(selectYoutubeBestEffortTitleRoute(index,{...item,tmdbId:1},props)).toBeNull()
    expect(selectYoutubeBestEffortTitleRoute(index,{...item,type:'series'},props)).toBeNull()
  })
  it('fails closed for expired, forged or duplicate public projections',()=>{
    const baseline=build()
    expect(selectYoutubeBestEffortTitleRoute(baseline,item,{
      ...props,now:Date.parse('2026-11-02T12:00:00Z')})).toBeNull()
    for(const change of [
      x=>{x.entries[0].videoId='not-an-id'},
      x=>{x.entries[0].target='https://example.com/invalid'},
      x=>{x.entries[0].quality='verified'},
      x=>{x.entries[0].rankMargin=0},
      x=>{x.entries[0].score=4},
      x=>{x.entries[0].validUntil='2027-01-01T00:00:00Z'},
      x=>{x.entries.push({...x.entries[0]});x.count=2},
      x=>{x.claimedOfferTypes=['free']},
      x=>{x.verifiedDEOffers=1},
    ]){
      const forged=structuredClone(baseline);change(forged)
      expect(selectYoutubeBestEffortTitleRoute(forged,item,props)).toBeNull()
    }
    expect(getProviderDestination('youtube',item.title)).toContain('search_query=')
  })
  it('rejects poor match, ambiguous near-tie, blocked DE and no YouTube badge',()=>{
    for(const change of [
      x=>{x.rows[0].status='review-multiple-video-editions'},
      x=>{x.rows[0].videoCandidates[0].strong=false},
      x=>{x.rows[0].videoCandidates[0].score=20},
      x=>{x.rows[0].videoCandidates[0].sourceTypeRisk=true},
      x=>{x.rows[0].videoCandidates[0].regionSignal='excluded'},
      x=>{x.rows[0].videoCandidates[0].yearMismatch=true},
      x=>{x.rows[0].tmdbDeOfferTypes=[]},
      x=>{x.rows[0].videoCandidates.push({...top(),videoId:'abcdefghijk',score:46,strong:false})},
    ]){
      const input=qa();change(input)
      expect(buildYoutubeBestEffortLinkIndex(input,{now:NOW}).count).toBe(0)
    }
  })
  it('rejects forged privileged QA and expired private research before projection',()=>{
    for(const change of [
      x=>{x.summary.generatedAt='2026-10-01T12:00:00Z'},
      x=>{x.summary.searchCalls=1},
      x=>{x.summary.privateReviewArtifact=false},
      x=>{x.summary.publicationPermitted=true},
      x=>{x.summary.independentlyVerifiedDeOffers=1},
      x=>{x.summary.publishedDirectRoutes=1},
      x=>{x.summary.firebaseWrites=1},
      x=>{x.summary.rowsChecked=2},
      x=>{x.rows[0].directPlaybackRoute={target:'watch'}},
      x=>{x.rows[0].reviewedVideoId=ID},
      x=>{x.rows[0].candidateDiscoveryMode='new-search'},
      x=>{x.rows.push(row())},
    ]){
      const input=qa();change(input)
      expect(()=>buildYoutubeBestEffortLinkIndex(input,{now:NOW})).toThrow()
    }
  })
  it('revalidates default Hosted fetch instead of retaining a revoked URL for the whole session',async()=>{
    const originalFetch=globalThis.fetch
    const valid=build()
    let served=valid
    const request=vi.fn(async(_url,options)=>served
      ?{ok:true,status:200,json:async()=>served}
      :{ok:false,status:404})
    globalThis.fetch=request
    try{
      expect(await loadYoutubeBestEffortTitleLinks()).toEqual(valid)
      served=null
      expect(await loadYoutubeBestEffortTitleLinks()).toBeNull()
      served=valid
      expect(await loadYoutubeBestEffortTitleLinks()).toEqual(valid)
    }finally{
      globalThis.fetch=originalFetch
    }
    expect(request).toHaveBeenCalledTimes(3)
    for(const [url,options] of request.mock.calls){
      expect(url).toBe('/youtube-best-effort-title-links.json')
      expect(options).toMatchObject({cache:'no-store',redirect:'error'})
    }
  })
  it('refreshes the shared best-effort feed on returning to the app, without background polling',()=>{
    const source=readFileSync(new URL('../src/providers/YoutubeVerifiedOffersContext.jsx',
      import.meta.url),'utf8')
    expect(source).toContain("document.addEventListener('visibilitychange', onResume)")
    expect(source).toContain("window.addEventListener('focus', onResume)")
    expect(source).not.toContain('setInterval(')
    expect(source).toContain("if (document.visibilityState !== 'hidden') refreshBestEffort()")
    expect(source).toContain('setBestEffort(null)')
    expect(source).toContain('requestId === latestRequest')
    expect(source).toContain("document.removeEventListener('visibilitychange', onResume)")
    expect(source).toContain("window.removeEventListener('focus', onResume)")

  })
  it('optional loader never asserts an offer or breaks on 404',async()=>{
    expect(await loadYoutubeBestEffortTitleLinks(
      vi.fn(async()=>({ok:false,status:404})))).toBeNull()
    const valid=build()
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>valid}))
    expect(await loadYoutubeBestEffortTitleLinks(fetcher)).toEqual(valid)
    expect(fetcher).toHaveBeenCalledWith('/youtube-best-effort-title-links.json',{
      redirect:'error',cache:'no-store',
    })
    const modified={...valid,claimedOfferTypes:['free']}
    expect(await loadYoutubeBestEffortTitleLinks(
      vi.fn(async()=>({ok:true,json:async()=>modified})))).toBeNull()
  })
})
