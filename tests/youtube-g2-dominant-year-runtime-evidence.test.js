import {describe,expect,it} from 'vitest'
import {hasDominantFilmHypothesis} from '../src/providers/youtubeCuratedEditorialIndex.js'

const movie=(tmdbId,score,titleLevel,runtimeDelta,{
  yearMismatch=false,sequelConflict=false,quotedActorCreditMatches=null,
}={})=>({tmdbId,score,titleLevel,runtimeDelta,
  yearMismatch,sequelConflict,quotedActorCreditMatches})

describe('YouTube G2: explicit year and conclusive cast/duration exclusions',()=>{
  it('recognizes the specific 1993 Stalingrad source against other YEARS, never ignoring year mismatch',()=>{
    const results=[
      movie(11101,54,4,4.1,{quotedActorCreditMatches:true}),
      movie(156141,-9,4,57.9,{yearMismatch:true,quotedActorCreditMatches:false}),
      movie(326297,-9,4,48.1,{yearMismatch:true,quotedActorCreditMatches:false}),
    ]
    expect(hasDominantFilmHypothesis(results)).toBe(true)
  })
  it('distinguishes the explicitly dated 1978 Dawn of the Dead from the 2004 remake',()=>{
    const results=[
      movie(923,44,4,1.1),
      movie(924,20,4,18.1,{yearMismatch:true}),
      movie(1533042,-12,0,null,{yearMismatch:true}),
    ]
    expect(hasDominantFilmHypothesis(results)).toBe(true)
  })
  it('accepts actor-confirmed Hard Rain only when rival cut is radically longer',()=>{
    const results=[
      movie(11258,52,4,0.8,{quotedActorCreditMatches:true}),
      movie(684935,3,4,92.8,{quotedActorCreditMatches:false}),
      movie(675809,-13,2,66.8,{quotedActorCreditMatches:false}),
    ]
    expect(hasDominantFilmHypothesis(results)).toBe(true)
  })
  it('keeps plausible remakes, close runtime candidates, poor actor evidence and near ties in review',()=>{
    const base=[
      movie(11258,52,4,0.8,{quotedActorCreditMatches:true}),
      movie(684935,3,4,92.8,{quotedActorCreditMatches:false}),
    ]
    for(const mutate of [
      list=>{list[0].quotedActorCreditMatches=null},
      list=>{list[1].quotedActorCreditMatches=null},
      list=>{list[1].runtimeDelta=28},
      list=>{list[1].score=19},
      list=>{list[0].runtimeDelta=6},
      list=>{list[0].score=45},
      list=>{list[1].sequelConflict=true;list[1].score=45},
    ]){
      const list=structuredClone(base)
      mutate(list)
      expect(hasDominantFilmHypothesis(list)).toBe(false)
    }
  })
  it('requires BOTH explicit wrong source-year and meaningful runtime contradiction',()=>{
    const base=[movie(923,44,4,1.1),movie(924,20,4,18.1,{yearMismatch:true})]
    expect(hasDominantFilmHypothesis(base)).toBe(true)
    for(const mutate of [
      list=>{list[1].yearMismatch=false},
      list=>{list[1].runtimeDelta=14.9},
      list=>{list[1].score=30},
      list=>{list[0].runtimeDelta=6},
      list=>{list[0].yearMismatch=true},
      list=>{list[1].runtimeDelta=null},
    ]){
      const list=structuredClone(base)
      mutate(list)
      expect(hasDominantFilmHypothesis(list)).toBe(false)
    }
  })
  it('never permits extra fourth film result, identical TMDB IDs, or a same-year competing movie',()=>{
    const base=[
      movie(11101,54,4,4.1,{quotedActorCreditMatches:true}),
      movie(156141,-9,4,57.9,{yearMismatch:true,quotedActorCreditMatches:false}),
      movie(326297,-9,4,48.1,{yearMismatch:true,quotedActorCreditMatches:false}),
    ]
    expect(hasDominantFilmHypothesis([...base,movie(44999,-10,2,120)])).toBe(false)
    expect(hasDominantFilmHypothesis([base[0],{...base[1],tmdbId:11101}])).toBe(false)
    expect(hasDominantFilmHypothesis([base[0],{
      ...base[1],yearMismatch:false,runtimeDelta:18.1,
    }])).toBe(false)
  })
})
