import { describe,expect,it } from 'vitest'
import {
  planCompleteYoutubePlaylistIntake,completeYoutubeIntakeReport,
} from '../scripts/youtube-g2-complete-playlist-intake.mjs'
import {buildCuratedEditorialTitleIndex} from '../src/providers/youtubeCuratedEditorialIndex.js'

const NOW='2026-10-23T13:30:00.000Z'
const FREE='PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
const RB='PLJWJS8p_IeEo'
const clip=(x)=>String(x).padStart(11,'0')
function fixture(n=84,free=58){
  const candidates=Array.from({length:n},(_,i)=>({
    videoId:clip(i),videoTitle:'Film '+i,
    channelId:'UCsource',channelTitle:'YouTube Movies',
    status:'review-tmdb-work-identity',screened:true,
    deRegionSignal:'unknown',minutes:90,
    playlistModes:[i<free?'free':'rent-buy'],
    playlistIds:[i<free?FREE:RB],
    editorialOfferHint:i<free?'free':'rent-buy',
    accepted:false,toImport:false,playbackRoute:null,verifiedOfferType:null,
  }))
  const audit={
    mode:'CURATED_TWO_PLAYLISTS_READ_ONLY',observedAt:NOW,fullyScanned:true,
    publicationPermitted:false,uniqueVideoIds:n,
    playlistSummaries:[
      {mode:'free',playlistId:FREE,fullyScanned:true},
      {mode:'rent-buy',playlistId:RB,fullyScanned:true},
    ],
    candidates,catalogWrites:0,firestoreWrites:0,providerWrites:0,
    badgeWrites:0,nightlyWrites:0,
  }
  const rows=candidates.map((c,i)=>({
    videoId:c.videoId,videoTitle:c.videoTitle,
    playlistModes:[...c.playlistModes],
    editorialOfferHint:c.editorialOfferHint,sourceStatus:c.status,
    hasPlaylistOverlap:false,hasPlaylistOfferConflict:false,
    matchStatus:'review-leading-film-hypothesis',identityRisk:null,
    publicIndexMembership:i===0?'public-present':i%2?'public-not-present':'unknown',
    topCandidates:[{tmdbId:10586+i,score:40,titleLevel:4,runtimeDelta:1,
      yearMismatch:false,sequelConflict:false}],
    alternativeTvIds:[],errors:[],publicationPermitted:false,
    verifiedTmdbId:null,verifiedOfferType:null,playbackRoute:null,
  }))
  const research={summary:{
    mode:'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY',
    generatedAt:NOW,sourceQAObservedAt:NOW,
    sourceVideoIds:n,processedRows:n,publicIndexOnly:true,
    verifiedFilms:0,verifiedDEOffers:0,newMovieImports:0,
    publicationPermitted:false,catalogWrites:0,firestoreWrites:0,
    providerWrites:0,badgeWrites:0,nightlyWrites:0,
  },rows}
  return {source:{audit},research}
}
describe('full 100%-coverage YouTube G2 intake staging – user FREE/R&B source rules',()=>{
  it('stages every video once, full 84 of 84 and 58 FREE / 26 R&B, without importing an unverified film',()=>{
    const {source,research}=fixture()
    const plan=planCompleteYoutubePlaylistIntake(source,research,{now:NOW})
    expect(plan).toMatchObject({
      fullScan:true,twoUserDefinedPlaylists:true,
      uniqueVideoIds:84,processedVideoIds:84,unaccountedForVideoIds:0,
      playlistClasses:{FREE:58,'R&B':26},
      existingMovieEditorialLinks:1,newCatalogTitlesImported:0,
      productionAvailabilityRecords:0,independentlyVerifiedDEOffers:0,
      catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,
      publicationPermitted:false,
    })
    expect(plan.items.map(x=>x.videoId)).toEqual(source.audit.candidates.map(x=>x.videoId))
    expect(new Set(plan.items.map(x=>x.videoId)).size).toBe(84)
    expect(plan.items.filter(x=>x.automatedCatalogImport)).toHaveLength(0)
    expect(plan.items[0].stage).toBe('linked-existing-editorial')
    expect(plan.items[1].stage).toBe('not-in-public-index-check-complete-catalog')
    expect(plan.items[2].stage).toBe('work-identity-unresolved')
    expect(plan.items[0].existingEditorialLink).toMatchObject({tmdbId:10586,videoId:clip(0)})
    const report=completeYoutubeIntakeReport(plan)
    expect(report).toContain('84')
    expect(report).toContain('58')
    expect(report).toContain('0 new catalog movies')
    expect(report.split('\n').filter(l=>l.startsWith('| 0000000'))).toHaveLength(84)
  })
  it('enforces FREE priority for same ID in both playlists',()=>{
    const {source,research}=fixture(2,1)
    source.audit.candidates[0].playlistModes.push('rent-buy')
    source.audit.candidates[0].playlistIds.push(RB)
    research.rows[0].playlistModes.push('rent-buy')
    research.rows[0].hasPlaylistOverlap=true
    const plan=planCompleteYoutubePlaylistIntake(source,research,{now:NOW})
    expect(plan.items[0].playlistClass).toBe('FREE')
    expect(plan.items[0].playlistModes).toEqual(['free','rent-buy'])
  })
  it('keeps unavailable video details and equivocal film identities in review',()=>{
    const {source,research}=fixture(3,2)
    const c=source.audit.candidates[0]
    c.videoTitle=null;c.screened=false;c.status='review-video-missing-or-private'
    research.rows[0].videoTitle='';research.rows[0].sourceStatus=c.status
    research.rows[0].matchStatus='review-no-eligible-video-details'
    research.rows[0].publicIndexMembership='unknown'
    research.rows[0].topCandidates=[]
    research.rows[1].topCandidates=[
      {...research.rows[1].topCandidates[0]},
      {...research.rows[1].topCandidates[0],tmdbId:999},
    ]
    const plan=planCompleteYoutubePlaylistIntake(source,research,{now:NOW})
    expect(plan.items.map(x=>x.stage)).toEqual([
      'video-details-or-screening-review',
      'not-in-public-index-check-complete-catalog',
      'work-identity-unresolved',
    ])
    expect(plan.items[0].newCatalogTitleCreated).toBe(false)
    expect(plan.items[1].automatedCatalogImport).toBe(false)
  })
  it('does not confuse absent PUBLIC index membership with confirmed new film',()=>{
    const {source,research}=fixture(1,1)
    research.rows[0].publicIndexMembership='public-not-present'
    const plan=planCompleteYoutubePlaylistIntake(source,research,{now:NOW})
    expect(plan.existingMovieEditorialLinks).toBe(0)
    expect(plan.items[0].stage).toBe('not-in-public-index-check-complete-catalog')
    expect(plan.items[0].newCatalogTitleCreated).toBe(false)
  })
  it('refuses missing, duplicate, stale, untrusted and reordered source identities',()=>{
    let {source,research}=fixture(3,2)
    research.rows.pop()
    expect(()=>planCompleteYoutubePlaylistIntake(source,research,{now:NOW})).toThrow()
    ;({source,research}=fixture(3,2))
    research.rows[1].videoId=research.rows[0].videoId
    expect(()=>planCompleteYoutubePlaylistIntake(source,research,{now:NOW})).toThrow()
    ;({source,research}=fixture(3,2))
    source.audit.candidates[0].videoTitle='different work'
    expect(()=>planCompleteYoutubePlaylistIntake(source,research,{now:NOW})).toThrow()
    ;({source,research}=fixture(3,2))
    source.audit.publicationPermitted=true
    expect(()=>planCompleteYoutubePlaylistIntake(source,research,{now:NOW})).toThrow()
    ;({source,research}=fixture(3,2))
    expect(()=>planCompleteYoutubePlaylistIntake(source,research,{
      now:'2026-11-09T13:30:00Z',
    })).toThrow()
  })
  it('uses same established editorial projection as the MovieHub provider badge without writing it',()=>{
    const {source,research}=fixture(1,1)
    const idx=buildCuratedEditorialTitleIndex(source,research,{now:NOW})
    const plan=planCompleteYoutubePlaylistIntake(source,research,{now:NOW})
    expect(idx.count).toBe(plan.existingMovieEditorialLinks)
    expect(plan.items[0].existingEditorialLink.target).toBe(idx.entries[0].watchUrl)
  })
})
