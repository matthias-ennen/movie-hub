import {describe,it,expect} from 'vitest'
import {
  explicitBilledActorPair,applyExplicitCastGuard,
} from '../scripts/youtube-g2-curated-cast-evidence.mjs'
import {hasExclusiveBilledPairFilmHypothesis} from '../scripts/youtube-g2-exclusive-pair-evidence.mjs'

const outside='Der Außenseiter 4K Brendan Fraser & Matt Damon Ganzer Film auf Deutsch'
const marvins='Marvins Töchter 4K Leonardo DiCaprio & Meryl Streep Kostenloser Film in voller Länge'
const before=[
  {tmdbId:9000001,score:40,titleLevel:4,runtimeDelta:1,
    yearMismatch:false,sequelConflict:false},
  {tmdbId:9000002,score:38,titleLevel:4,runtimeDelta:7,
    yearMismatch:false,sequelConflict:false},
  {tmdbId:9000003,score:32,titleLevel:4,runtimeDelta:21,
    yearMismatch:false,sequelConflict:false},
]
const films=[
  {id:9000001,credits:{cast:[{name:'Brendan Fraser'},{name:'Matt Damon'}]}},
  {id:9000002,credits:{cast:[{name:'Other One'}]}},
  {id:9000003,credits:{cast:[{name:'Other Two'}]}},
]
function matched(){
  const result=applyExplicitCastGuard(outside,before,films)
  return {result,row:{
    matchStatus:'review-leading-film-hypothesis',identityRisk:null,
    errors:[],alternativeTvIds:[],
    topCandidates:result.scores,castEvidence:result.evidence,
  }}
}
describe('G2 two explicitly credited actors from publisher banner',()=>{
  it('extracts exact two-person headings from two current real playlist titles',()=>{
    expect(explicitBilledActorPair(outside)).toEqual(['Brendan Fraser','Matt Damon'])
    expect(explicitBilledActorPair(marvins)).toEqual(['Leonardo DiCaprio','Meryl Streep'])
    for(const source of [
      'Der Außenseiter 4K Brendan Fraser & Matt Damon Trailer',
      'Der Außenseiter mit Brendan Fraser und Matt Damon',
      '4K Brendan Fraser Ganzer Film',
      '4K Brendan Fraser & Matt Damon',
      'Der Außenseiter 4K Brendan Fraser und Matt Damon Ganzer Film',
    ])expect(explicitBilledActorPair(source)).toBeNull()
  })
  it('corroborates BOTH independently in a SYNTHETIC close-runtime movie fixture',()=>{
    const {result,row}=matched()
    expect(result.evidence).toMatchObject({
      explicitActor:null,explicitActors:['Brendan Fraser','Matt Damon'],
      actorCreditEvidence:'matched-exclusive-two-actor-credit-list',
      creditedMovieIds:[9000001],partiallyCreditedMovieIds:[],affectsRanking:true,
    })
    expect(result.scores.map(x=>x.score)).toEqual([52,18,12])
    expect(hasExclusiveBilledPairFilmHypothesis(outside,row)).toBe(true)
  })
  it('replays REAL Der Außenseiter QA: both actors select film 14684 but its 7-minute cut mismatch blocks publication',()=>{
    const raw=[
      {tmdbId:12504,score:40,titleLevel:4,runtimeDelta:1,
        yearMismatch:false,sequelConflict:false},
      {tmdbId:14684,score:38,titleLevel:4,runtimeDelta:7,
        yearMismatch:false,sequelConflict:false},
      {tmdbId:286962,score:32,titleLevel:4,runtimeDelta:21,
        yearMismatch:false,sequelConflict:false},
    ]
    const films=[
      {id:12504,credits:{cast:[]}},
      {id:14684,credits:{cast:[{name:'Brendan Fraser'},{name:'Matt Damon'}]}},
      {id:286962,credits:{cast:[]}},
    ]
    const evidence=applyExplicitCastGuard(outside,raw,films)
    expect(evidence.evidence).toMatchObject({
      actorCreditEvidence:'matched-exclusive-two-actor-credit-list',
      creditedMovieIds:[14684],affectsRanking:true,
    })
    const ranked=[...evidence.scores].sort((a,b)=>b.score-a.score)
    expect(ranked.map(x=>[x.tmdbId,x.score,x.runtimeDelta])).toEqual([
      [14684,50,7],[12504,20,1],[286962,12,21],
    ])
    const row={matchStatus:'review-leading-film-hypothesis',
      identityRisk:null,errors:[],alternativeTvIds:[],
      castEvidence:evidence.evidence,topCandidates:ranked}
    expect(hasExclusiveBilledPairFilmHypothesis(outside,row)).toBe(false)
    // The closest-runtime film is not the cast-matched work. Never swap IDs.
    expect(evidence.evidence.creditedMovieIds).not.toContain(12504)
  })

  it('does not invent film evidence from missing credits, shared actors, fake billing or rivals',()=>{
    for(const titles of [
      [{id:9000001,credits:{cast:[{name:'Brendan Fraser'}]}},...films.slice(1)],
      [films[0],{id:9000002,credits:{cast:[{name:'Matt Damon'}]}},films[2]],
      [films[0],{id:9000002,credits:{cast:[{name:'Brendan Fraser'},{name:'Matt Damon'}]}},films[2]],
      [films[0],{id:9000002,credits:{}},films[2]],
    ]){
      const result=applyExplicitCastGuard(outside,before,titles)
      expect(result.evidence.affectsRanking).toBe(false)
      expect(result.scores).toEqual(before)
    }
    const {row}=matched()
    const alterations=[
      r=>{r.topCandidates[0].score=49},
      r=>{r.topCandidates[0].runtimeDelta=2.1},
      r=>{r.topCandidates[1].runtimeDelta=4.9},
      r=>{r.topCandidates[1].score=25},
      r=>{r.topCandidates[1].quotedActorCreditMatches=true},
      r=>{r.topCandidates[1].tmdbId=r.topCandidates[0].tmdbId},
      r=>{r.topCandidates[0].titleLevel=3},
      r=>{r.topCandidates[0].yearMismatch=true},
      r=>{r.castEvidence.creditedMovieIds.push(9000002)},
      r=>{r.castEvidence.actorCreditEvidence='matched-a-tmdb-credit-list'},
      r=>{r.alternativeTvIds=[100]},
      r=>{r.matchStatus='review-multiple-film-works'},
      r=>{r.identityRisk='explicit-unverified-cut-or-source'},
      r=>{r.errors.push('incomplete source')},
    ]
    for(const mutate of alterations){
      const copy=structuredClone(row)
      mutate(copy)
      expect(hasExclusiveBilledPairFilmHypothesis(outside,copy)).toBe(false)
    }
    expect(hasExclusiveBilledPairFilmHypothesis(outside+' Trailer',row)).toBe(false)
  })
})
