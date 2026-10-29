import {describe,it,expect} from 'vitest'
import {buildNightlyReport,nightlyMarkdown,saveNightlyReport}
  from '../scripts/moviehub-nightly-chain-report.mjs'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

const qa={
  youtube:{kind:'moviehub-youtube-g2-bidirectional-coverage-baseline',
    generatedAt:'2026-10-28T17:07:00Z',
    youtubeFirst:{sourceVideos:140,editorialDirectLinks:75,reviewOnlyVideos:65,newTmdbFilmMetadata:14},
    tmdbFirst:{publicYoutubeBadgedMovies:3017},totalVerifiedDETitleRoutes:0,
    items:[{videoId:'PRIVATE_VIDEO_ID',watchUrl:'PRIVATE_WATCH_URL'}]},
  waipu:{kind:'waipu-live-index',status:'complete',generatedAt:'2026-10-28T10:30:00Z',
    counts:{stations:228,titles:3426,broadcasts:43955},secret:'SECRET_API_TOKEN'},
  joyn:{kind:'joyn-live-index',status:'complete',generatedAt:'2026-10-28T10:32:00Z',
    stationCount:125,airingCount:22772,rows:[{id:'PRIVATE_STATION_ID'}]},
  tv:{kind:'moviehub-tv-runtime-index',generatedAt:'2026-10-28T17:04:00Z',
    providers:['joyn','waipu'],titleCount:4444,airingCount:66727},
}
const base={stages:{gate:'success',discovery:'success',known:'success',firebase:'success'},
  sourceData:qa,runId:601,runAttempt:1,repository:'test/movie-hub'}

