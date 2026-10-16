import { describe, it, expect, vi } from 'vitest'
import { chooseDiverseManualQueue, boundedUnmatchedSample, conservativeTitleVariants,
  buildReviewDiagnostics, MAX_MANUAL_QUEUE, MAX_UNMATCHED_PROBE } from '../scripts/youtube-g1-review-diagnostics.mjs'

const vid = n => 'A' + String(n).padStart(10, '0')
const priority = (n, delta, year) => ({
  videoId:vid(n),tmdbId:1000+n,tmdbYear:year,title:'Movie '+n,
  runtimeDelta:delta,tmdbTitle:'Movie '+n,
})

describe('YouTube G1 diagnostics are manually reviewable, bounded, and safe', ()=>{
  it('distributes the manual review queue across years and runtime deltas with stable IDs', ()=>{
    const items=Array.from({length:79},(_,i)=>priority(i,i%3===0?0.4:i%3===1?3.5:8.5,1970+(i%6)*10))
    const a=chooseDiverseManualQueue(items)
    const b=chooseDiverseManualQueue(items)
    expect(a).toEqual(b)
    expect(a).toHaveLength(MAX_MANUAL_QUEUE)
    expect(new Set(a.map(v=>v.videoId)).size).toBe(MAX_MANUAL_QUEUE)
    expect(new Set(a.map(v=>v.stratum.split(':')[0]))).toEqual(new Set(['edge','near','middle']))
    expect(new Set(a.map(v=>v.tmdbYear)).size).toBeGreaterThan(3)
  })
  it('selects a bounded unmatched sample fairly across sources',()=>{
    const inputs=[
      ...Array.from({length:7},(_,i)=>({videoId:vid(i),status:'unmatched',publisher:'CiNENET',title:'Bad '+i})),
      ...Array.from({length:40},(_,i)=>({videoId:vid(i+30),status:'unmatched',publisher:'Netzkino',title:'Missing '+i})),
      {videoId:vid(100),status:'review',publisher:'Netzkino'},
    ]
    const sample=boundedUnmatchedSample(inputs)
    expect(sample).toHaveLength(MAX_UNMATCHED_PROBE)
    expect(sample.filter(x=>x.publisher==='CiNENET')).toHaveLength(7)
    expect(sample.filter(x=>x.publisher==='Netzkino')).toHaveLength(13)
    expect(boundedUnmatchedSample(inputs)).toEqual(sample)
  })
  it('never guesses titles by splitting a genuine hyphen subtitle or a bare date',()=>{
    expect(conservativeTitleVariants('Knight Moves - Ein mörderisches Spiel',
      'Knight Moves - Ein mörderisches Spiel')).toEqual([])
    expect(conservativeTitleVariants('YouTube Video 2026','YouTube Video 2026')).toEqual([])
  })
  it('recognizes only delimited promotional prefix and pipe components',()=>{
    const result=conservativeTitleVariants('Netzkino: The Quiet Place | Ganzer Film auf Deutsch', 'Netzkino: The Quiet Place')
    expect(result).toContain('The Quiet Place')
    expect(result).toHaveLength(1)
  })
  it('reports candidate hints for alternative queries without promoting TMDB identities',async()=>{
    const same=vid(1)
    const no=vid(2)
    const raw1={snippet:{title:'Netzkino: The Quiet Place | Ganzer Film auf Deutsch'}}
    const raw2={snippet:{title:'Night - Eternal Escape'}}
    const search=vi.fn(async ({title})=>(title==='The Quiet Place'?[
      {id:42,title:'The Quiet Place',release_date:'2001-02-03'},
      {id:42,title:'The Quiet Place',release_date:'2001-02-03'},
    ]:[]))
    const inputs=[
      {status:'unmatched',publisher:'Netzkino',title:'Netzkino: The Quiet Place',videoId:same},
      {status:'unmatched',publisher:'Netzkino',title:'Night - Eternal Escape',videoId:no},
    ]
    const report=await buildReviewDiagnostics({
      prioritized:[priority(10,0.5,1998),priority(11,8.5,2008)],
      decisions:inputs,detailMap:new Map([[same,raw1],[no,raw2]]),
    },{searchTmdb:search})
    expect(report.manual).toHaveLength(2)
    expect(report.problems).toHaveLength(2)
    expect(report.actualSearchCalls).toBe(1)
    expect(search).toHaveBeenCalledOnce()
    expect(report.reasonCounts['candidate-hints-only']).toBe(1)
    expect(report.reasonCounts['no-safe-query-variant']).toBe(1)
    expect(report.problems[0].candidates).toEqual([{id:42,title:'The Quiet Place',year:2001}])
    expect(report.report).toContain('Keine echte menschliche Video- oder Rechteprüfung')
    expect(report.report).toContain('**offen**')
    expect(report.report).not.toContain('provisional-identity')
  })
  it('stops invalid response types instead of presenting failed lookups as no match',async()=>{
    await expect(buildReviewDiagnostics({
      prioritized:[],decisions:[{status:'unmatched',publisher:'Netzkino',title:'Netzkino: My Movie',videoId:vid(4)}],
      detailMap:new Map([[vid(4),{snippet:{title:'Netzkino: My Movie'}}]]),
    },{searchTmdb:vi.fn(async()=>null)})).rejects.toThrow('invalid result')
  })
})
