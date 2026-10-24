import {describe,it,expect} from 'vitest'
import {
  TMDB_FIRST_GOLDEN,PLAYLIST_FIRST_GOLDEN,
  REMOVED_UNAUTHORIZED_FREE_VIDEO_ID,KNOWN_SEARCH_MISS,
  validateG2QualityGoldenManifest,compareTmdbFirstPilotToGolden,
  comparePlaylistReviewToGolden,buildG2QualityGoldenReport,
} from '../scripts/youtube-g2-quality-golden.mjs'

const priorPilot=()=>({
  summary:{
    mode:'TMDB_FIRST_LINK_RESEARCH_ONLY',processedMovies:25,
    publicationPermitted:false,verifiedDirectLinks:0,verifiedSeriesEpisodes:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
  },
  rows:TMDB_FIRST_GOLDEN.map(g=>({
    tmdbId:g.tmdbId,status:{
      single:'review-single-video-candidate',
      multiple:'review-multiple-video-editions',
      unresolved:'review-weak-or-unresolved-videos',
    }[g.observedClass],
    publicationPermitted:false,reviewedVideoId:null,directPlaybackRoute:null,
    videoCandidates:[{videoId:g.leadVideoId}],
  })),
})
const playlist=()=>({
  kind:'moviehub-youtube-g2-actionable-review-queue',
  privateArtifact:true,publicationPermitted:false,
  sourceVideoIds:PLAYLIST_FIRST_GOLDEN.length,
  accountedForVideos:PLAYLIST_FIRST_GOLDEN.length,missingVideos:0,
  publishedPlaylistLinks:PLAYLIST_FIRST_GOLDEN
    .filter(g=>['existing-movie-linked','new-movie-published'].includes(g.observedLane)).length,
  pendingReview:PLAYLIST_FIRST_GOLDEN
    .filter(g=>!['existing-movie-linked','new-movie-published'].includes(g.observedLane)).length,
  independentVerifiedDEOffers:0,
  items:PLAYLIST_FIRST_GOLDEN.map(g=>({
    videoId:g.videoId,lane:g.observedLane,sourceVerifiedDEOffer:false,
    publicationStatus:['existing-movie-linked','new-movie-published'].includes(g.observedLane)
      ?'playlist-link-published':'review-only',
  })),
})
describe('G2 golden anchors from original LIVE 25 TMDB and 87 playlist cases',()=>{
  it('pins actual review distribution but never calls a score a verified DE offer',()=>{
    expect(validateG2QualityGoldenManifest()).toEqual({
      single:13,multiple:6,unresolved:6,
    })
    expect(TMDB_FIRST_GOLDEN).toHaveLength(25)
    expect(PLAYLIST_FIRST_GOLDEN.length).toBeGreaterThanOrEqual(25)
    expect(TMDB_FIRST_GOLDEN.filter(x=>x.manualDevicePlaybackReported)
      .map(x=>x.tmdbId).sort()).toEqual([238,872585])
    expect(TMDB_FIRST_GOLDEN.every(x=>x.independentlyVerifiedDeOffer===false)).toBe(true)
    expect(PLAYLIST_FIRST_GOLDEN.every(x=>x.independentlyVerifiedDeOffer===false)).toBe(true)
    expect(PLAYLIST_FIRST_GOLDEN.map(x=>x.videoId))
      .not.toContain(REMOVED_UNAUTHORIZED_FREE_VIDEO_ID)
    expect(KNOWN_SEARCH_MISS).toMatchObject({
      tmdbId:9479,observedExactVideoId:'nJf67zNZhoc',
    })
    expect(TMDB_FIRST_GOLDEN.find(x=>x.tmdbId===9479).leadVideoId)
      .not.toBe(KNOWN_SEARCH_MISS.observedExactVideoId)
  })
  it('reconciles all 25 unverified pilot candidates exactly against observed baseline',()=>{
    const p=compareTmdbFirstPilotToGolden(priorPilot())
    expect(p).toMatchObject({
      selected:25,observedSameClass:25,observedSameLeadVideoId:25,
      reviewDeltas:[],independentlyVerifiedDEOffers:0,directLinksAutoApproved:0,
    })
  })
  it('reports drift when search changes a candidate; does not silently publish',()=>{
    const changed=priorPilot()
    changed.rows[0].status='review-single-video-candidate'
    changed.rows[1].videoCandidates=[{videoId:'Abc12345678'}]
    const result=compareTmdbFirstPilotToGolden(changed)
    expect(result.reviewDeltas).toHaveLength(2)
    expect(result.reviewDeltas[0].tmdbId).toBe(9479)
    expect(result.reviewDeltas[1].tmdbId).toBe(238)
    expect(result.directLinksAutoApproved).toBe(0)
  })
  it('rejects forged verified player routes and private writes on old pilot data',()=>{
    for(const mutate of [
      r=>{r.rows[0].directPlaybackRoute={target:'https://www.youtube.com/watch?v=nJf67zNZhoc'}},
      r=>{r.rows[0].reviewedVideoId='nJf67zNZhoc'},
      r=>{r.summary.verifiedDirectLinks=1},
      r=>{r.summary.firestoreWrites=1},
      r=>{r.rows[0].tmdbId=r.rows[1].tmdbId},
    ]){
      const data=priorPilot();mutate(data)
      expect(()=>compareTmdbFirstPilotToGolden(data)).toThrow()
    }
  })
  it('keeps missing details, region exclusions, cuts and film/TV collision anchors in review',()=>{
    const data=playlist()
    const r=comparePlaylistReviewToGolden(data)
    expect(r.historicalSampleSize).toBe(PLAYLIST_FIRST_GOLDEN.length)
    expect(r.anchorsAbsent).toBe(0)
    expect(r.unchangedAnchors).toBe(PLAYLIST_FIRST_GOLDEN.length)
    expect(r.changedAnchors).toBe(0)
    expect(r.removedUnauthorizedFreeUploadPresent).toBe(false)
    expect(r.userTestedPositiveAnchorsPresent).toBe(3)
    const lanes=new Set(data.items.map(x=>x.lane))
    for(const lane of ['region-excluded','short-video-not-full-film',
      'missing-video-metadata','movie-versus-series','ambiguous-work-identity',
      'edition-or-source-conflict']){
      expect(lanes.has(lane)).toBe(true)
    }
  })
  it('recognizes a changed lane as a new review requirement, not an approval',()=>{
    const data=playlist()
    const row=data.items.find(x=>x.videoId==='70DVMOSzN3E')
    row.lane='matcher-needs-review'
    const r=comparePlaylistReviewToGolden(data)
    expect(r.changedAnchors).toBe(1)
    expect(r.reviewDeltas[0]).toMatchObject({
      videoId:'70DVMOSzN3E',previousLane:'movie-versus-series',
      observedLane:'matcher-needs-review',
      disposition:'review-delta-not-automatic-approval',
    })
    expect(r.automaticApprovals).toBe(0)
  })
  it('a removed video stays absent; reappearance is flagged for explicit review',()=>{
    const data=playlist()
    const removed=data.items.pop()
    data.sourceVideoIds--;data.accountedForVideos--
    data.pendingReview--
    const result=comparePlaylistReviewToGolden(data)
    expect(result.anchorsAbsent).toBe(1)
    expect(result.absentSourceIds).toContain(removed.videoId)
    const add=playlist()
    add.items.push({
      videoId:REMOVED_UNAUTHORIZED_FREE_VIDEO_ID,
      publicationStatus:'review-only',lane:'ambiguous-work-identity',
      sourceVerifiedDEOffer:false,
    })
    add.sourceVideoIds++;add.accountedForVideos++;add.pendingReview++
    const flagged=comparePlaylistReviewToGolden(add)
    expect(flagged.removedUnauthorizedFreeUploadPresent).toBe(true)
    expect(flagged.removedUnauthorizedFreeUploadStatus)
      .toContain('requires-explicit-source-authorization-review')
  })
  it('fails closed on missing source identities or claims of independent verification',()=>{
    const mutations=[
      x=>x.items[0].sourceVerifiedDEOffer=true,
      x=>x.items[0].publicationStatus='approved',
      x=>x.missingVideos=1,
      x=>x.items[0].videoId=x.items[1].videoId,
      x=>x.independentVerifiedDEOffers=1,
      x=>x.publicationPermitted=true,
    ]
    for(const mut of mutations){
      const p=playlist();mut(p)
      expect(()=>comparePlaylistReviewToGolden(p)).toThrow()
    }
  })
  it('reports prior pilot as archival only when it was not rerun',()=>{
    const r=buildG2QualityGoldenReport({reviewQueue:playlist()})
    expect(r).toMatchObject({
      privateArtifact:true,publicationPermitted:false,quotaSearchApiCalls:0,
      tmdbFirst:{selected:25,liveRerunPerformed:false,
        historicalClassCounts:{single:13,multiple:6,unresolved:6}},
      playlistFirst:{changedAnchors:0,automaticApprovals:0},
      knownTmdbSearchFalseNegative:{tmdbId:9479},
    })
  })
})