describe('safe end-of-chain adapter summary (#388)',()=>{
  it('exposes only allowlisted per-adapter counts and exact completion stages',()=>{
    const r=buildNightlyReport(base)
    expect(r.status).toBe('success')
    expect(r.adapters.youtube).toMatchObject({
      sourceVideos:140,playlistEditorialLinks:75,playlistReviewCases:65,
      newCanonicalTmdbMetadata:14,publicYoutubeBadgedMovies:3017,
      independentlyVerifiedDETitleRoutes:0,
    })
    expect(r.adapters.waipu).toMatchObject({stations:228,titles:3426,broadcasts:43955})
    expect(r.adapters.joyn).toMatchObject({stations:125,airings:22772})
    expect(r.adapters.tv).toMatchObject({titles:4444,airings:66727,providerCount:2})
    expect(r.run.url).toBe('https://github.com/test/movie-hub/actions/runs/601')
    const printed=JSON.stringify(r)+nightlyMarkdown(r)
    expect(printed).not.toMatch(/PRIVATE_|SECRET_API_TOKEN|videoId|watchUrl/)
    expect(r.googleRemainingQuota).toBe(null)
    expect(r.youtubeSearchCallsMeasuredHere).toBe(false)
  })
  it('reports measured quotaExceeded as a normal discovery terminal, not inferred quota',()=>{
    const discovery={
      kind:'moviehub-youtube-g2-nightly-budgeted-discovery',
      status:'quota-exhausted-confirmed',pacificDate:'2026-10-28',
      dayLimit:200,quotaMode:'real-google-quota-until-confirmed-403',
      priorReserved:5,selectedForSearch:96,
      searchCalls:96,successfulSearchCalls:95,
      quotaExceededConfirmed:true,unusedReservedSearches:0,
      savedNewCandidateFilms:12,stillEligible:2800,
      terminationReason:'youtube-search-list-403-quotaExceeded',
      videoId:'SHOULD_NOT_BE_INCLUDED',secret:'NOT_EXPORTED',
    }
    const r=buildNightlyReport({...base,sourceData:{...qa,discovery}})
    expect(r.status).toBe('success')
    expect(r.youtubeSearchCallsMeasuredHere).toBe(true)
    expect(r.googleRemainingQuota).toBe(null)
    expect(r.youtubeDiscoveryQuota).toMatchObject({
      priorReserved:5,reservedForNight:96,actualSearchAttempts:96,
      successfulSearchCalls:95,rejectedSearchCalls:1,
      quotaExceededConfirmed:true,terminationReason:'youtube-search-list-403-quotaExceeded',
    })
    const printed=JSON.stringify(r)+nightlyMarkdown(r)
    expect(printed).toContain('Tatsächliche search.list-Versuche: 96')
    expect(printed).not.toMatch(/SHOULD_NOT_BE_INCLUDED|NOT_EXPORTED/)
  })
  it('keeps a rate-limited yet cleanly terminated discovery visibly degraded',()=>{
    const discovery={
      kind:'moviehub-youtube-g2-nightly-budgeted-discovery',
      status:'rate-limited-stalled',pacificDate:'2026-10-29',
      quotaMode:'google-enforced-no-internal-daily-cap',dayLimit:null,
      selectedForSearch:17,searchCalls:17,successfulSearchCalls:4,
      rateLimitResponses:13,uncertainSearchAttempts:0,
      rateLimitHttp429:12,rateLimitHttp403:1,
      rateLimitUnclassified:3,rateLimitRetryAfterHints:2,
      rateLimitFirstAt:'2026-10-29T12:03:04.000Z',
      rateLimitLastAt:'2026-10-29T13:03:04.000Z',
      secret:'PRIVATE_NEVER_EXPORT',
      quotaExceededConfirmed:false,
      terminationReason:'youtube-search-rate-limit-not-confirmed-quota',
    }
    const report=buildNightlyReport({...base,sourceData:{...qa,discovery}})
    expect(report.status).toBe('degraded')
    expect(report.steps.discovery).toBe('success')
    expect(report.youtubeDiscoveryQuota).toMatchObject({
      status:'rate-limited-stalled',actualSearchAttempts:17,
      successfulSearchCalls:4,rateLimitResponses:13,
      rateLimitHttp429:12,rateLimitHttp403:1,
      rateLimitUnclassified:3,rateLimitRetryAfterHints:2,
      rateLimitFirstAt:'2026-10-29T12:03:04.000Z',
      rateLimitLastAt:'2026-10-29T13:03:04.000Z',
      quotaExceededConfirmed:false,
    })
    const printed=nightlyMarkdown(report)
    expect(printed).toContain('Rate-Limit-Antworten: 13')
    expect(printed).toContain('HTTP 429 / 403 Drosselungen: 12 / 1')
    expect(printed).toContain('Retry-After-Hinweise von Google: 2')
    expect(printed).toContain('2026-10-29T13:03:04.000Z')
    expect(printed).toContain('youtube-search-rate-limit-not-confirmed-quota')
    expect(JSON.stringify(report)+printed).not.toContain('PRIVATE_NEVER_EXPORT')
  })
  it('reports a quota-blocked discovery as degraded if known video and Firebase succeeded',()=>{
    const r=buildNightlyReport({...base,stages:{...base.stages,discovery:'failure'}})
    expect(r.status).toBe('degraded')
    expect(r.steps).toMatchObject({known:'success',firebase:'success',discovery:'failure'})
  })
  it('does not claim a complete report when Firebase or source QA is missing',()=>{
    expect(buildNightlyReport({...base,stages:{...base.stages,firebase:'failure'}}).status)
      .toBe('publish-not-confirmed')
    expect(buildNightlyReport({...base,sourceData:{youtube:qa.youtube}}).status)
      .toBe('incomplete-evidence')
  })
  it('writes only private aggregate JSON/Markdown from fresh allowlisted artifact paths',async()=>{
    const tmp=await mkdtemp(join(tmpdir(),'moviehub-chain-'))
    try{
      const env={NIGHT_GATE_RESULT:'success',NIGHT_DISCOVERY_RESULT:'failure',
        NIGHT_KNOWN_RESULT:'success',NIGHT_FIREBASE_RESULT:'success',
        GITHUB_REPOSITORY:'test/movie-hub',GITHUB_RUN_ID:'602',GITHUB_RUN_ATTEMPT:'1'}
      const source={
        'artifacts/youtube-g2/bidirectional-coverage/qa.json':qa.youtube,
        'public/waipu-live/index.json':qa.waipu,
        'public/joyn-live/index.json':qa.joyn,
        'public/tv-runtime/index.json':qa.tv,
      }
      const input=async path=>JSON.stringify(source[path])
      const result=await saveNightlyReport({env,input,out:tmp})
      expect(result.status).toBe('degraded')
      const raw=await readFile(join(tmp,'summary.json'),'utf8')
      const md=await readFile(join(tmp,'report.md'),'utf8')
      expect(raw).not.toMatch(/PRIVATE_|SECRET_API_TOKEN|videoId|watchUrl/)
      expect(md).toContain('YouTube')
      expect(md).toContain('Waipu')
      expect(md).toContain('Joyn')
      expect(md).toContain('TV-Runtime')
    }finally{await rm(tmp,{recursive:true,force:true})}
  })
})
