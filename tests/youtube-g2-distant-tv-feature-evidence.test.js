import {describe,it,expect} from 'vitest'
import {hasDistantTvNamesakeFeatureFilmEvidence} from '../scripts/youtube-g2-distant-tv-feature-evidence.mjs'

function caseRow(title,filmId,score,delta,rivals,tvRows){
  return {
    videoTitle:title,matchStatus:'review-leading-movie-with-TV-alternatives',
    identityRisk:null,sourceVideoDetailAvailable:true,errors:[],
    topCandidates:[{tmdbId:filmId,score,titleLevel:4,runtimeDelta:delta,
      yearMismatch:false,sequelConflict:false},...rivals.map(([id,s,t,d])=>({
      tmdbId:id,score:s,titleLevel:t,runtimeDelta:d,
      yearMismatch:false,sequelConflict:false,
    }))],
    alternativeTvIds:tvRows.map(([id])=>id),
    tvSearchEvidence:{alternativeTvIds:tvRows.map(([id])=>id),
      candidates:tvRows.map(([id,firstAirYear,yearGap])=>({
        tmdbTvId:id,firstAirYear,yearGap,
        wholeFilmTitleMatch:true,disposition:'retained-for-film-tv-review',
      }))},
  }
}
const firstBlood=()=>caseRow('Rambo - First Blood',1368,38,3.4,
  [[1073952,23,4,81.6],[1369,22,2,6.4]],
  [[204885,2022,40],[156930,2015,33]])
const nuremberg=()=>caseRow('Nürnberg (2026)',1214931,40,1.2,
  [[1045933,23,4,98.2],[821,7,2,36.8]],[[7389,2000,25]])

describe('movie-playlist titles despite decades-distant TV name suggestions',()=>{
  it('uses real, full-length First Blood and Nürnberg score/TV profiles',()=>{
    for(const make of [firstBlood,nuremberg]){
      const row=make()
      expect(hasDistantTvNamesakeFeatureFilmEvidence(row.videoTitle,row)).toBe(true)
    }
  })
  it('keeps near-era TV dramas and uncertain search/tv results in review',()=>{
    const examples=[
      caseRow('Titanic',597,40,0.9,
        [[16535,23,4,96.9],[44918,7,2,109.9]],
        [[20455,1996,1],[39016,2012,15]]),
      caseRow('The House That Jack Built',398173,40,1.1,
        [[116610,23,4,66.1],[199999,23,4,63.1]],
        [[27509,2002,16],[231261,1977,41]]),
      caseRow('Hannibal',9740,40,0.4,
        [[1248,24,2,0.4],[169818,23,4,28.4]],
        [[40008,2013,12],[33247,2010,9]]),
      caseRow("John Carpenter's Sie leben – ganzer Film auf Deutsch kostenlos schauen in HD",
        8337,40,2.5,[[44190,22,2,5.5],[24167,6,0,9.5]],
        [[76497,1997,9]]),
      caseRow('Knock Off',37498,40,2.4,
        [[1491303,23,4,79.4],[514828,7,2,88.4]],
        [[253275,null,null]]),
    ]
    for(const row of examples)
      expect(hasDistantTvNamesakeFeatureFilmEvidence(row.videoTitle,row)).toBe(false)
  })
  it('rejects tampered TV years, work identities and insufficient movie evidence',()=>{
    const changes=[
      r=>{r.tvSearchEvidence.candidates[0].firstAirYear=null},
      r=>{r.tvSearchEvidence.candidates[0].yearGap=24},
      r=>{r.tvSearchEvidence.candidates[0].wholeFilmTitleMatch=false},
      r=>{r.tvSearchEvidence.candidates[0].disposition='clearly-unrelated-search-hit'},
      r=>{r.tvSearchEvidence.candidates[0].tmdbTvId=999},
      r=>{r.tvSearchEvidence.alternativeTvIds=[]},
      r=>{r.alternativeTvIds.push(999)},
      r=>{r.topCandidates[0].runtimeDelta=4.1},
      r=>{r.topCandidates[0].score=37},
      r=>{r.topCandidates[1].runtimeDelta=59.9},
      r=>{r.topCandidates[1].score=24},
      r=>{r.topCandidates[2].score=23},
      r=>{r.topCandidates[1].tmdbId=r.topCandidates[0].tmdbId},
      r=>{r.topCandidates[1].sequelConflict=true},
      r=>{r.topCandidates[0].yearMismatch=true},
      r=>{r.matchStatus='review-multiple-film-works'},
      r=>{r.sourceVideoDetailAvailable=false},
      r=>{r.identityRisk='explicit-unverified-cut-or-source'},
      r=>{r.errors.push('missing metadata')},
    ]
    for(const change of changes){
      const row=firstBlood()
      change(row)
      expect(hasDistantTvNamesakeFeatureFilmEvidence(row.videoTitle,row)).toBe(false)
    }
    const row=firstBlood()
    expect(hasDistantTvNamesakeFeatureFilmEvidence('Rambo - First Blood Trailer',row)).toBe(false)
  })
})
