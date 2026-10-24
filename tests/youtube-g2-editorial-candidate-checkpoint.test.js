import {describe,it,expect} from 'vitest'
import {
  validateCandidateCheckpoint,mergeEditorialPlaylistCandidates,
} from '../scripts/youtube-g2-durable-candidate-checkpoint.mjs'
const now='2026-10-24T16:00:00.000Z'
const original=()=>validateCandidateCheckpoint({
  kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
  createdAt:'2026-10-24T14:00:00.000Z',updatedAt:'2026-10-24T14:00:00.000Z',
  evidenceStatus:'candidate-only-not-independent-DE-offer',
  verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
  entries:[{tmdbId:100,videoIds:['ABC12345678'],
    provenance:[{kind:'original-trusted-25-film-archive',runId:40086393094}]}],
})
const item=(id,filmId,klass='FREE',published=true)=>({
  videoId:id,playlistClass:klass,
  url:'https://www.youtube.com/watch?v='+id,
  sourceVerifiedDEOffer:false,
  suggestedTmdbId:filmId,
  priority:published?0:1,
  lane:published?'existing-movie-linked':'ambiguous-work-identity',
  competingVideoIds:[],
  tmdbAlternatives:[{tmdbId:filmId,score:40,titleLevel:4}],
  publicationStatus:published?'playlist-link-published':'review-only',
})
const reviewed=()=>({
  kind:'moviehub-youtube-g2-actionable-review-queue',schemaVersion:1,
  privateArtifact:true,publicationPermitted:false,
  sourceVideoIds:3,accountedForVideos:3,missingVideos:0,
  declaredClasses:{FREE:2,'R&B':1},
  publishedPlaylistLinks:2,pendingReview:1,
  independentVerifiedDEOffers:0,newUnverifiedDatabaseWrites:0,
  items:[
    item('Def12345678',200),
    item('Ghi12345678',100,'R&B'),
    item('Jkl12345678',300,'FREE',false),
  ],
})
describe('Add already published FREE/R&B movie hypotheses to private durable TMDB cache',()=>{
  it('adds only linked exact film/video IDs, never unresolved playlist IDs or a DE offer',()=>{
    const r=mergeEditorialPlaylistCandidates(original(),reviewed(),
      {runId:40108251915,now})
    expect(r).toMatchObject({sourceRun:40108251915,newMovies:1,newIds:2,
      editorialLinksReviewed:2,sourceVideos:3,movies:2})
    expect(r.checkpoint.entries.find(e=>e.tmdbId===100).videoIds)
      .toEqual(['ABC12345678','Ghi12345678'])
    expect(r.checkpoint.entries.find(e=>e.tmdbId===200).videoIds)
      .toEqual(['Def12345678'])
    expect(r.checkpoint.entries.some(e=>e.tmdbId===300)).toBe(false)
    expect(r.checkpoint.verifiedDEOffers).toBe(0)
    expect(r.checkpoint.approvedDirectRoutes).toBe(0)
    expect(r.checkpoint.productionWrites).toBe(0)
    expect(r.checkpoint.entries.find(e=>e.tmdbId===200).provenance)
      .toEqual([{kind:'published-editorial-playlist-hint',runId:40108251915}])
  })
  it('replaying same private QA is idempotent and does not duplicate candidate IDs',()=>{
    const first=mergeEditorialPlaylistCandidates(original(),reviewed(),{runId:40108251915,now})
    const next=mergeEditorialPlaylistCandidates(first.checkpoint,reviewed(),
      {runId:40108251915,now:'2026-10-24T16:10:00Z'})
    expect(next.newMovies).toBe(0)
    expect(next.newIds).toBe(0)
    expect(next.movies).toBe(2)
  })
  it('fails closed on altered counts, forged DE approvals, invented TMDB IDs and video URLs',()=>{
    const base=original()
    const invalid=[
      q=>{q.privateArtifact=false},
      q=>{q.publicationPermitted=true},
      q=>{q.independentVerifiedDEOffers=1},
      q=>{q.newUnverifiedDatabaseWrites=1},
      q=>{q.accountedForVideos=2},
      q=>{q.publishedPlaylistLinks=3},
      q=>{q.pendingReview=0},
      q=>{q.declaredClasses.FREE=4},
      q=>{q.items[0].sourceVerifiedDEOffer=true},
      q=>{q.items[0].suggestedTmdbId=null},
      q=>{q.items[0].tmdbAlternatives[0].tmdbId=201},
      q=>{q.items[0].publicationStatus='review-only'},
      q=>{q.items[0].competingVideoIds=['Other123456']},
      q=>{q.items[0].url='https://not-youtube.example/'},
      q=>{q.items[1].suggestedTmdbId=200},
      q=>{q.items[1].videoId=q.items[0].videoId},
      q=>{q.items[1].playlistClass='unknown'},
    ]
    for(const change of invalid){
      const q=reviewed();change(q)
      expect(()=>mergeEditorialPlaylistCandidates(base,q,
        {runId:40108251915,now})).toThrow()
    }
  })
})
