/**
 * Rebuild the remaining 49 playlist review tasks from the original protected
 * 55-video metadata QA, without any network/API requests or approval writes.
 * This renderer does not make identity, entitlement or DE playback claims.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {OPEN55_KIND} from './youtube-g2-pending-video-refresh.mjs'

const VIDEO=/^[A-Za-z0-9_-]{11}$/
const PRIORITY_MOVIES=[8337,8922,9742,10042,49530,390051]
const LANES=[
  ['ambiguous-work-identity',16,'Werkidentitaet: konkurrierende Filmwerke, Titel, Jahre und TMDB-IDs anhand unabhaengiger Belege trennen'],
  ['movie-versus-series',11,'Film/Serie: Originalvideo gegen Film, Staffel/Folge und vollstaendigen Inhalt unabhaengig pruefen'],
  ['missing-video-metadata',9,'Metadaten fehlen: kein direkter Link; Quellvideo und Dauer ohne Such-Retry manuell klaeren'],
  ['edition-or-source-conflict',6,'Fassung/Quelle: Laufzeit, Schnitt, Uploadquelle und Rechte getrennt nachweisen'],
  ['new-release-content-check',4,'Aktuelle Veroeffentlichung: Trailer, Ausschnitte und Vollfilm sowie Filmjahr sicher unterscheiden'],
  ['region-excluded',1,'Deutschland ausgeschlossen: keinen DE-Wiedergabeweg freigeben; Original-Regionssignal pruefen'],
  ['short-video-not-full-film',1,'Kurzvideo: Vollfilmqualitaet und Werkidentitaet nicht unterstellen'],
  ['unresolved-title',1,'Ungeklaerter Titel: Filmwerk und Anbieter ohne neue Suche erst separat identifizieren'],
]
const clean=x=>String(x??'unbekannt').replace(/[\r\n|<>\x60]/g,' ').slice(0,150)
const count=(rows,key)=>{
  const counts={}
  for(const r of rows)counts[r[key]]=(counts[r[key]]||0)+1
  return counts
}
const sameCounts=(actual,rows,key)=>{
  if(!actual||typeof actual!=='object'||Array.isArray(actual))return false
  const c=count(rows,key)
  return Object.keys(actual).length===Object.keys(c).length
    &&Object.entries(c).every(([k,v])=>actual[k]===v)
}
export function renderPendingRestOfflineReview(qa){
  const s=qa?.summary
  if(s?.kind!==OPEN55_KIND||s.sourceVideoIds!==87
    ||s.publishedEditorialLinks!==32||s.pendingVideoIds!==55
    ||s.videosListCalls!==2||s.searchListCalls!==0
    ||s.readyForIndividualIdentityReview!==6
    ||s.verifiedGermanOffers!==0||s.approvedDirectRoutes!==0
    ||s.firestoreWrites!==0||s.catalogWrites!==0
    ||s.providerWrites!==0||s.badgeWrites!==0
    ||s.privateArtifact!==true||s.publicationPermitted!==false
    ||!Number.isFinite(Date.parse(s.generatedAt))
    ||Date.parse(s.generatedAt)<Date.parse('2026-10-24T17:00:00Z')
    ||Date.parse(s.generatedAt)>Date.parse('2026-10-25T00:00:00Z')
    ||!Array.isArray(qa.rows)||qa.rows.length!==55
    ||!Array.isArray(qa.reviewPriority)||qa.reviewPriority.length!==6
    ||!sameCounts(s.pendingLaneCounts,qa.rows,'existingReviewLane')
    ||!sameCounts(s.videoStatusCounts,qa.rows,'videoStatus'))
    throw Error('YOUTUBE_OFFLINE_REST_SOURCE_NOT_TRUSTED')
  const seen=new Set()
  for(const row of qa.rows){
    if(!VIDEO.test(row?.videoId)||seen.has(row.videoId)
      ||!['FREE','R&B'].includes(row.playlistClass)
      ||!['video-details-current','video-details-not-eligible',
        'metadata-not-returned','DE-excluded-metadata','short-video-metadata'].includes(row.videoStatus)
      ||!Number.isInteger(row.priority)||row.priority<0
      ||(row.suggestedTmdbId!==null
        &&(!Number.isInteger(row.suggestedTmdbId)||row.suggestedTmdbId<=0))
      ||!Array.isArray(row.alternatives)||row.alternatives.length>3
      ||row.alternatives.some(c=>!Number.isInteger(c?.tmdbId)||c.tmdbId<=0)
      ||(row.suggestedTmdbId!==null
        &&row.alternatives[0]?.tmdbId!==row.suggestedTmdbId)
      ||row.approvedWorkIdentity!==false||row.verifiedGermanOffer!==false
      ||row.approvedPlaybackRoute!==null
      ||typeof row.identityReviewReady!=='boolean')
      throw Error('YOUTUBE_OFFLINE_REST_ROW_UNSAFE')
    seen.add(row.videoId)
  }
  const byId=new Map(qa.rows.map(r=>[r.videoId,r]))
  const prioritized=new Set()
  for(const row of qa.reviewPriority){
    const actual=byId.get(row?.videoId)
    if(!actual||prioritized.has(row.videoId)
      ||!actual.identityReviewReady||!row.identityReviewReady
      ||actual.suggestedTmdbId!==row.suggestedTmdbId
      ||row.approvedWorkIdentity!==false
      ||row.verifiedGermanOffer!==false||row.approvedPlaybackRoute!==null)
      throw Error('YOUTUBE_OFFLINE_REST_PRIORITY_FORGED')
    prioritized.add(row.videoId)
  }
  const ids=qa.reviewPriority.map(x=>x.suggestedTmdbId).sort((a,b)=>a-b)
  if(JSON.stringify(ids)!==JSON.stringify([...PRIORITY_MOVIES].sort((a,b)=>a-b))
    ||qa.rows.filter(r=>r.identityReviewReady).length!==6)
    throw Error('YOUTUBE_OFFLINE_REST_PRIORITY_MISMATCH')
  const remaining=qa.rows.filter(r=>!prioritized.has(r.videoId))
  if(remaining.length!==49||remaining.some(r=>r.identityReviewReady))
    throw Error('YOUTUBE_OFFLINE_REST_49_COVERAGE_MISMATCH')
  for(const [lane,n] of LANES){
    if(remaining.filter(r=>r.existingReviewLane===lane).length!==n)
      throw Error('YOUTUBE_OFFLINE_REST_LANE_COVERAGE_MISMATCH')
  }
  if(remaining.some(r=>!LANES.some(([lane])=>lane===r.existingReviewLane)))
    throw Error('YOUTUBE_OFFLINE_REST_UNKNOWN_LANE')
  const lines=[
    '# MovieHub YouTube – die weiteren 49 offenen Videos (geschuetzte Offline-Pruefauftraege)',
    '',
    '**Historischer Quellzeitpunkt:** '+s.generatedAt+'; echter Ursprung: GitHub Actions 40115074408, Versuch 2, Artefakt 12569251342.',
    '**Keine aktuellen YouTube-API-Abfragen, keine neuen Film- oder DE-Angebotsbeweise.**',
    '87 bekannte Playlistvideos = 32 redaktionelle Hinweise + 6 priorisierte Filmhypothesen + 49 weitere offene Prueffaelle.',
    '49 ist eine Zahl von Review-IDs, nicht von nachgewiesenen Filmen, Anbietern oder Wiedergaberouten.',
    '',
    '| Klasse | Anzahl |',
    '| --- | ---: |',
    ...LANES.map(([lane,n])=>'| '+lane+' | '+n+' |'),
    '| **Summe (ohne priorisierte sechs)** | **49** |',
    '',
    '**Allgemeines Freigabe-Gate je Video:** unabhaengige Film-/Fassungspruefung, erlaubte Quellenverwendung (#112), tatsaechlich belegtes DE-Angebot und separate Android-/Fire-TV-Abnahme. Bis dahin kein Provider-/Badge-/Playback-Write.',
    '',
  ]
  for(const [lane,n,action] of LANES){
    lines.push('## '+lane+' ('+n+')','','**Naechster Pruefschritt:** '+action,'')
    const group=remaining.filter(r=>r.existingReviewLane===lane)
      .sort((a,b)=>a.priority-b.priority||a.videoId.localeCompare(b.videoId))
    group.forEach((r,index)=>{
      lines.push('### '+(index+1)+'. '+clean(r.recordedSourceTitle),'',
        '- Exakte Video-ID: `'+r.videoId+'`',
        '- Original: https://www.youtube.com/watch?v='+r.videoId,
        '- Playlist-Hinweis (kein Tarifnachweis): '+clean(r.playlistClass),
        '- Metadatenstatus: '+clean(r.videoStatus)+'; DE-Regionssignal: '+clean(r.regionSignal),
        '- Video-Titel laut alter QA: '+clean(r.currentVideoTitle),
        '- Video-Dauer laut alter QA: '+(Number.isFinite(r.minutes)?r.minutes+' Min.':'nicht verfuegbar'),
        '- TMDB-Arbeitshypothese (unbestaetigt): '+
          (r.suggestedTmdbId===null?'keine':'movie:'+r.suggestedTmdbId),
        '- Alternative Film-IDs: '+(r.alternatives.map(x=>'movie:'+x.tmdbId).join(', ')||'keine'),
        '- [ ] Film/Serie, Jahr, Fassung und vollstaendiges Werk unabhaengig geprueft',
        '- [ ] Quelle, Rechte und YouTube-API-Policies inkl. #112 separat geprueft',
        '- [ ] Deutschland: wirkliches FREE/ADS/RENT/BUY/kein Angebot mit Nachweis geprueft',
        '- [ ] Android- und Fire-TV-Wiedergabe getrennt getestet und belegt',
        '- **Entscheidung:** offen, keine DE-Wiedergabe- oder Filmfreigabe','')
    })
  }
  const summary={
    kind:'moviehub-youtube-g2-49-nonpriority-offline-review',
    sourceRun:40115074408,sourceAttempt:2,sourceArtifactId:12569251342,
    sourceMeasuredAt:s.generatedAt,originalPendingVideoIds:55,
    separateTopPriorityReview:6,remainingReviewIds:49,
    remainingLaneCounts:Object.fromEntries(LANES.map(([k,n])=>[k,n])),
    currentYouTubeCalls:0,currentYouTubeSearchCalls:0,
    independentGermanOffersApproved:0,directPlaybackRoutesApproved:0,
    publicationPermitted:false,privateArtifact:true,
    firestoreWrites:0,catalogWrites:0,providerWrites:0,
  }
  return {summary,markdown:lines.join('\n')+'\n'}
}
export async function runPendingRestOfflineReview({input,output}={}){
  if(!input||!output||process.env.YOUTUBE_G2_WRITE_MODE)
    throw Error('YOUTUBE_OFFLINE_REST_INPUT_OUTPUT_REQUIRED_NO_WRITES')
  const qa=JSON.parse(await readFile(input,'utf8'))
  const {summary,markdown}=renderPendingRestOfflineReview(qa)
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/remaining-49-review.md',markdown,{mode:0o600}),
    writeFile(output+'/remaining-49-summary.json',JSON.stringify(summary,null,2)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify(summary))
  return summary
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runPendingRestOfflineReview({input:process.argv[2],output:process.argv[3]})
    .catch(e=>{console.error('YOUTUBE_OFFLINE_REST_FAIL_CLOSED: '+e.message);process.exitCode=1})
}
