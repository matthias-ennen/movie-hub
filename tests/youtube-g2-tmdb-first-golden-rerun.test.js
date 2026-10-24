import {describe,it,expect} from 'vitest'
import {
  planOriginalTmdbFirstGoldenReplay,formatTmdbFirstGoldenReplay,
  runTmdbFirstLinkPilot,
} from '../scripts/youtube-g2-tmdb-first-link-pilot.mjs'
import {TMDB_FIRST_GOLDEN,compareTmdbFirstPilotToGolden}
  from '../scripts/youtube-g2-quality-golden.mjs'

const now='2026-10-24T10:10:00Z'
const original=()=>TMDB_FIRST_GOLDEN.map(x=>({
  mediaType:'movie',tmdbId:x.tmdbId,
}))
describe('real TMDB-first golden replay cohort and comparison safeguards',()=>{
  it('pins the EXACT original 25 TMDB IDs, not a newly sampled current index',()=>{
    expect(planOriginalTmdbFirstGoldenReplay()).toEqual(original())
    expect(new Set(planOriginalTmdbFirstGoldenReplay().map(x=>x.tmdbId)).size).toBe(25)
    expect(planOriginalTmdbFirstGoldenReplay().map(x=>x.tmdbId))
      .toContain(9479)
  })
  it('compares real observation deltas without claiming new verified YouTube offers',()=>{
    const rows=TMDB_FIRST_GOLDEN.map(x=>({
      tmdbId:x.tmdbId,
      status:{single:'review-single-video-candidate',
        multiple:'review-multiple-video-editions',
        unresolved:'review-weak-or-unresolved-videos'}[x.observedClass],
      publicationPermitted:false,reviewedVideoId:null,
      directPlaybackRoute:null,videoCandidates:[{videoId:x.leadVideoId}],
    }))
    rows[0].status='review-single-video-candidate'
    const result={summary:{
      mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',processedMovies:25,
      statusCounts:{'review-single-video-candidate':14,
        'review-multiple-video-editions':6,'review-weak-or-unresolved-videos':5},
      calls:{youtubeSearches:50,youtubeVideoLookups:6,tmdbGetRequests:51},
      publicationPermitted:false,verifiedDirectLinks:0,
      verifiedSeriesEpisodes:0,catalogWrites:0,firestoreWrites:0,
      providerWrites:0,badgeWrites:0,nightlyWrites:0,
      priorDeviceCandidatesResearched:3,
      priorDeviceCandidatesMissingFromSearch:1,
      priorDeviceCandidatesResolvedViaVideoDetails:2,
      priorDeviceCandidatesInTop10:2,
    },rows}
    const compare=compareTmdbFirstPilotToGolden(result)
    expect(compare.reviewDeltas).toHaveLength(1)
    expect(compare.reviewDeltas[0].tmdbId).toBe(9479)
    const md=formatTmdbFirstGoldenReplay(compare,result)
    expect(md).toContain('Same status as original: 24/25')
    expect(md).toContain('Prior-device IDs absent from current search: 1')
    expect(md).toContain('Independent DE offers verified: 0')
    expect(md).toContain('TMDB 9479')
    expect(md).not.toContain('automatically published')
  })
  it('rejects false publication flags instead of comparing a fabricated 25-film replay',()=>{
    const pilot={summary:{mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',
      processedMovies:25,publicationPermitted:false,verifiedDirectLinks:0,
      verifiedSeriesEpisodes:0,catalogWrites:0,firestoreWrites:0,
      providerWrites:0,badgeWrites:0,nightlyWrites:0},
      rows:TMDB_FIRST_GOLDEN.map(x=>({
        tmdbId:x.tmdbId,publicationPermitted:false,directPlaybackRoute:null,
        reviewedVideoId:null,videoCandidates:[{videoId:x.leadVideoId}],
        status:{single:'review-single-video-candidate',
          multiple:'review-multiple-video-editions',
          unresolved:'review-weak-or-unresolved-videos'}[x.observedClass],
      })),
    }
    pilot.rows[0].directPlaybackRoute={mode:'APP_DEEP_LINK'}
    expect(()=>compareTmdbFirstPilotToGolden(pilot))
      .toThrow('YOUTUBE_G2_PILOT_REVIEW_LINK_UNSAFE_OR_MISSING')
    pilot.rows[0].directPlaybackRoute=null
    pilot.rows[0].reviewedVideoId='nJf67zNZhoc'
    expect(()=>compareTmdbFirstPilotToGolden(pilot))
      .toThrow('YOUTUBE_G2_PILOT_REVIEW_LINK_UNSAFE_OR_MISSING')
  })
})
