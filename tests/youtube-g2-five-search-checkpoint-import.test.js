import {describe,it,expect} from 'vitest'
import {
  validateCandidateCheckpoint,mergeFiveSearchCandidateCheckpoint,
} from '../scripts/youtube-g2-durable-candidate-checkpoint.mjs'

const now='2026-10-26T12:10:00.000Z',generatedAt='2026-10-26T12:00:00.000Z'
const id=i=>String(i).padStart(11,'A')
const old=()=>({
  kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
  createdAt:'2026-10-24T10:00:00Z',
  updatedAt:'2026-10-25T12:00:00Z',
  evidenceStatus:'candidate-only-not-independent-DE-offer',
  verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
  entries:[{tmdbId:100,videoIds:[id(100)],
    provenance:[{kind:'original-trusted-25-film-archive',runId:40086393094}]}],
})
const sample=()=>{
  const summary={
    kind:'moviehub-youtube-g2-five-search-public-badge-review',
    generatedAt,publicBadgedMovies:3054,cachedMovieCount:56,
    plannedMovies:5,completedMovies:5,
    youtubeSearchAttempts:5,youtubeVideoLookups:5,tmdbGetRequests:15,
    maximumSearchAttempts:5,noAutomaticRetry:true,
    searchIntervalMs:20000,dailyQuotaRemainingKnown:false,
    independentlyVerifiedDeOffers:0,directLinksPublished:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,
    badgeWrites:0,privateArtifact:true,publicationPermitted:false,
  }
  const qa={summary,rows:[201,202,203,204,205].map((tmdbId,i)=>({
    mediaType:'movie',tmdbId,
    status:'review-single-video-candidate',
    candidateDiscoveryMode:'new-search',
    tmdbDeOfferTypes:['buy'],
    videoCandidates:[{videoId:id(i+1),score:40,strong:true}],
    reviewedVideoId:null,directPlaybackRoute:null,
    publicationPermitted:false,
  }))}
  return {qa,summary:{...summary,complete:true}}
}
const merge=(source,o=old(),runId=40311122233,at=now)=>
  mergeFiveSearchCandidateCheckpoint(o,source.qa,source.summary,{sourceRun:runId,now:at})
describe('five-search private research -> durable CAS candidate checkpoint (no offer grants)',()=>{
  it('accepts successful exactly five-film read-only source; stores only IDs and provenance',()=>{
    const source=sample()
    const result=merge(source)
    expect(result).toMatchObject({
      newMovies:5,newIds:5,sourceRun:40311122233,movies:6,
      conflictingIds:0,independentlyVerifiedDeOffers:0,
      publishedPlaybackRoutes:0,publicationPermitted:false,
    })
    expect(result.checkpoint.entries.find(e=>e.tmdbId===201)).toEqual({
      tmdbId:201,videoIds:[id(1)],
      provenance:[{kind:'successful-readonly-five-search-batch',runId:40311122233}],
    })
    expect(result.checkpoint.entries).toHaveLength(6)
    expect(result.checkpoint.entries[0]).toEqual(old().entries[0])
    expect(validateCandidateCheckpoint(result.checkpoint)).toEqual(result.checkpoint)
    const text=JSON.stringify(result.checkpoint)
    for(const unsafe of ['candidateWatchUrl','rent','buy','score','title','channelTitle']){
      expect(text).not.toContain('"'+unsafe+'"')
    }
    expect(result.checkpoint.approvedDirectRoutes).toBe(0)
    expect(result.checkpoint.productionWrites).toBe(0)
  })
  it('never reuses VIDEO IDs across different film identities',()=>{
    const source=sample()
    source.qa.rows[0].videoCandidates[0].videoId=id(100)
    source.qa.rows[1].videoCandidates[0].videoId=id(3)
    const result=merge(source)
    expect(result).toMatchObject({newMovies:2,newIds:2,conflictingIds:4})
    expect(result.checkpoint.entries.find(e=>e.tmdbId===100).videoIds).toEqual([id(100)])
    expect(result.checkpoint.entries.some(e=>e.tmdbId===201)).toBe(false)
    expect(result.checkpoint.entries.some(e=>e.tmdbId===202)).toBe(false)
    expect(result.checkpoint.entries.some(e=>e.tmdbId===203)).toBe(false)
  })
  it('does not persist zero-video candidates or no longer current DE offers',()=>{
    const source=sample()
    source.qa.rows[0].videoCandidates=[]
    source.qa.rows[0].tmdbDeOfferTypes=[]
    source.qa.rows[0].status='no-current-tmdb-de-youtube-offer'
    source.qa.rows[0].candidateDiscoveryMode='no-current-tmdb-de-youtube-offer'
    const result=merge(source)
    expect(result).toMatchObject({newMovies:4,newIds:4,emptyMovies:1})
    expect(result.checkpoint.entries.some(e=>e.tmdbId===201)).toBe(false)
  })
  it('rejects forged, failed/partial, over-budget, old, cross-field or published QA before GCS',()=>{
    const changes=[
      x=>{x.summary.complete=false},
      x=>{x.summary.youtubeSearchAttempts=6},
      x=>{x.summary.maximumSearchAttempts=6},
      x=>{x.summary.publicationPermitted=true},
      x=>{x.summary.directLinksPublished=1},
      x=>{x.qa.summary.firestoreWrites=1},
      x=>{x.qa.rows[0].directPlaybackRoute='https://youtube.com/watch?v='+id(1)},
      x=>{x.qa.rows[0].reviewedVideoId=id(1)},
      x=>{x.qa.rows[0].tmdbDeOfferTypes=[]},
      x=>{x.qa.rows[0].videoCandidates=[{videoId:'bad'}]},
      x=>{x.qa.rows[1].tmdbId=201},
      x=>{x.qa.rows[1].tmdbId=11},
      x=>{x.qa.rows[0].candidateDiscoveryMode='trusted-previous-candidate-ids'},
      x=>{x.qa.rows[0].publicationPermitted=true},
      x=>{x.qa.rows.pop()},
      x=>{x.summary.generatedAt='2026-10-20T12:00:00Z';x.qa.summary.generatedAt=x.summary.generatedAt},
    ]
    for(const change of changes){
      const source=sample();change(source)
      expect(()=>merge(source)).toThrow('G2_FIVE_SEARCH_CHECKPOINT_SOURCE_NOT_TRUSTED')
    }
    expect(()=>merge(sample(),old(),0)).toThrow()
    expect(()=>merge(sample(),old(),40311122233,'2026-10-26T11:30:00Z')).toThrow()
  })
  it('a repeated authenticated source does not duplicate video IDs',()=>{
    const source=sample()
    const first=merge(source)
    const second=merge(source,first.checkpoint,40311122233,'2026-10-26T12:20:00.000Z')
    expect(second).toMatchObject({newMovies:0,newIds:0,movies:6})
    for(const entry of second.checkpoint.entries){
      expect(new Set(entry.videoIds).size).toBe(entry.videoIds.length)
      expect(entry.provenance).toHaveLength(1)
    }
  })
})
