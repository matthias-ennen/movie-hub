/**
 * Bounded, anonymized MovieHub 00:10 chain report (#388).
 * Only project explicitly named numeric QA fields; never copy raw source
 * artifacts, video IDs, watch URLs, titles, private GCS data or API errors.
 * Publishing this report never mutates MovieHub or calls a provider API.
 */
import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'

const OUT='artifacts/moviehub-nightly'
const source={
  youtube:'artifacts/youtube-g2/bidirectional-coverage/qa.json',
  waipu:'public/waipu-live/index.json',
  joyn:'public/joyn-live/index.json',
  tv:'public/tv-runtime/index.json',
}
const n=x=>Number.isSafeInteger(x)&&x>=0?x:null
const safeTime=x=>typeof x==='string'&&!Number.isNaN(Date.parse(x))
  ?new Date(x).toISOString():null
const result=x=>['success','failure','skipped','cancelled'].includes(x)?x:'unknown'

async function load(input,path){
  try{return JSON.parse(await input(path,'utf8'))}
  catch{return null}
}
export function buildNightlyReport({stages,sourceData={},runId=null,runAttempt=null,
  repository=null,generatedAt=new Date().toISOString()}={}){
  const steps=Object.fromEntries(
    ['gate','discovery','known','firebase'].map(k=>[k,result(stages?.[k])]))
  const youtube=sourceData.youtube?.kind==='moviehub-youtube-g2-bidirectional-coverage-baseline'
    ?sourceData.youtube:null
  const wf=sourceData.waipu?.kind==='waipu-live-index'?sourceData.waipu:null
  const joyn=sourceData.joyn?.kind==='joyn-live-index'?sourceData.joyn:null
  const tv=sourceData.tv?.kind==='moviehub-tv-runtime-index'?sourceData.tv:null
  const qa={
    youtube:youtube?{
      sourceVideos:n(youtube.youtubeFirst?.sourceVideos),
      playlistEditorialLinks:n(youtube.youtubeFirst?.editorialDirectLinks),
      playlistReviewCases:n(youtube.youtubeFirst?.reviewOnlyVideos),
      newCanonicalTmdbMetadata:n(youtube.youtubeFirst?.newTmdbFilmMetadata),
      publicYoutubeBadgedMovies:n(youtube.tmdbFirst?.publicYoutubeBadgedMovies),
      independentlyVerifiedDETitleRoutes:n(youtube.totalVerifiedDETitleRoutes),
      observedAt:safeTime(youtube.generatedAt),
    }:null,
    waipu:wf?{
      stations:n(wf.counts?.stations),titles:n(wf.counts?.titles),
      broadcasts:n(wf.counts?.broadcasts),
      status:wf.status==='complete'?'complete':'not-complete',
      observedAt:safeTime(wf.generatedAt),
    }:null,
    joyn:joyn?{
      stations:n(joyn.stationCount),airings:n(joyn.airingCount),
      status:joyn.status==='complete'?'complete':'not-complete',
      observedAt:safeTime(joyn.generatedAt),
    }:null,
    tv:tv?{
      titles:n(tv.titleCount),airings:n(tv.airingCount),
      providerCount:Array.isArray(tv.providers)?n(tv.providers.length):null,
      observedAt:safeTime(tv.generatedAt),
    }:null,
  }
  const firebaseSucceeded=steps.firebase==='success'
  const missingQA=Object.entries(qa).filter(([,v])=>!v).map(([k])=>k)
  const status=!firebaseSucceeded?'publish-not-confirmed'
    :missingQA.length?'incomplete-evidence'
      :steps.discovery==='success'&&steps.known==='success'?'success':'degraded'
  const id=n(Number(runId)),attempt=n(Number(runAttempt))
  const goodRepo=typeof repository==='string'
    &&/^[-\w]+\/[-\w.]+$/.test(repository)?repository:null
  return {
    kind:'moviehub-nightly-complete-chain',schemaVersion:1,
    generatedAt:safeTime(generatedAt),
    run:id&&id>0&&goodRepo?{
      id,attempt,url:`https://github.com/${goodRepo}/actions/runs/${id}`,
    }:null,
    status,steps,sourceQaAvailability:Object.fromEntries(
      Object.entries(qa).map(([k,v])=>[k,Boolean(v)])),
    adapters:qa,
    // A reservation is not proof of an actual search call. This report does
    // not have authenticated quota data or make any offer/right assertions.
    youtubeSearchCallsMeasuredHere:false,googleRemainingQuota:null,
    sourceVideoIdsIncluded:false,verifiedDEOfferInferred:false,
    productionMutationsByReport:0,
  }
}
export function nightlyMarkdown(report){
  const stageNames={gate:'00:10 Start-/Doppellauf-Gate',
    discovery:'YouTube Discovery (limitierte Suche)',
    known:'YouTube videos.list Recheck (0 Suchen)',
    firebase:'Firebase Import + Hosting'}
  const lines=['# MovieHub · vollständiger Nachtlaufbericht','',
    '- Ergebnis: **'+report.status+'**',
    '- Zeitpunkt: '+(report.generatedAt??'unknown'),
    ...(report.run?['- GitHub: '+report.run.url]:[]),'',
    '## Ablauf','',
    ...Object.entries(stageNames).map(([k,name])=>'- '+name+': **'+report.steps[k]+'**'),
    '',
    '## Adapter und Datenquellen','',
  ]
  for(const [key,title,props] of [
    ['youtube','YouTube',['sourceVideos','playlistEditorialLinks','playlistReviewCases','newCanonicalTmdbMetadata','publicYoutubeBadgedMovies','independentlyVerifiedDETitleRoutes']],
    ['waipu','Waipu',['stations','titles','broadcasts','status']],
    ['joyn','Joyn',['stations','airings','status']],
    ['tv','TV-Runtime / gemeinsame Quelle',['titles','airings','providerCount']],
  ]){
    const a=report.adapters[key]
    lines.push('### '+title)
    lines.push(a?props.map(p=>'- '+p+': '+(a[p]??'unbekannt')).join('\n')
      :'- Quell-QA aus diesem Deploy nicht verfügbar (kein bestätigter Wert).')
    if(a?.observedAt)lines.push('- Datenstand: '+a.observedAt)
    lines.push('')
  }
  lines.push('## Sicherheit und Interpretation','',
    '- Discovery-Fehler bleiben sichtbar; Firebase kann den letzten validierten Datenstand weiter veröffentlichen.',
    '- Keine YouTube-Restquote aus diesem Bericht abgeleitet; keine Such-Reservierung durch den Bericht.',
    '- Playlist-/Best-Effort-Links sind keine unabhängig belegten deutschen Kauf-/Leih-/Gratisangebote.',
    '- Keine Rohvideo-IDs, Watch-URLs, privaten Queue-Einträge oder sensiblen API-Fehler im Bericht.',
    '- GitHub-Run-Status und tatsächliche Firebase-Hosting-Readbacks sind getrennt zu prüfen.','')
  return lines.join('\n')
}
export async function saveNightlyReport({env=process.env,input=readFile,out=OUT}={}){
  const report=buildNightlyReport({
    stages:{
      gate:env.NIGHT_GATE_RESULT,discovery:env.NIGHT_DISCOVERY_RESULT,
      known:env.NIGHT_KNOWN_RESULT,firebase:env.NIGHT_FIREBASE_RESULT,
    },
    sourceData:Object.fromEntries(await Promise.all(
      Object.entries(source).map(async ([k,p])=>[k,await load(input,p)]))),
    repository:env.GITHUB_REPOSITORY,
    runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
  })
  const jsonPath=out+'/summary.json',mdPath=out+'/report.md'
  await mkdir(dirname(jsonPath),{recursive:true})
  await writeFile(jsonPath,JSON.stringify(report,null,2)+'\n',{mode:0o600})
  const md=nightlyMarkdown(report)
  await writeFile(mdPath,md+'\n',{mode:0o600})
  if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,md+'\n')
  console.log(JSON.stringify({kind:report.kind,status:report.status,
    steps:report.steps,sourceQaAvailability:report.sourceQaAvailability,
    quotaKnown:false,publishedDEOffersImplied:false}))
  if(report.status==='incomplete-evidence'||report.status==='publish-not-confirmed')
    throw Error('MOVIEHUB_NIGHTLY_REPORT_INCOMPLETE_OR_FIREBASE_NOT_CONFIRMED')
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  saveNightlyReport().catch(e=>{console.error(e.message);process.exitCode=1})
