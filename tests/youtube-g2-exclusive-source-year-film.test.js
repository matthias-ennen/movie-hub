import {describe,it,expect} from 'vitest'
import {
  terminalPublisherFilmYear,hasExclusiveReportedYearFilmHypothesis,
} from '../scripts/youtube-g2-exclusive-source-year-film.mjs'

const source='Die Zeit Maschine - 1960'
const row=()=>({
  matchStatus:'review-leading-film-hypothesis',
  identityRisk:null,errors:[],alternativeTvIds:[],
  topCandidates:[
    {tmdbId:2134,score:44,titleLevel:4,runtimeDelta:1.9,
      yearMismatch:false,sequelConflict:false},
    {tmdbId:148948,score:28,titleLevel:4,runtimeDelta:2.1,
      yearMismatch:true,sequelConflict:false},
    {tmdbId:2135,score:26,titleLevel:4,runtimeDelta:5.1,
      yearMismatch:true,sequelConflict:false},
  ],
})
describe('G2 full-movie year names a unique TMDB work despite remakes',()=>{
  it('parses only a clearly terminal publisher year',()=>{
    expect(terminalPublisherFilmYear(source)).toBe(1960)
    expect(terminalPublisherFilmYear('Die Jagd (2012)')).toBe(2012)
    expect(terminalPublisherFilmYear('Dawn of the dead 1978')).toBe(1978)
    expect(terminalPublisherFilmYear('Die Zeitmaschine')).toBeNull()
    expect(terminalPublisherFilmYear('Bud Spencer Aladin 1986 - Deutsch')).toBeNull()
    expect(terminalPublisherFilmYear('Stalingrad [1993] Trailer')).toBeNull()
  })
  it('replays 1960 Time Machine: all same-title rival films contradict the year',()=>{
    expect(hasExclusiveReportedYearFilmHypothesis(source,row())).toBe(true)
    // Another movie may be nearly the same length but cannot be the work
    // advertised as 1960 if TMDB independently reports a different year.
    expect(row().topCandidates[1].runtimeDelta).toBe(2.1)
  })
  it('blocks Braveheart without year and every plausible year/rival ambiguity',()=>{
    const rejects=[
      (r)=>{r.topCandidates[1].yearMismatch=false},
      (r)=>{r.topCandidates[1].yearMismatch=null},
      (r)=>{r.topCandidates[1].score=29},
      (r)=>{r.topCandidates[1].titleLevel=2},
      (r)=>{r.topCandidates[1].runtimeDelta=null},
      (r)=>{r.topCandidates[1].sequelConflict=true},
      (r)=>{r.topCandidates[1].tmdbId=r.topCandidates[0].tmdbId},
      (r)=>{r.topCandidates[0].score=43},
      (r)=>{r.topCandidates[0].runtimeDelta=2.1},
      (r)=>{r.topCandidates[0].yearMismatch=true},
      (r)=>{r.topCandidates[0].titleLevel=3},
      (r)=>{r.matchStatus='review-multiple-film-works'},
      (r)=>{r.alternativeTvIds=[808]},
      (r)=>{r.identityRisk='explicit-unverified-cut-or-source'},
      (r)=>{r.errors=['missing source video details']},
    ]
    for(const change of rejects){
      const copy=row();change(copy)
      expect(hasExclusiveReportedYearFilmHypothesis(source,copy)).toBe(false)
    }
    expect(hasExclusiveReportedYearFilmHypothesis('Braveheart',row())).toBe(false)
    expect(hasExclusiveReportedYearFilmHypothesis('Die Zeit Maschine - 2002', {
      ...row(),topCandidates:[{...row().topCandidates[0],yearMismatch:true},
        ...row().topCandidates.slice(1)],
    })).toBe(false)
  })
})
