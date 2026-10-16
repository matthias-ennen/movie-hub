import { describe, it, expect, vi } from 'vitest'
import { WaipuTmdbSearchClient } from '../scripts/waipu-tmdb-matcher.mjs'
import { reviewSixSearchHints, probeLanguageAndPageTwo } from '../scripts/youtube-g1-kodi-candidate-diagnostics.mjs'

const vid = n => 'A' + String(n).padStart(10,'0')
const candidate = (id, title, year, original = title) => ({
  id, type:'movie', title, original_title:original, release_date:year+'-01-01',
})

describe('Read-only G1 candidate verification', ()=>{
  it('uses existing shared matcher with film runtime but never creates an automatic match',async()=>{
    const id=vid(1)
    const rows=[{videoId:id,oldTitle:'MERYL STREEP in GLAUBENSFRAGE',
      sourceTitle:'MERYL STREEP in GLAUBENSFRAGE',
      alternatives:[{title:'GLAUBENSFRAGE',reason:'cast-prefix'}],
      hints:[{tmdbId:14359,year:2008}]}]
    const search=vi.fn(async()=>[candidate(14359,'Glaubensfrage',2008,'Doubt')])
    const details=vi.fn(async()=>({year:2008,runtimeMinutes:105}))
    const out=await reviewSixSearchHints({
      rows, detailMap:new Map([[id,{contentDetails:{duration:'PT1H44M'}}]]),
    },{searchTmdb:search,loadDetails:details})
    expect(out.outcomes).toHaveLength(1)
    expect(out.outcomes[0].status).toBe('priority-manual-review')
    expect(out.outcomes[0].runtimeDelta).toBe(1)
    expect(out.detailCalls).toBe(1)
    expect(out.report).toContain('keine automatische Filmidentität')
    expect(out.report).toContain('menschlichen Werkprüfung')
  })
  it('never picks a shared-title Spider identity when multiple plausible TMDB years compete',async()=>{
    const id=vid(2)
    const out=await reviewSixSearchHints({
      rows:[{videoId:id,sourceTitle:'RALPH FIENNES ist SPIDER',
        alternatives:[{title:'SPIDER',reason:'cast-prefix'}],
        hints:[{tmdbId:557,year:2002},{tmdbId:315635,year:2017}]}],
      detailMap:new Map([[id,{contentDetails:{duration:'PT1H38M'}}]]),
    },{searchTmdb:async()=>[candidate(557,'Spider',2002),candidate(315635,'Spider',2017)],
      loadDetails:async()=>{throw Error('must not fetch when ambiguous')}})
    expect(out.outcomes[0].status).toBe('ambiguous-or-weak')
    expect(out.outcomes[0].reason).toBe('ambiguous_margin')
    expect(out.detailCalls).toBe(0)
    expect(out.outcomes[0].runnerUpId).toBeTruthy()
  })
  it('rejects mismatched runtime even if the movie title matches exactly',async()=>{
    const id=vid(3)
    const out=await reviewSixSearchHints({
      rows:[{videoId:id,alternatives:[{title:'MARGOT UND DIE HOCHZEIT'}],
        hints:[{tmdbId:13998}]}],
      detailMap:new Map([[id,{contentDetails:{duration:'PT80M'}}]]),
    },{searchTmdb:async()=>[candidate(13998,'Margot und die Hochzeit',2007)],
      loadDetails:async()=>({year:2007,runtimeMinutes:122})})
    expect(out.outcomes[0].status).toBe('runtime-conflict')
    expect(out.outcomes[0].runtimeDelta).toBe(42)
  })
  it('does not substitute a TMDB search year for an independent YouTube film year',async()=>{
    const id=vid(4)
    const out=await reviewSixSearchHints({
      rows:[{videoId:id,alternatives:[{title:'TEST FILM'}],hints:[{tmdbId:1234}]}],
      detailMap:new Map([[id,{contentDetails:{duration:'PT90M'}}]]),
    },{searchTmdb:async()=>[candidate(1234,'Test Film',2001)],
      loadDetails:async()=>({year:2001,runtimeMinutes:90})})
    expect(out.outcomes[0].status).toBe('priority-manual-review')
    expect(out.report).toContain('Uploadjahr')
    expect(out.report).not.toContain('Filmidentität bestätigt')
  })
})

