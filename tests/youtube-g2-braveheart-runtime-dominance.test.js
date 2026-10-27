import {describe,it,expect} from 'vitest'
import {hasDominantFilmHypothesis} from '../src/providers/youtubeCuratedEditorialIndex.js'

// Numeric matcher evidence from the private 98-entry playlist run.
// Video IDs, publisher identifiers and private QA artifacts are NOT committed.
const braveheart=()=>[
  {tmdbId:197,score:40,titleLevel:4,runtimeDelta:0.7,
    yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:null},
  {tmdbId:448394,score:23,titleLevel:4,runtimeDelta:106.7,
    yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:null},
  {tmdbId:1080997,score:7,titleLevel:2,runtimeDelta:120.3,
    yearMismatch:false,sequelConflict:false,quotedActorCreditMatches:null},
]

describe('YouTube playlist: dominant exact movie versus distant same-title alternatives',()=>{
  it('accepts the existing Braveheart movie:197 link hypothesis',()=>{
    expect(hasDominantFilmHypothesis(braveheart())).toBe(true)
  })

  it('rejects similar editions, close scores, rival cast and contradictory evidence',()=>{
    for(const change of [
      rows=>{rows[1].runtimeDelta=20},
      rows=>{rows[1].score=26},
      rows=>{rows[0].runtimeDelta=4},
      rows=>{rows[1].quotedActorCreditMatches=true},
      rows=>{rows[1].sequelConflict=true},
      rows=>{rows[1].yearMismatch=true},
      rows=>{rows[1].titleLevel=3},
      rows=>{rows[2].score=22},
    ]){
      const rows=braveheart()
      change(rows)
      expect(hasDominantFilmHypothesis(rows)).toBe(false)
    }
  })

  it('keeps the original 20-point margin for weak unrelated film titles',()=>{
    const rows=braveheart()
    rows[1].titleLevel=2
    expect(hasDominantFilmHypothesis(rows)).toBe(false)
    rows[1].score=10
    expect(hasDominantFilmHypothesis(rows)).toBe(true)
    rows[0].yearMismatch=true
    expect(hasDominantFilmHypothesis(rows)).toBe(false)
  })
})
