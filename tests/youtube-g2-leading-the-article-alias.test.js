import {describe,it,expect} from 'vitest'
import {scoreCandidate} from '../scripts/youtube-g1-matcher-v1.mjs'
import {scoreCandidateV11} from '../scripts/youtube-g2-matcher-v1-1.mjs'
import {evaluateTmdbFirstYoutubeLinks}
  from '../scripts/youtube-g2-tmdb-first-link-model.mjs'

const movie=(tmdbId,title,original,runtime=201,year=1974)=>({
  id:tmdbId,title,original_title:original,runtime,
  release_date:year+'-12-20',alternative_titles:{titles:[]},credits:{crew:[]},
})
const src=(title,minutes=201)=>({
  title,minutes,category:'30',region:'allowed',
})
const raw=(title,id='CZCUCvmX8zs',duration='PT3H21M')=>({
  id,
  snippet:{title,channelId:'UCofficialFilmExample',
    channelTitle:'YouTube Movies',categoryId:'30',publishedAt:'2020-01-01T00:00:00Z'},
  contentDetails:{duration,regionRestriction:{allowed:['DE']}},
  status:{privacyStatus:'public'},
})

describe('AP2 full-original-title aliases with optional leading The',()=>{
  it('finds Godfather Part II from actual TMDB original The Godfather Part II',()=>{
    const film=movie(240,'Der Pate - Teil II','The Godfather Part II')
    const old=scoreCandidate(src('Godfather Part II'),film)
    const newer=scoreCandidateV11(src('Godfather Part II'),film)
    expect(old.titleLevel).toBe(2)
    expect(newer.titleLevel).toBe(4)
    expect(newer.titleReason).toBe('exact-title-omitting-leading-the')
    expect(newer.titleComparisonMode).toBe('cautious-omitted-leading-the')
    expect(newer.score-old.score).toBe(16)
    expect(newer.sequelConflict).toBe(false)
  })
  it('makes the full-work store video a strong TMDB-first RESEARCH candidate only',()=>{
    const seed={mediaType:'movie',tmdbId:240,title:'Der Pate - Teil II',year:1974}
    const f=movie(240,'Der Pate - Teil II','The Godfather Part II')
    const r=evaluateTmdbFirstYoutubeLinks(seed,f,['rent','buy'],[
      raw('Godfather Part II'),raw('The Godfather Part III','Abc12345678','PT2H45M'),
    ],{observedAt:'2026-10-24T10:50:00Z'})
    expect(r.status).toBe('review-single-video-candidate')
    expect(r.videoCandidates[0]).toMatchObject({
      videoId:'CZCUCvmX8zs',titleLevel:4,strong:true,yearMismatch:false,
    })
    expect(r.videoCandidates.find(x=>x.videoId==='Abc12345678')?.strong).toBe(false)
    expect(r.directPlaybackRoute).toBeNull()
    expect(r.reviewedVideoId).toBeNull()
    expect(r.publicationPermitted).toBe(false)
  })
  it('keeps subtitle-delimited publisher names in historical partial-work review',()=>{
    const film=movie(11111,
      'Special Unit AT 13 - Wettlauf mit dem Tod',
      'The Red Phone: Manhunt',96,2001)
    const scored=scoreCandidateV11(src('Red Phone - Manhunt (2001)',96),film)
    expect(scored.titleLevel).toBe(2)
    expect(scored.titleComparisonMode).not.toBe('cautious-omitted-leading-the')
    expect(scored.confirmedDEAvailability).toBe(false)
  })
  it('does not remove the article from one-word work names',()=>{
    const film=movie(1091,'Das Ding aus einer anderen Welt','The Thing',109,1982)
    const old=scoreCandidate(src('Thing',109),film)
    const next=scoreCandidateV11(src('Thing',109),film)
    expect(next.titleLevel).toBe(old.titleLevel)
    expect(next.titleComparisonMode).not.toBe('cautious-omitted-leading-the')
  })
  it('never upgrades a different sequel or another work sharing first words',()=>{
    const film=movie(240,'Der Pate - Teil II','The Godfather Part II')
    const wrong=scoreCandidateV11(src('Godfather Part III',201),film)
    expect(wrong.titleLevel).toBeLessThan(4)
    expect(wrong.sequelConflict).toBe(true)
    const rises=movie(49026,'The Dark Knight Rises','The Dark Knight Rises',165,2012)
    const notSame=scoreCandidateV11(src('Dark Knight',165),rises)
    expect(notSame.titleLevel).toBeLessThan(4)
  })
  it('retains an explicit conflicting release year as a hard matcher review gate',()=>{
    const film=movie(240,'Der Pate - Teil II','The Godfather Part II')
    const conflict=scoreCandidateV11(src('Godfather Part II (2020)'),film)
    expect(conflict.titleLevel).toBe(4)
    expect(conflict.yearMismatch).toBe(true)
    expect(conflict.movieIdAccepted).toBeNull()
    expect(conflict.confirmedDEAvailability).toBe(false)
  })
})
