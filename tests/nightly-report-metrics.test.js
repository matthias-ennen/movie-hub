import {describe,it,expect} from 'vitest'
import {buildDataMetrics,compareNightly,phaseTimings,sanitizeDataMetrics,safeObservation} from '../scripts/nightly-report-metrics.mjs'
import {buildNightlyReport,nightlyMarkdown} from '../scripts/moviehub-nightly-chain-report.mjs'
const steps={tmdb:'success',waipuSync:'success',waipu:'success',joyn:'success',cacheRestore:'success',cacheSave:'success',xmltvStage:'success',xmltvMatch:'success',xmltvCanonical:'success',xmltvPublish:'success',youtube:'success',tv:'success',canonical:'success',publish:'success'}
const data={
  data:{kind:'movie-hub-data-status',catalog:{total:750,movies:500,series:250},searchIndex:{total:1000,movies:800,series:200}},
  baselineData:{kind:'movie-hub-data-status',catalog:{total:1000,movies:700,series:300},searchIndex:{total:1055}},
  tmdbChanges:{fetched:{movie:15,series:20}},
  waipu:{kind:'waipu-live-index',counts:{stations:50,titles:400,broadcasts:5000},metrics:{candidatePrograms:100,matchedPrograms:80,broadcastsRead:1000},horizon:{start:'2026-11-15T00:00:00Z',endExclusive:'2026-11-29T00:00:00Z'}},
  joyn:{kind:'joyn-live-index',stationCount:30,airingCount:2000},
  joynDiagnostic:{kind:'joyn-adapter-diagnostic',mapped:{uniquePrograms:100},matching:{matchedPrograms:50}},
  xmltvStage:{kind:'xmltv-g2-private-staging-aggregate',stagedSourceCount:3,availableIndependentFamilies:2,totalStagedProgrammes:1000,sources:[{status:'staged',stationCounts:{ard:10},maxLatestProgrammeMinutes:7200},{status:'staged',stationCounts:{zdf:10},maxLatestProgrammeMinutes:3600}]},
  xmltvMatch:{selectedCandidates:100,combinedMatched:40,additionalMatched:5,newTmdbApiRequests:0,deduplicatedRuntimeAirings:35},
  xmltvCanonical:{received:40,eligible:40,completeUniqueTitles:12,pendingUniqueTitles:0,projected:40,unresolved:0,deduplicated:5,stationsWithAirings:2},
  xmltvPublish:{stations:2,freshStations:2,retainedStations:0,airings:35},
  waipuCache:{actualSearchStarts:20,avoidedInitialSearches:80,priorRunHits:70,sameRunHits:10},
  joynCache:{actualSearchStarts:0,avoidedInitialSearches:0,priorRunHits:0,sameRunHits:0},
}
const qa={youtube:{kind:'moviehub-youtube-g2-bidirectional-coverage-baseline',youtubeFirst:{sourceVideos:10,editorialDirectLinks:4}},waipu:data.waipu,joyn:data.joyn,tv:{kind:'moviehub-tv-runtime-index',titleCount:15,titleShardTitleCount:5,airingCount:20,providers:[]}}
const run={stages:{gate:'success',discovery:'success',known:'success',firebase:'success'},generatedAt:'2026-11-16T05:00:00Z'}
describe('detailed counts-only Nightly report',()=>{
  it('keeps units separate and calculates actual matching ratios and fallback baseline',()=>{
    const m=buildDataMetrics(data,steps)
    expect(m.tmdb).toMatchObject({catalog:750,series:250,changedSeries:20})
    expect(m.waipu).toMatchObject({matchPercent:80,horizonDays:14})
    expect(m.joyn.matchPercent).toBe(50)
    expect(m.xmltv).toMatchObject({matchPercent:40,availableStations:2,maxHorizonDays:5})
    expect(m.cache).toMatchObject({avoidedInitialSearches:80,actualSearchStarts:20})
    const report=buildNightlyReport({...run,sourceData:{...qa,dataMetrics:m}})
    expect(report.comparison.find(r=>r.key==='catalog')).toMatchObject({previous:1000,delta:-25,severity:'critical',samples:0})
    expect(report.dataMetrics.tmdb).toMatchObject({changedMovies:15,changedSeries:20})
    expect(report.dataMetrics.xmltv.canonical.deduplicated).toBe(5)
    expect(report.adapters.tv).toMatchObject({titles:5,titleDayEntries:15})
    expect(report.history.at(-1).stock).toMatchObject({tvUniqueTitles:5,tvTitleDayEntries:15})
    expect(report.comparison.find(r=>r.key==='xmltvStations').severity).toBe('no-baseline')
    expect(report.status).toBe('degraded')
    expect(nightlyMarkdown(report)).toContain('XMLTV')
  })
  it('reports failed imports as stale, excludes them and substitutes no zero for missing counters',()=>{
    const m=buildDataMetrics({...data,joynCache:null},{...steps,joyn:'failure',xmltvMatch:'failure'})
    expect(m.joyn).toMatchObject({fresh:false,matched:null,matchPercent:null})
    expect(m.xmltv.match).toBe(null)
    expect(m.cache.avoidedInitialSearches).toBe(null)
    const report=buildNightlyReport({...run,sourceData:{...qa,dataMetrics:m}})
    expect(report.comparison.find(r=>r.key==='joynAirings').severity).toBe('stale')
    expect(report.history.at(-1).stock.joynAirings).toBe(null)
    expect(report.history.at(-1).stock.xmltvAirings).toBe(null)
  })
  it('compares last valid day and trailing average without using same-day or older rows',()=>{
    const m=buildDataMetrics(data,steps)
    const report=buildNightlyReport({...run,sourceData:{...qa,dataMetrics:m},history:[
      {day:'2026-11-01',stock:{catalog:99999}},
      {day:'2026-11-14',stock:{catalog:900}},
      {day:'2026-11-15',stock:{catalog:1000}},
      {day:'2026-11-16',stock:{catalog:1}},
    ]})
    expect(report.comparison.find(r=>r.key==='catalog')).toMatchObject({previous:1000,mean:950,samples:2,delta:-25,trend:-21.1})
    expect(report.history).toHaveLength(3)
  })
  it('does not compare legacy TV day-entry history as unique titles',()=>{
    const m=buildDataMetrics(data,steps)
    const report=buildNightlyReport({...run,sourceData:{...qa,dataMetrics:m},history:[{day:'2026-11-15',stock:{tvTitles:15}}]})
    expect(report.comparison.find(r=>r.key==='tvUniqueTitles').previous).toBe(null)
    expect(report.comparison.find(r=>r.key==='tvTitleDayEntries').previous).toBe(15)
  })
  it('warns about a delayed Berlin-local scheduled start',()=>{
    const report=buildNightlyReport({...run,scheduled:true,sourceData:{...qa,dataMetrics:buildDataMetrics(data,steps)},jobs:[{name:'Enforce one trusted scheduled night per Berlin day',conclusion:'success',started_at:'2026-11-16T02:40:42Z',completed_at:'2026-11-16T02:40:49Z'}]})
    expect(report.warnings.some(x=>x.includes('210 Minuten später'))).toBe(true)
  })
  it('projects only allowed fields and never raw inputs or private IDs',()=>{
    const m=buildDataMetrics(data,steps)
    m.waipu.secret='SECRET_PRIVATE_ID'
    m.xmltv.match.title='SECRET_PRIVATE_TITLE'
    m.steps.waipu='SECRET_PRIVATE_ERROR'
    const report=buildNightlyReport({...run,sourceData:{...qa,dataMetrics:m}})
    expect(JSON.stringify(report)+nightlyMarkdown(report)).not.toContain('SECRET_PRIVATE')
    expect(safeObservation('waipu-cache',{kind:'g2v-original-adapter-persistent-reuse',sourceId:'joyn'})).toBe(null)
  })
  it('uses actual completed GitHub step spans, never invents timing for skipped phases',()=>{
    const p=phaseTimings([{name:'test',steps:[{name:'Refresh curated 228-station Waipu grid',started_at:'2026-11-16T00:00:00Z',completed_at:'2026-11-16T00:01:00Z',conclusion:'success'},{name:'Match and publish curated 228-station Waipu catalog',started_at:'2026-11-16T00:02:00Z',completed_at:'2026-11-16T00:04:00Z',conclusion:'success'}]}])
    expect(p.find(x=>x.key==='waipu')).toMatchObject({seconds:240,result:'success'})
    expect(p.find(x=>x.key==='xmltv')).toMatchObject({seconds:null,result:'unknown'})
  })
})
