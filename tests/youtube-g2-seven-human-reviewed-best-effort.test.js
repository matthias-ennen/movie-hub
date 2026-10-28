/**
 * Regression examples derived from seven USER-confirmed MovieHub YouTube film
 * destinations and their read-only 2026-10-26 TMDB-first matcher scoring.
 *
 * Video IDs below are deliberately SYNTHETIC. The original private source
 * artifacts and underlying watch URLs are not copied into the repository.
 * Human confirmation here is a matcher QA observation, NOT a rights,
 * DE-playback, storefront tariff or independent-offer approval.
 */
import {describe,it,expect} from 'vitest'
import {
  buildYoutubeBestEffortLinkIndex,selectYoutubeBestEffortTitleRoute,
} from '../src/providers/youtubeBestEffortRouteIndex.js'

const REVIEWED_AT='2026-10-26T14:13:04.000Z'
const REPLAYED_AT='2026-10-26T15:00:00.000Z'
// These seven TMDB identities, matcher scores, competing scores and runtime
// deltas were observed in the successful global-known, zero-search review.
// Only the anonymous candidate IDs below are synthetic.
const humanConfirmed=[
  {tmdbId:12,title:'Findet Nemo',score:40,delta:0.9,runnerUp:8},
  {tmdbId:13,title:'Forrest Gump',score:40,delta:0.1,runnerUp:8},
  {tmdbId:14,title:'American Beauty',score:40,delta:0.3,runnerUp:6},
  {tmdbId:18,title:'Das fünfte Element',score:40,delta:0.1,runnerUp:8},
  {tmdbId:425134,title:'How to Be a Latin Lover',score:38,delta:5.7,runnerUp:23},
  {tmdbId:121986,title:'Frances Ha',score:38,delta:3.4,runnerUp:8},
  {tmdbId:50671,title:'The Resident',score:38,delta:3.8,runnerUp:null},
]
const syntheticId=(index,prefix='Q')=>prefix+String(index+1).padStart(10,'0')
const rowFor=(observation,index)=>({
  tmdbId:observation.tmdbId,
  status:'review-single-video-candidate',
  candidateDiscoveryMode:'trusted-previous-candidate-ids',
  tmdbDeOfferTypes:['rent','buy'],
  publicationPermitted:false,directPlaybackRoute:null,reviewedVideoId:null,
  videoCandidates:[
    {
      videoId:syntheticId(index),
      score:observation.score,titleLevel:4,runtimeDelta:observation.delta,
      strong:true,yearMismatch:false,sequelConflict:false,
      sourceTypeRisk:false,regionSignal:'allowed',
    },
    ...(observation.runnerUp===null?[]:[{
      videoId:syntheticId(index,'R'),
      score:observation.runnerUp,titleLevel:0,runtimeDelta:1,
      strong:false,yearMismatch:false,sequelConflict:false,
      sourceTypeRisk:false,regionSignal:'unknown',
    }]),
  ],
})
const review=()=>({
  summary:{
    kind:'moviehub-youtube-g2-global-known-video-no-search-recheck',
    generatedAt:REVIEWED_AT,rowsChecked:humanConfirmed.length,
    searchCalls:0,privateReviewArtifact:true,publicationPermitted:false,
    independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
    firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
  },
  rows:humanConfirmed.map(rowFor),
})

describe('seven human-confirmed movie matcher results (offline, anonymous IDs)',()=>{
  it('retains all seven separately matched film identities as unverified best-effort links',()=>{
    const output=buildYoutubeBestEffortLinkIndex(review(),{now:REPLAYED_AT})
    expect(output.count).toBe(7)
    expect(output.verifiedDEOffers).toBe(0)
    expect(output.verifiedPlaybackRoutes).toBe(0)
    expect(output.claimedOfferTypes).toEqual([])
    expect(new Set(output.entries.map(e=>e.key)).size).toBe(7)
    expect(new Set(output.entries.map(e=>e.videoId)).size).toBe(7)
    for(let index=0;index<humanConfirmed.length;index++){
      const observation=humanConfirmed[index]
      const film={type:'movie',tmdbId:observation.tmdbId,
        title:observation.title}
      const route=selectYoutubeBestEffortTitleRoute(output,film,{
        now:Date.parse(REPLAYED_AT),hasYoutubeBadge:true,
      })
      expect(output.entries.find(e=>e.tmdbId===observation.tmdbId))
        .toMatchObject({
          key:'movie:'+observation.tmdbId,score:observation.score,
          rankMargin:observation.runnerUp===null
            ?null:observation.score-observation.runnerUp,
          quality:'probable-video-not-verified',
        })
      expect(route).toMatchObject({
        providerId:'youtube',mode:'APP_DEEP_LINK',scope:'title',
        videoId:syntheticId(index),
        verificationStatus:'best-effort-not-verified',
      })
      expect(selectYoutubeBestEffortTitleRoute(output,film,{
        now:Date.parse(REPLAYED_AT),hasYoutubeBadge:false,
      })).toBeNull()
    }
  })

  it('quarantines each confirmed film if its current evidence becomes unsafe',()=>{
    const degrade=[
      candidate=>{candidate.strong=false},
      candidate=>{candidate.titleLevel=3},
      candidate=>{candidate.yearMismatch=true},
      candidate=>{candidate.runtimeDelta=16},
      candidate=>{candidate.sourceTypeRisk=true},
    ]
    for(let index=0;index<humanConfirmed.length;index++){
      for(const unsafe of degrade){
        const copy=review()
        unsafe(copy.rows[index].videoCandidates[0])
        const output=buildYoutubeBestEffortLinkIndex(copy,{now:REPLAYED_AT})
        expect(output.count).toBe(6)
        expect(output.entries.some(e=>e.tmdbId===humanConfirmed[index].tmdbId))
          .toBe(false)
      }
    }
  })

  it('quarantines every reviewed film when the nearest competitor becomes ambiguous',()=>{
    for(let index=0;index<humanConfirmed.length;index++){
      const copy=review(),row=copy.rows[index]
      const first=row.videoCandidates[0]
      const competitor={
        videoId:syntheticId(index,'Z'),
        score:first.score-7,titleLevel:4,runtimeDelta:1,
        strong:false,yearMismatch:false,sequelConflict:false,
        sourceTypeRisk:false,regionSignal:'unknown',
      }
      if(row.videoCandidates.length===1)row.videoCandidates.push(competitor)
      else row.videoCandidates[1]=competitor
      const output=buildYoutubeBestEffortLinkIndex(copy,{now:REPLAYED_AT})
      expect(output.count).toBe(6)
      expect(output.entries.some(e=>e.tmdbId===humanConfirmed[index].tmdbId))
        .toBe(false)
    }
  })

  it('never upgrades a user-confirmed link into an independent DE offer',()=>{
    const copy=review()
    copy.rows[0].tmdbDeOfferTypes=[]
    expect(buildYoutubeBestEffortLinkIndex(copy,{now:REPLAYED_AT}).count).toBe(6)
    for(const change of [
      x=>{x.summary.independentlyVerifiedDeOffers=1},
      x=>{x.summary.publicationPermitted=true},
      x=>{x.summary.searchCalls=1},
      x=>{x.rows[0].reviewedVideoId=syntheticId(0)},
      x=>{x.rows[0].directPlaybackRoute={target:'unexpected'}},
    ]){
      const forged=review()
      change(forged)
      expect(()=>buildYoutubeBestEffortLinkIndex(forged,{now:REPLAYED_AT}))
        .toThrow('YOUTUBE_BEST_EFFORT_PRIVATE_QA_INVALID_OR_STALE')
    }
  })
})
