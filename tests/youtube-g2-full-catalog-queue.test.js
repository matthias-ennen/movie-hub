import { describe,it,expect } from 'vitest'
import {
  createYoutubeFullCatalogResearchPlan,
  YOUTUBE_RESEARCH_MAX_ESTIMATED_SEARCH_QUOTA,
  YOUTUBE_SEARCH_QUOTA_UNITS,YOUTUBE_SEARCH_DEFAULT_DAILY_CALL_LIMIT,
} from '../scripts/youtube-g2-full-catalog-queue.mjs'
import {parseResearchRunInput,assertNoUngatedYoutubeSearch} from '../scripts/youtube-g2-full-catalog-queue-live.mjs'
const now='2026-10-22T20:10:00.000Z'
const kinds=['browse','personal-tmdb','profile-state','movie-hub','waipu','joyn']
const candidates=[
  {key:'movie:10',type:'movie',tmdbId:10,sources:['browse']},
  {key:'movie:20',type:'movie',tmdbId:20,sources:['profile-state','personal-tmdb']},
  {key:'movie:30',type:'movie',tmdbId:30,sources:['movie-hub']},
  {key:'series:50',type:'series',tmdbId:50,sources:['joyn']},
  {key:'movie:60',type:'movie',tmdbId:60,sources:['waipu']},
]
const inventory=()=>({
  kind:'title-candidate-inventory',schemaVersion:2,identity:'media-type+tmdb-id',
  generatedAt:'2026-10-22T18:00:00.000Z',
  policy:{candidateSources:kinds},
  sourceStats:Object.fromEntries(kinds.map(x=>[x,{eligibleReferences:0}])),
  counts:{canonicalCandidates:candidates.length},candidates,
})
const entry=(type,tmdbId,providerIds,offerTypes=[])=>({
  type,tmdbId,title:'Public Title '+tmdbId,
  originalTitle:'Original Title '+tmdbId,year:2000,
  providerIds,
  providerOffers:offerTypes.length?[{id:'youtube',offerTypes}]:[],
})
const finished=(plan)=>({plan,pilot:{summary:{
  publicationPermitted:false,verifiedDirectLinks:0,
  processedMovies:plan.batch.selectedCount,
  calls:{youtubeSearches:plan.batch.youtubeSearchCallsPlanned},
}}})
const idx=()=>({
  kind:'search-index',version:1,country:'DE',source:'published',
  generatedAt:'2026-10-22T18:02:00.000Z',
  entries:[
    entry('movie',20,['youtube'],['rent','buy']),
    entry('movie',10,['youtube'],['free']),
    entry('movie',30,['google_tv']),
    entry('movie',80,['youtube'],['flatrate']),
    entry('series',50,['joyn']),
    entry('movie',60,['netzkino']),
  ],
  count:6,
})
describe('G2 full canonical MovieHub inventory and YouTube badge research queue',()=>{
  it('includes actual existing catalog/profile/shared media, without claiming private badges',()=>{
    const p=createYoutubeFullCatalogResearchPlan({inventory:inventory(),publicIndex:idx(),now})
    expect(p.basis).toMatchObject({
      completeCanonicalTitleReferences:5,completeCanonicalMovies:4,completeCanonicalSeries:1,
      canonicalAndPublicBadgedTitles:2,
      publicSearchOnlyBadgedTitles:1,
      publicYoutubeBadgedTitles:3,
      canonicalTitlesWithoutKnownPublicYoutubeBadge:3,
      privateProfileYoutubeBadgeCoverage:'not-available-from-inventory',
      exposesPersonalDocumentPaths:false,
    })
    expect(p.plan.map(x=>x.key)).toEqual(['movie:10','movie:20','movie:80'])
    expect(p.plan[1].canonicalSourceKinds).toEqual(['profile-state','personal-tmdb'])
    expect(p.plan[1].offerTypesFromPublishedTmdbSnapshot).toEqual(['rent','buy'])
    expect(p.plan[2].catalogMembership).toBe('public-search-only')
    expect(p.plan.every(x=>x.confirmedVideoId===null
      && x.playbackRoute===null && x.publicationPermitted===false)).toBe(true)
    expect(p).toMatchObject({
      publicationPermitted:false,verifiedDEOffers:0,confirmedDirectLinks:0,
      catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
    })
  })
  it('uses deterministic cursors and bounds costly YouTube search calls',()=>{
    const a=createYoutubeFullCatalogResearchPlan({inventory:inventory(),publicIndex:idx(),
      offset:0,limit:2,now})
    const b=createYoutubeFullCatalogResearchPlan({inventory:inventory(),publicIndex:idx(),
      offset:a.batch.nextOffset,limit:2,now,continuation:finished(a)})
    expect(a.batch).toMatchObject({offset:0,selectedCount:2,nextOffset:2,
      youtubeSearchCallsPlanned:4,estimatedYoutubeSearchQuotaUnits:4})
    expect(b.batch).toMatchObject({offset:2,selectedCount:1,nextOffset:null,
      youtubeSearchCallsPlanned:2,estimatedYoutubeSearchQuotaUnits:2,
      queueIdentity:a.batch.queueIdentity})
    expect([...a.plan,...b.plan].map(x=>x.tmdbId)).toEqual([10,20,80])
    expect(a.batch.estimatedYoutubeSearchQuotaUnits).toBeLessThanOrEqual(
      YOUTUBE_RESEARCH_MAX_ESTIMATED_SEARCH_QUOTA)
  })
  it('chooses a genuinely uncached public YouTube movie in one-search mode',()=>{
    const known=new Map([[10,['Abc12345678']],[20,['Def12345678']]])
    const p=createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:idx(),offset:0,limit:1,now,
      knownVideoCandidatesByTmdbId:known,searchesPerTitle:1,
      uncachedOnly:true,
    })
    expect(p.plan.map(x=>x.tmdbId)).toEqual([80])
    expect(p.basis).toMatchObject({
      publicYoutubeBadgedMovies:3,
      uncachedResearchOnly:true,
      remainingPublicYoutubeBadgedUnknownFilms:1,
    })
    expect(p.batch).toMatchObject({
      selectedCount:1,total:1,youtubeSearchCallsPlanned:1,
      estimatedYoutubeSearchQuotaUnits:1,knownCandidateReuseMovies:0,
    })
    for(const opts of [
      {offset:1,continuation:null},
      {limit:2,offset:0},
      {offset:0,continuation:{plan:{}}},
    ])expect(()=>createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:idx(),now,limit:1,
      knownVideoCandidatesByTmdbId:known,
      searchesPerTitle:1,uncachedOnly:true,...opts,
    })).toThrow('G2_UNCACHED_RESEARCH_ONLY_ONE_INITIAL_WORK')
  })
  it('refuses stale/partial/fallback inventory instead of calling it complete',()=>{
    expect(()=>createYoutubeFullCatalogResearchPlan({
      inventory:{...inventory(),counts:{canonicalCandidates:100}},
      publicIndex:idx(),now,
    })).toThrow('G2_FULL_CANONICAL_INVENTORY_REQUIRED')
    expect(()=>createYoutubeFullCatalogResearchPlan({
      inventory:{...inventory(),generatedAt:'2026-09-01T00:00:00Z'},
      publicIndex:idx(),now,
    })).toThrow('G2_INVENTORY_STALE_OR_FUTURE')
    expect(()=>createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:{...idx(),country:'US'},now,
    })).toThrow('G2_CURRENT_PUBLIC_DE_SEARCH_INDEX_REQUIRED')
  })
  it('rejects unsafe batch options and does not mistake Google TV for YouTube',()=>{
    expect(()=>createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:idx(),offset:0,limit:26,now,
    })).toThrow('G2_YOUTUBE_RESEARCH_CURSOR_OR_BUDGET_INVALID')
    expect(()=>createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:idx(),offset:12,limit:2,now,
    })).toThrow('G2_RESEARCH_NONZERO_CURSOR_REQUIRES_PRIOR_QA')
    const p=createYoutubeFullCatalogResearchPlan({inventory:inventory(),publicIndex:idx(),now})
    expect(p.plan.some(x=>x.tmdbId===30)).toBe(false)
  })
  it('uses the 2026-10-15 official search.list daily-call bucket, not 100 units per search',()=>{
    expect(YOUTUBE_SEARCH_QUOTA_UNITS).toBe(1)
    expect(YOUTUBE_SEARCH_DEFAULT_DAILY_CALL_LIMIT).toBe(100)
    expect(YOUTUBE_RESEARCH_MAX_ESTIMATED_SEARCH_QUOTA).toBe(50)
    const p=createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:idx(),limit:2,now,
    })
    expect(p.batch).toMatchObject({
      defaultSearchDailyCallLimit:100,defaultDailyCallLimitIsProjectActual:false,
      youtubeSearchCallsPlanned:4,estimatedYoutubeSearchQuotaUnits:4,
      searchesRemainingAgainstUnsharedDefaultDailyLimit:96,
    })
  })
  it('blocks silent repetition, skipping and reshuffled badge queues before any API',()=>{
    const first=createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:idx(),limit:2,now,
    })
    const opts={inventory:inventory(),publicIndex:idx(),
      offset:first.batch.nextOffset,limit:2,now}
    const previous=finished(first)
    expect(()=>createYoutubeFullCatalogResearchPlan(opts))
      .toThrow('G2_RESEARCH_NONZERO_CURSOR_REQUIRES_PRIOR_QA')
    expect(()=>createYoutubeFullCatalogResearchPlan({...opts,
      offset:1,continuation:previous}))
      .toThrow('G2_RESEARCH_PRIOR_QA_OR_QUEUE_GENERATION_MISMATCH')
    expect(()=>createYoutubeFullCatalogResearchPlan({...opts,
      continuation:{...previous,pilot:{summary:{...previous.pilot.summary,
        verifiedDirectLinks:1}}}}))
      .toThrow('G2_RESEARCH_PRIOR_QA_OR_QUEUE_GENERATION_MISMATCH')
    const replaced=idx();replaced.entries.push(entry('movie',75,['youtube']))
    replaced.count++
    expect(()=>createYoutubeFullCatalogResearchPlan({...opts,
      publicIndex:replaced,continuation:previous}))
      .toThrow('G2_RESEARCH_PRIOR_QA_OR_QUEUE_GENERATION_MISMATCH')
    const altered=finished(first)
    altered.plan.plan[0]={...altered.plan.plan[0],confirmedVideoId:'Abc12345678'}
    expect(()=>createYoutubeFullCatalogResearchPlan({...opts,
      continuation:altered}))
      .toThrow('G2_RESEARCH_PRIOR_QA_OR_QUEUE_GENERATION_MISMATCH')
  })
  it('refuses implicit zero cursor, malformed prior run IDs and oversized batches',()=>{
    const good={
      YOUTUBE_G2_RESEARCH_OFFSET:'0',YOUTUBE_G2_RESEARCH_BATCH_SIZE:'10',
      YOUTUBE_G2_RESEARCH_PREVIOUS_RUN:'',
    }
    expect(parseResearchRunInput(good)).toEqual({
      offset:0,limit:10,previousRun:null,
    })
    expect(parseResearchRunInput({...good,
      YOUTUBE_G2_RESEARCH_OFFSET:'2',
      YOUTUBE_G2_RESEARCH_PREVIOUS_RUN:'40012345678'})).toEqual({
        offset:2,limit:10,previousRun:'40012345678',
      })
    for(const bad of [
      {...good,YOUTUBE_G2_RESEARCH_OFFSET:undefined},
      {...good,YOUTUBE_G2_RESEARCH_OFFSET:'1'},
      {...good,YOUTUBE_G2_RESEARCH_OFFSET:'01'},
      {...good,YOUTUBE_G2_RESEARCH_OFFSET:'0',
        YOUTUBE_G2_RESEARCH_PREVIOUS_RUN:'123'},
      {...good,YOUTUBE_G2_RESEARCH_OFFSET:'2',
        YOUTUBE_G2_RESEARCH_PREVIOUS_RUN:'../../bad'},
      {...good,YOUTUBE_G2_RESEARCH_BATCH_SIZE:'26'},
    ])expect(()=>parseResearchRunInput(bad)).toThrow()
  })
  it('treats published providerOffers youtube as exact YouTube but never as verified tariff',()=>{
    const data=idx()
    data.entries.push({type:'movie',tmdbId:90,title:'Offer only',
      providerIds:[],providerOffers:[{id:'youtube',offerTypes:['ads','flatrate','unknown']}]})
    data.count++
    const p=createYoutubeFullCatalogResearchPlan({inventory:inventory(),publicIndex:data,now})
    expect(p.plan.at(-1)).toMatchObject({tmdbId:90,catalogMembership:'public-search-only',
      offerTypesFromPublishedTmdbSnapshot:['ads','flatrate'],
      independentlyVerifiedDeOffer:false,confirmedVideoId:null})
  })
  it('blocks legacy manual full-catalog research from spending unreserved search.list calls',()=>{
    const unsafe=createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:idx(),offset:0,limit:2,now,
    })
    expect(unsafe.batch.youtubeSearchCallsPlanned).toBe(4)
    expect(()=>assertNoUngatedYoutubeSearch(unsafe))
      .toThrow('G2_SEARCH_LIST_ATOMIC_QUOTA_ADMISSION_NOT_YET_CONNECTED')
    const safe=createYoutubeFullCatalogResearchPlan({
      inventory:inventory(),publicIndex:idx(),offset:0,limit:2,now,
      knownVideoCandidatesByTmdbId:new Map([
        [10,['Abc12345678']],[20,['Def12345678']],
      ]),
    })
    expect(safe.batch.youtubeSearchCallsPlanned).toBe(0)
    expect(assertNoUngatedYoutubeSearch(safe)).toEqual({
      knownCandidateOnly:true,authorizedSearchCalls:0,
    })
    for(const edit of [
      p=>{p.publicationPermitted=true},
      p=>{p.batch.youtubeSearchCallsPlanned=1},
      p=>{p.batch.estimatedYoutubeSearchQuotaUnits=1},
      p=>{p.batch.realYoutubeApiRequestsPerformed=1},
    ]){
      const forged=structuredClone(safe);edit(forged)
      expect(()=>assertNoUngatedYoutubeSearch(forged)).toThrow()
    }
  })
})
