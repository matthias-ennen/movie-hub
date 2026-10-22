import { describe,it,expect } from 'vitest'
import {
  createYoutubeFullCatalogResearchPlan,
  YOUTUBE_RESEARCH_MAX_ESTIMATED_SEARCH_QUOTA,
} from '../scripts/youtube-g2-full-catalog-queue.mjs'
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
      offset:a.batch.nextOffset,limit:2,now})
    expect(a.batch).toMatchObject({offset:0,selectedCount:2,nextOffset:2,
      youtubeSearchCallsPlanned:4,estimatedYoutubeSearchQuotaUnits:400})
    expect(b.batch).toMatchObject({offset:2,selectedCount:1,nextOffset:null,
      youtubeSearchCallsPlanned:2,estimatedYoutubeSearchQuotaUnits:200})
    expect([...a.plan,...b.plan].map(x=>x.tmdbId)).toEqual([10,20,80])
    expect(a.batch.estimatedYoutubeSearchQuotaUnits).toBeLessThanOrEqual(
      YOUTUBE_RESEARCH_MAX_ESTIMATED_SEARCH_QUOTA)
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
    })).toThrow('G2_RESEARCH_CURSOR_PAST_END')
    const p=createYoutubeFullCatalogResearchPlan({inventory:inventory(),publicIndex:idx(),now})
    expect(p.plan.some(x=>x.tmdbId===30)).toBe(false)
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
})
