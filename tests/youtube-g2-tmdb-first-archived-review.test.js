import {describe,it,expect} from 'vitest'
import {TMDB_FIRST_GOLDEN} from '../scripts/youtube-g2-quality-golden.mjs'
import {
  ARCHIVED_SOURCE_RUN,ARCHIVED_SOURCE_HEAD_SHA,
  buildArchivedTmdbFirstReview,renderArchivedTmdbFirstReview,
} from '../scripts/youtube-g2-tmdb-first-archived-review.mjs'
const status={single:'review-single-video-candidate',
  multiple:'review-multiple-video-editions',
  unresolved:'review-weak-or-unresolved-videos'}
function fixture(){
  const rows=TMDB_FIRST_GOLDEN.map((g,i)=>({
    tmdbId:g.tmdbId,title:'Test '+g.tmdbId,
    mediaType:'movie',status:status[g.observedClass],
    videoCandidates:[
      {videoId:g.leadVideoId,strong:g.observedClass!=='unresolved',
        channelTitle:'Offline fixture source',videoTitle:'Original candidate'},
      ...(g.observedClass==='multiple'
        ?[{videoId:'Alt'+String(i).padStart(8,'0'),strong:true,
          channelTitle:'Alternate source',videoTitle:'Alternate edition'}]:[]),
    ],
    tmdbDeOfferTypes:['rent'],reviewedVideoId:null,
    directPlaybackRoute:null,publicationPermitted:false,
  }))
  const counts=Object.fromEntries([...new Set(Object.values(status))]
    .map(s=>[s,rows.filter(r=>r.status===s).length]))
  return {
    summary:{
      mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',
      historicalCohortMovies:25,historicalCohortAccountedFor:25,
      selectedMovies:25,processedMovies:25,
      historicalPublicBadgeMissingIds:[],
      fullAccountInventory:'not-loaded',
      priorDeviceCandidatesApprovedAsOffers:0,
      calls:{youtubeSearches:50,youtubeVideoLookups:10,tmdbGetRequests:51},
      statusCounts:counts,
      publicationPermitted:false,verifiedDirectLinks:0,verifiedSeriesEpisodes:0,
      catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,
      nightlyWrites:0,
    },rows,
  }
}
describe('offline archival TMDB-first Golden reviewer: no API or offer writes',()=>{
  it('checks the complete original 25 exact work IDs and all candidates',()=>{
    const result=buildArchivedTmdbFirstReview(fixture())
    expect(result.summary).toMatchObject({
      sourceRun:ARCHIVED_SOURCE_RUN,sourceCommit:ARCHIVED_SOURCE_HEAD_SHA,
      historicalCohort:25,actuallyResearchedInHistoricalRun:25,
      historicalSearchCalls:50,currentYoutubeSearchCalls:0,
      currentYoutubeVideoLookups:0,rawCandidateCount:31,distinctVideoIds:31,
      approvedGermanOffers:0,publishedDirectRoutes:0,
      firestoreWrites:0,catalogWrites:0,providerWrites:0,badgeWrites:0,
    })
    expect(result.review.items).toHaveLength(25)
    expect(result.review.items.every(x=>x.candidateVideos.length>=1
      &&x.publicationPermitted===false
      &&x.playbackRoute===null)).toBe(true)
    expect(result.comparison.reviewDeltas).toHaveLength(0)
    expect(renderArchivedTmdbFirstReview(result)).toContain('0-mal')
    expect(renderArchivedTmdbFirstReview(result)).toContain('25/25')
  })
  it('rejects incomplete, rewritten, overbudgeted or route-approved QA before output',()=>{
    const mutations=[
      x=>{x.rows.pop();x.summary.selectedMovies=24},
      x=>{x.rows[0].tmdbId=1},
      x=>{x.summary.historicalCohortMovies=24},
      x=>{x.summary.fullAccountInventory='all-users'},
      x=>{x.summary.calls.youtubeSearches=51},
      x=>{x.summary.calls.youtubeVideoLookups=12},
      x=>{x.summary.calls.tmdbGetRequests=52},
      x=>{x.summary.priorDeviceCandidatesApprovedAsOffers=1},
      x=>{x.summary.firestoreWrites=1},
      x=>{x.rows[0].directPlaybackRoute='https://www.youtube.com/watch?v=abcdefghijk'},
      x=>{x.rows[0].videoCandidates[0].videoId='invalid'},
    ]
    for(const mutate of mutations){
      const qa=fixture();mutate(qa)
      expect(()=>buildArchivedTmdbFirstReview(qa)).toThrow()
    }
  })
  it('preserves all original candidates even after the third, without approving them',()=>{
    const qa=fixture()
    const target=qa.rows.find(r=>r.status==='review-multiple-video-editions')
    for(const id of ['Extra000001','Extra000002','Extra000003']){
      target.videoCandidates.push({videoId:id,strong:false,
        channelTitle:'Unverified extra uploader',videoTitle:'Possible short'})
    }
    const result=buildArchivedTmdbFirstReview(qa)
    const review=result.review.items.find(r=>r.tmdbId===target.tmdbId)
    expect(review.candidateVideos.map(c=>c.videoId))
      .toEqual(target.videoCandidates.map(c=>c.videoId))
    expect(result.summary.rawCandidateCount).toBe(34)
    expect(result.review.approvedDirectLinks).toBe(0)
  })
})