describe('Kodi-inspired bounded discovery',()=>{
  it('checks only the never-improved sample, English first and page 2 only when available',async()=>{
    const spy=vi.fn(async input=>({
      results:input.page===2?[candidate(230,'Actual Film',2019)]:
        input.title==='Actual Film'?[candidate(230,'Actual Film',2019)]:[],
      totalPages:input.title==='Actual Film'?2:1,
    }))
    const rows=[
      {videoId:vid(1),oldTitle:'Actual Film',alternatives:[],hints:[]},
      {videoId:vid(2),oldTitle:'MERYL STREEP in GLAUBENSFRAGE',
        alternatives:[{title:'GLAUBENSFRAGE'}],hints:[{tmdbId:14359}]},
      {videoId:vid(3),oldTitle:'Unknown Movie',alternatives:[],hints:[]},
    ]
    const out=await probeLanguageAndPageTwo({rows},{searchDiagnostic:spy})
    expect(out.outcomes).toHaveLength(2)
    expect(out.requests).toBe(3)
    expect(out.page2).toBe(1)
    expect(spy.mock.calls.every(c=>c[0].language==='en-US')).toBe(true)
    expect(spy.mock.calls.every(c=>c[0].page<=2)).toBe(true)
    expect(out.outcomes[0].status).toBe('candidate-hint-only')
    expect(out.outcomes[1].status).toBe('no-results')
    expect(out.report).toContain('Baseline')
  })
  it('limits sample size and rejects malformed remote responses',async()=>{
    const rows=Array.from({length:40},(_,i)=>({
      videoId:vid(i),oldTitle:'Movie '+i,alternatives:[],hints:[],
    }))
    const spy=vi.fn(async()=>({results:[],totalPages:1}))
    const out=await probeLanguageAndPageTwo({rows},{searchDiagnostic:spy})
    expect(out.outcomes).toHaveLength(14)
    expect(spy).toHaveBeenCalledTimes(14)
    await expect(probeLanguageAndPageTwo({rows:rows.slice(0,1)},
      {searchDiagnostic:async()=>({results:null,totalPages:2})})).rejects.toThrow('Invalid')
  })
})

describe('Common TMDB client diagnostics use existing budget and cache',()=>{
  it('uses a separate opt-in page/language call without modifying production search behavior',async()=>{
    const request=vi.fn(async url=>({
      ok:true,status:200,headers:{get:()=>null},
      json:async()=>({results:[candidate(123,'Test Film',2000)],total_pages:3}),
    }))
    const client=new WaipuTmdbSearchClient({
      token:'test-token',fetchImpl:request,paceMs:0,maxRequests:2,maxRetries:0,
    })
    const one=await client.searchDiagnostic({type:'movie',title:'Test Film',language:'en-US',page:2})
    const two=await client.searchDiagnostic({type:'movie',title:'Test Film',language:'en-US',page:2})
    expect(one.results).toHaveLength(1)
    expect(two.results).toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(client.requestsStarted).toBe(1)
    expect(String(request.mock.calls[0][0])).toContain('page=2')
    expect(String(request.mock.calls[0][0])).toContain('language=en-US')
    await expect(client.searchDiagnostic({type:'movie',title:'Test Film',language:'fr-FR',page:3})).rejects.toThrow('Invalid')
  })
  it('enforces shared hard API budget, including new diagnostic endpoints',async()=>{
    const fetchImpl=vi.fn(async()=>({ok:true,status:200,headers:{get:()=>null},
      json:async()=>({results:[],total_pages:1})}))
    const client=new WaipuTmdbSearchClient({token:'x',fetchImpl,paceMs:0,maxRequests:1,maxRetries:0})
    await client.searchDiagnostic({title:'A Movie',page:1})
    await expect(client.searchDiagnostic({title:'Other Movie',page:1})).rejects.toThrow('budget')
    expect(client.requestsStarted).toBe(1)
  })
})
