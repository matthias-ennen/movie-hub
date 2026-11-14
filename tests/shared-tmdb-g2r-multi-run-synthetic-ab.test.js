import { describe, expect, it } from 'vitest'
import {
  runG2rSyntheticMultiRunAb,isSafeG2rSyntheticMultiRunReport,
} from '../scripts/shared-tmdb-g2r-multi-run-synthetic-ab.mjs'

const NOW=Date.parse('2026-11-14T12:00:00.000Z')
const TITLE_MARKER='G2R SYNTHETIC MOVIE ONLY'

describe('#336 G2r: five separate days of ORIGINAL Joyn/Waipu client cache transport',()=>{
  it('restarts independent original clients, keeps 7-day TTL and falls back on expiry',async()=>{
    const x=await runG2rSyntheticMultiRunAb({now:NOW})
    expect(x).toMatchObject({
      kind:'g2r-synthetic-multi-run-original-client-cache-ab',
      schemaVersion:1,mode:'offline-mocked-http',
      simulatedRuns:5,simulatedDayOffsets:[0,1,3,6,7],
      baselineOriginalClientStarts:20,
      sharedOriginalClientStarts:6,
      simulatedStartsAvoided:14,
      sharedExactResponseHits:14,
      expiredFallbackStarts:4,
      snapshotWrites:1,snapshotBytesUnchangedAfterSeed:true,
      responseRowsEquivalent:true,
      originalMatcherDecisionsEquivalent:true,
      liveTmdbHttpStarted:0,
      measuredProductionSavings:null,productiveWrites:0,
      nightlyEnabled:false,publishApproved:false,playbackRoutesApproved:false,
    })
    expect(x.perRun).toEqual([
      {dayOffset:0,baselineStarts:4,sharedStarts:2,sharedHits:2,restoredExactResponses:2},
      {dayOffset:1,baselineStarts:4,sharedStarts:0,sharedHits:4,restoredExactResponses:2},
      {dayOffset:3,baselineStarts:4,sharedStarts:0,sharedHits:4,restoredExactResponses:2},
      {dayOffset:6,baselineStarts:4,sharedStarts:0,sharedHits:4,restoredExactResponses:2},
      {dayOffset:7,baselineStarts:4,sharedStarts:4,sharedHits:0,restoredExactResponses:0},
    ])
    expect(isSafeG2rSyntheticMultiRunReport(x)).toBe(true)
    const serialized=JSON.stringify(x)
    for (const secret of [TITLE_MARKER,'G2R SYNTHETIC SERIES ONLY','authorization','/search/movie','requestKey','Bearer']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('rejects impossible metrics, mutable approvals and extra private fields',async()=>{
    const x=await runG2rSyntheticMultiRunAb({now:NOW})
    for(const candidate of [
      {...x,rawTitle:TITLE_MARKER},
      {...x,liveTmdbHttpStarted:1},
      {...x,measuredProductionSavings:14},
      {...x,productiveWrites:1},
      {...x,nightlyEnabled:true},
      {...x,publishApproved:true},
      {...x,playbackRoutesApproved:true},
      {...x,sharedExactResponseHits:15},
      {...x,originalMatcherDecisionsEquivalent:false},
      {...x,snapshotBytesUnchangedAfterSeed:false},
      {...x,perRun:x.perRun.map((r,i)=>i===4?{...r,sharedStarts:0}:r)},
      {...x,simulatedDayOffsets:[0,1,2,6,7]},
    ]) {
      expect(isSafeG2rSyntheticMultiRunReport(candidate)).toBe(false)
    }
  })

  it('rejects malformed clocks without touching the network',async()=>{
    for(const now of [NaN,Infinity,-1,0,1e20]) {
      await expect(runG2rSyntheticMultiRunAb({now})).rejects.toThrow('Invalid synthetic cache clock')
    }
  })
})
