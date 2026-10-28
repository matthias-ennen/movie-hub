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
