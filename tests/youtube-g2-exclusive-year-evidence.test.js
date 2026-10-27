import {describe,it,expect} from 'vitest'
import {hasExclusiveHistoricalYearFilmHypothesis} from '../scripts/youtube-g2-exclusive-year-film-evidence.mjs'
import {planCuratedTmdbQueries} from '../scripts/youtube-g2-curated-title-query-plan.mjs'

const timeTitle='Die Zeit Maschine - 1960'
const timeRow=()=>({
  videoTitle:timeTitle,reportedSourceYear:1960,
  curatedQueryReason:'time-machine-1960-original-title',
  matchStatus:'review-leading-film-hypothesis',identityRisk:null,
  alternativeTvIds:[],errors:[],
  topCandidates:[
    {tmdbId:2134,score:44,titleLevel:4,runtimeDelta:1.9,
      yearMismatch:false,sequelConflict:false},
    {tmdbId:148948,score:28,titleLevel:4,runtimeDelta:2.1,
      yearMismatch:true,sequelConflict:false},
    {tmdbId:2135,score:26,titleLevel:4,runtimeDelta:5.1,
      yearMismatch:true,sequelConflict:false},
  ],
})
describe('G2 explicit historical source-year movie work evidence',()=>{
  it('matches a full 1960 film name against both different-year remakes without touching global dominance',()=>{
    const q=planCuratedTmdbQueries(timeTitle)
    expect(q).toMatchObject({rawTitle:timeTitle,reportedYear:1960,
      matchingTitle:'The Time Machine (1960)',queries:['The Time Machine','Die Zeitmaschine']})
    expect(hasExclusiveHistoricalYearFilmHypothesis(timeTitle,timeRow())).toBe(true)
  })
  it('extracts Friday the 13th (1980) as a single film query, keeps original source and year for identity review',()=>{
    const q=planCuratedTmdbQueries('Friday the 13th (1980)')
    expect(q).toMatchObject({
      rawTitle:'Friday the 13th (1980)',matchingTitle:'Friday the 13th (1980)',
      queries:['Friday the 13th'],reportedYear:1980,
      curatedQueryReason:'terminal-year-multiword-film-title',
    })
    expect(q.verifiedTmdbId).toBeUndefined()
    expect(q.playbackRoute).toBeUndefined()
  })
  it('does not grant a link without proof of EVERY rival release-year conflict',()=>{
    for(const modify of [
      r=>{r.topCandidates[1].yearMismatch=false},
      r=>{r.topCandidates[1].yearMismatch=null},
      r=>{r.topCandidates[0].yearMismatch=true},
      r=>{r.topCandidates[0].score=41},
      r=>{r.topCandidates[0].runtimeDelta=3.1},
      r=>{r.topCandidates[1].score=31},
      r=>{r.topCandidates[1].score=30;r.topCandidates[0].score=43},
      r=>{r.topCandidates[1].tmdbId=r.topCandidates[0].tmdbId},
      r=>{r.topCandidates.push({tmdbId:444,score:5,titleLevel:0,
        yearMismatch:true,runtimeDelta:70})},
      r=>{r.topCandidates[1].runtimeDelta=null},
      r=>{r.alternativeTvIds=[7]},
      r=>{r.matchStatus='review-multiple-film-works'},
      r=>{r.identityRisk='explicit-unverified-cut-or-source'},
      r=>{r.errors.push('missing details')},
      r=>{r.reportedSourceYear=2002},
      r=>{r.curatedQueryReason='official-original-title-alias-release-year-review'},
      r=>{r.videoTitle='Trailer: '+timeTitle},
    ]){
      const copy=timeRow()
      modify(copy)
      expect(hasExclusiveHistoricalYearFilmHypothesis(timeTitle,copy)).toBe(false)
    }
  })
  it('rejects explicit cut/teaser sources, late new releases, undated work names and unrelated years',()=>{
    for(const source of [
      'Die Zeit Maschine - 1960 Trailer',
      'Die Zeit Maschine - 1960 Uncut',
      'Die Zeit Maschine - 2026',
      'Heat (1995)',
      'Nürnberg (2026)',
      'Die Zeit Maschine',
    ]){
      expect(hasExclusiveHistoricalYearFilmHypothesis(source,timeRow())).toBe(false)
    }
  })
})
