import {describe,it,expect} from 'vitest'
import {hasExclusiveActorCanonicalFilmEvidence} from '../scripts/youtube-g2-exclusive-actor-canonical-film.mjs'

const source=()=>({
  sourceScreened:true,regionSignal:'allowed',
  sourceTitle:"Heiter bis wolkig (ROMANTISCHE KOMÖDIE mit ELYAS M'BAREK, Liebeskomödie ganzer Film Deutsch, ROMCOM)",
})
const row=()=>({
  matchStatus:'review-leading-movie-with-TV-alternatives',
  publicIndexMembership:'public-not-present',
  identityRisk:null,errors:[],
  castEvidence:{explicitActor:"ELYAS M'BAREK",
    actorCreditEvidence:'matched-a-tmdb-credit-list',
    creditedMovieIds:[117467],affectsRanking:true},
  topCandidates:[
    {tmdbId:117467,score:52,titleLevel:4,runtimeDelta:0.6,
      yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:true},
    {tmdbId:1071608,score:3,titleLevel:4,runtimeDelta:89.4,
      yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:false},
    {tmdbId:1090200,score:-4,titleLevel:2,runtimeDelta:null,
      yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:false},
  ],
  alternativeTvIds:[81870],
  tvSearchEvidence:{candidates:[{
    tmdbTvId:81870,name:'Heiter bis wolkig',firstAirYear:1978,yearGap:34,
    disposition:'retained-for-film-tv-review',
  }]},
})

describe('YouTube: exclusive actor evidence across canonical metadata gap',()=>{
  it('selects actual Heiter bis wolkig movie without reclassifying TV offers',()=>{
    expect(hasExclusiveActorCanonicalFilmEvidence(source(),row())).toBe(true)
  })
  it('rejects missing, forged or non-exclusive cast evidence, near ties and incompatible TV eras',()=>{
    for(const change of [
      (s,r)=>{s.sourceTitle='Heiter bis wolkig'},
      (s,r)=>{r.castEvidence.explicitActor='Another Actor'},
      (s,r)=>{r.castEvidence.creditedMovieIds=[117467,1071608]},
      (s,r)=>{r.topCandidates[1].quotedActorCreditMatches=true},
      (s,r)=>{r.topCandidates[0].score=49},
      (s,r)=>{r.topCandidates[0].runtimeDelta=2.1},
      (s,r)=>{r.topCandidates[1].score=33},
      (s,r)=>{r.topCandidates[1].runtimeDelta=6},
      (s,r)=>{r.topCandidates[1].tmdbId=117467},
      (s,r)=>{r.alternativeTvIds=[999]},
      (s,r)=>{r.tvSearchEvidence.candidates[0].yearGap=15},
      (s,r)=>{r.tvSearchEvidence.candidates[0].firstAirYear=null},
      (s,r)=>{r.tvSearchEvidence.candidates[0].disposition='unknown'},
      (s,r)=>{r.identityRisk='explicit-unverified-cut-or-source'},
      (s,r)=>{r.publicIndexMembership='public-present'},
      (s,r)=>{r.matchStatus='review-multiple-film-works'},
      (s,r)=>{r.errors=['no TMDB data']},
      (s,r)=>{s.regionSignal='excluded'},
      (s,r)=>{s.sourceScreened=false},
    ]){
      const s=source(),r=row()
      change(s,r)
      expect(hasExclusiveActorCanonicalFilmEvidence(s,r)).toBe(false)
    }
  })
})
