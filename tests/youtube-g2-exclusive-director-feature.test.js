import {describe,it,expect} from 'vitest'
import {explicitBilledDirector,applyExplicitDirectorGuard,
  hasExclusiveDirectorFeatureFilmEvidence} from '../scripts/youtube-g2-exclusive-director-evidence.mjs'

const sie="John Carpenter's Sie leben – ganzer Film auf Deutsch kostenlos schauen in HD"
const vampire='John Carpenters Vampire – ganzer Film auf Deutsch kostenlos schauen in HD'
const scored=[
  {tmdbId:8337,score:40,titleLevel:4,runtimeDelta:2.5,
    yearMismatch:false,sequelConflict:false},
  {tmdbId:44190,score:22,titleLevel:2,runtimeDelta:5.5,
    yearMismatch:false,sequelConflict:false},
  {tmdbId:24167,score:6,titleLevel:0,runtimeDelta:9.5,
    yearMismatch:false,sequelConflict:false},
]
const films=[
  {id:8337,credits:{crew:[{job:'Director',name:'John Carpenter'}]}},
  {id:44190,credits:{crew:[{job:'Director',name:'Somebody Else'}]}},
  {id:24167,credits:{crew:[{job:'Director',name:'Another Person'}]}},
]
function caseData(){
  const applied=applyExplicitDirectorGuard(sie,scored,films)
  const topCandidates=[...applied.scores].sort((a,b)=>b.score-a.score)
  const tvSearchEvidence={alternativeTvIds:[76497],candidates:[{
    tmdbTvId:76497,name:'True Women',originalName:'True Women',
    firstAirYear:1997,yearGap:9,titleOverlap:false,
    wholeFilmTitleMatch:false,disposition:'retained-for-film-tv-review',
  }]}
  const row={videoTitle:sie,sourceVideoDetailAvailable:true,
    matchStatus:'review-leading-movie-with-TV-alternatives',
    identityRisk:null,errors:[],alternativeTvIds:[76497],
    topCandidates,directorEvidence:applied.evidence,tvSearchEvidence}
  return {applied,row}
}
describe('YouTube G2: source-billed director is checked against TMDB credits',()=>{
  it('recognizes both source title spellings, but no trailer/anonymous/title-only case',()=>{
    expect(explicitBilledDirector(sie)).toBe('John Carpenter')
    expect(explicitBilledDirector(vampire)).toBe('John Carpenter')
    for(const t of [
      "John Carpenter's Sie leben Trailer",
      "John Carpenter's Sie leben – ganzer Film Trailer",
      'John Carpenters Vampire Teaser',
      'Stephen Kings Stark Horrorfilm Ganzer Film',
      'Sie leben', 'John Carpenter interview',
      'The Watcher Thriller mit Keanu Reeves Ganzer Film',
    ]){
      // Stephen King is an author, so matching heading grammar is not
      // sufficient to establish any film director; checked below.
      if(t.startsWith('Stephen'))continue
      expect(explicitBilledDirector(t)).toBeNull()
    }
    const byAuthor=applyExplicitDirectorGuard(
      'Stephen Kings Stark Horrorfilm Ganzer Film',scored,films)
    expect(byAuthor.evidence.affectsRanking).toBe(false)
  })
  it('independently corroborates ONLY John Carpenter for movie 8337 and rejects the distant fuzzy TV search hit',()=>{
    const {applied,row}=caseData()
    expect(applied.evidence).toMatchObject({
      director:'John Carpenter',evidence:'matched-exclusive-tmdb-director',
      creditedMovieIds:[8337],affectsRanking:true,
    })
    expect(row.topCandidates.map(c=>[c.tmdbId,c.score])).toEqual([
      [8337,52],[44190,2],[24167,-14],
    ])
    expect(hasExclusiveDirectorFeatureFilmEvidence(sie,row)).toBe(true)
  })
  it('preserves real Vampire title identity when a director is independently credited',()=>{
    const s=[{tmdbId:9945,score:40,titleLevel:4,runtimeDelta:0.3},
      {tmdbId:10605,score:16,titleLevel:2,runtimeDelta:17.7}]
    const f=[{id:9945,credits:{crew:[{job:'Director',name:'John Carpenter'}]}},
      {id:10605,credits:{crew:[{job:'Director',name:'Another Person'}]}}]
    expect(applyExplicitDirectorGuard(vampire,s,f).scores).toMatchObject([
      {tmdbId:9945,score:52},{tmdbId:10605,score:-4},
    ])
  })
  it('fails closed for missing/ambiguous directors, a genuine TV namesake or weak film identity',()=>{
    for(const filmsOverride of [
      [films[0],{id:44190,credits:{crew:[{job:'Director',name:'John Carpenter'}]}},films[2]],
      [films[0],{id:44190,credits:{}},films[2]],
      [{id:8337,credits:{crew:[]}},films[1],films[2]],
      [{id:8337,credits:{crew:[{job:'Writer',name:'John Carpenter'}]}},films[1],films[2]],
    ]){
      const result=applyExplicitDirectorGuard(sie,scored,filmsOverride)
      expect(result.evidence.affectsRanking).toBe(false)
      expect(result.scores).toEqual(scored)
    }
    const mutations=[
      r=>{r.directorEvidence.creditedMovieIds=[44190]},
      r=>{r.directorEvidence.evidence='none'},
      r=>{r.topCandidates[0].runtimeDelta=3.1},
      r=>{r.topCandidates[0].titleLevel=3},
      r=>{r.topCandidates[0].yearMismatch=true},
      r=>{r.topCandidates[1].titleLevel=4},
      r=>{r.topCandidates[1].score=18},
      r=>{r.topCandidates[1].creditedDirectorMatches=true},
      r=>{r.tvSearchEvidence.candidates[0].titleOverlap=true},
      r=>{r.tvSearchEvidence.candidates[0].wholeFilmTitleMatch=true},
      r=>{r.tvSearchEvidence.candidates[0].yearGap=4},
      r=>{r.tvSearchEvidence.candidates[0].firstAirYear=null},
      r=>{r.tvSearchEvidence.candidates[0].originalName=''},
      r=>{r.tvSearchEvidence.candidates[0].disposition='clearly-unrelated-search-hit'},
      r=>{r.alternativeTvIds=[76497,4]},
      r=>{r.errors.push('TMDB request failed')},
      r=>{r.identityRisk='explicit-unverified-cut-or-source'},
      r=>{r.sourceVideoDetailAvailable=false},
      r=>{r.matchStatus='review-multiple-film-works'},
      r=>{r.videoTitle=vampire},
    ]
    for(const mutate of mutations){
      const {row}=caseData()
      mutate(row)
      expect(hasExclusiveDirectorFeatureFilmEvidence(sie,row)).toBe(false)
    }
  })
})
