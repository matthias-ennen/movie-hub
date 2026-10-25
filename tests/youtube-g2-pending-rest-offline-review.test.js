import {describe,it,expect} from 'vitest'
import {renderPendingRestOfflineReview} from '../scripts/youtube-g2-pending-rest-offline-review.mjs'
import {OPEN55_KIND} from '../scripts/youtube-g2-pending-video-refresh.mjs'

const OTHER=[
  ['ambiguous-work-identity',16],
  ['movie-versus-series',11],
  ['missing-video-metadata',9],
  ['edition-or-source-conflict',6],
  ['new-release-content-check',4],
  ['region-excluded',1],
  ['short-video-not-full-film',1],
  ['unresolved-title',1],
]
const TOP=[
  ['existing-movie-needs-identity-proof',8337],
  ['existing-movie-needs-identity-proof',8922],
  ['search-only-needs-identity-proof',9742],
  ['search-only-needs-identity-proof',10042],
  ['search-only-needs-identity-proof',49530],
  ['matcher-needs-review',390051],
]
const count=(rows,key)=>Object.fromEntries([...new Set(rows.map(r=>r[key]))]
  .map(k=>[k,rows.filter(r=>r[key]===k).length]))
function source(){
  const tasks=[
    ...TOP.map(([lane,tmdbId])=>({lane,tmdbId,top:true})),
    ...OTHER.flatMap(([lane,n])=>Array.from({length:n},()=>({lane,tmdbId:null,top:false}))),
  ]
  const rows=tasks.map((r,i)=>{
    const status=r.lane==='missing-video-metadata'?'metadata-not-returned'
      :r.lane==='region-excluded'?'DE-excluded-metadata'
      :r.lane==='short-video-not-full-film'?'short-video-metadata'
      :'video-details-current'
    return {
      videoId:'v'+String(i+1).padStart(10,'0'),
      playlistClass:i%2===0?'FREE':'R&B',
      existingReviewLane:r.lane,priority:i+1,recordedSourceTitle:'Film '+(i+1),
      currentVideoTitle:'Film '+(i+1),videoStatus:status,
      regionSignal:status==='DE-excluded-metadata'?'DE-blocked-metadata':'not-stated',
      minutes:status==='metadata-not-returned'?null:99.5,
      suggestedTmdbId:r.tmdbId,
      alternatives:r.tmdbId===null?[]:[{tmdbId:r.tmdbId,title:'Test'}],
      identityReviewReady:r.top,
      approvedWorkIdentity:false,verifiedGermanOffer:false,
      approvedPlaybackRoute:null,
    }
  })
  const summary={
    kind:OPEN55_KIND,sourceVideoIds:87,publishedEditorialLinks:32,
    pendingVideoIds:55,videosListCalls:2,searchListCalls:0,
    readyForIndividualIdentityReview:6,verifiedGermanOffers:0,
    approvedDirectRoutes:0,firestoreWrites:0,catalogWrites:0,
    providerWrites:0,badgeWrites:0,
    generatedAt:'2026-10-24T17:45:22.239Z',
    privateArtifact:true,publicationPermitted:false,
    pendingLaneCounts:count(rows,'existingReviewLane'),
    videoStatusCounts:count(rows,'videoStatus'),
  }
  return {summary,rows,reviewPriority:rows.filter(r=>r.identityReviewReady)}
}
describe('49 remaining YouTube playlist review IDs: offline and fail-closed',()=>{
  it('rebuilds all 49 as separate protected tasks, apart from 6 prioritized films',()=>{
    const {summary,markdown}=renderPendingRestOfflineReview(source())
    expect(summary).toMatchObject({
      sourceRun:40115074408,sourceAttempt:2,
      sourceArtifactId:12569251342,originalPendingVideoIds:55,
      separateTopPriorityReview:6,remainingReviewIds:49,
      currentYouTubeCalls:0,currentYouTubeSearchCalls:0,
      independentGermanOffersApproved:0,directPlaybackRoutesApproved:0,
      publicationPermitted:false,privateArtifact:true,
      firestoreWrites:0,catalogWrites:0,providerWrites:0,
    })
    expect(Object.values(summary.remainingLaneCounts).reduce((a,b)=>a+b,0)).toBe(49)
    expect(markdown).toContain('49 weitere offene Prueffaelle')
    expect(markdown).toContain('## movie-versus-series (11)')
    expect(markdown).toContain('## missing-video-metadata (9)')
    expect(markdown).toContain('https://www.youtube.com/watch?v=v0000000007')
    expect(markdown).not.toContain('https://www.youtube.com/watch?v=v0000000001')
    expect((markdown.match(/- Exakte Video-ID:/g)||[]).length).toBe(49)
    expect(markdown).toContain('Fire-TV-Wiedergabe getrennt getestet')
    expect(markdown).toContain('keine DE-Wiedergabe- oder Filmfreigabe')
  })
  it('rejects source-gate, provenance, identity, status and lane forgery',()=>{
    const mutations=[
      q=>{q.summary.publicationPermitted=true},
      q=>{q.summary.verifiedGermanOffers=1},
      q=>{q.summary.firestoreWrites=1},
      q=>{q.summary.searchListCalls=1},
      q=>{q.summary.generatedAt='2026-10-29T00:00:00Z'},
      q=>{q.summary.pendingLaneCounts['movie-versus-series']--},
      q=>{q.summary.videoStatusCounts['video-details-current']--},
      q=>{q.rows[0].approvedPlaybackRoute='youtube://forged'},
      q=>{q.rows[6].approvedWorkIdentity=true},
      q=>{q.rows[7].verifiedGermanOffer=true},
      q=>{q.rows[8].videoId=q.rows[7].videoId},
      q=>{q.rows[10].existingReviewLane='unknown'},
      q=>{q.rows[10].videoStatus='approved'},
      q=>{q.rows[6].identityReviewReady=true},
      q=>{q.reviewPriority[0].suggestedTmdbId=9999},
      q=>{q.reviewPriority.pop()},
      q=>{q.rows.pop()},
    ]
    for(const mutation of mutations){
      const q=source()
      mutation(q)
      expect(()=>renderPendingRestOfflineReview(q)).toThrow()
    }
  })
})
