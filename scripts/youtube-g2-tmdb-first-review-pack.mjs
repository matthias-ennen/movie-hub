/**
 * AP2: private, lossless review pack from an actual bounded TMDB-first QA run.
 * No APIs, offers, routes, Firebase, catalog or badge writes.
 */
import {readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

export const TMDB_FIRST_REVIEW_PACK_KIND='moviehub-youtube-g2-tmdb-first-manual-review-pack'
const VIDEO=/^[A-Za-z0-9_-]{11}$/
const VALID=new Set(['review-single-video-candidate',
  'review-multiple-video-editions','review-weak-or-unresolved-videos',
  'no-video-candidate','no-current-tmdb-de-youtube-offer',
  'no-current-public-youtube-badge'])
const WRITES=['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
const LABEL={
  'review-multiple-video-editions':'compare-editions-and-publishers',
  'review-weak-or-unresolved-videos':'resolve-film-work-or-edition',
  'review-single-video-candidate':'verify-exact-work-offer-and-playback',
  'no-video-candidate':'no-exact-video-found',
  'no-current-tmdb-de-youtube-offer':'check-vanished-current-offer',
  'no-current-public-youtube-badge':'historical-badge-vanished-do-not-restore',
}
const PRIORITY={
  'review-multiple-video-editions':1,
  'review-weak-or-unresolved-videos':2,
  'review-single-video-candidate':3,
  'no-video-candidate':4,
  'no-current-tmdb-de-youtube-offer':5,
  'no-current-public-youtube-badge':6,
}
const safeText=x=>String(x??'').replace(/[<>|\r\n]/g,' ').replace(/\s+/g,' ').trim().slice(0,140)

export function buildTmdbFirstReviewPack(qa){
  const summary=qa?.summary,rows=qa?.rows
  if(summary?.mode!=='TMDB_FIRST_LINK_RESEARCH_ONLY'
    ||summary.publicationPermitted!==false||summary.verifiedDirectLinks!==0
    ||summary.verifiedSeriesEpisodes!==0||WRITES.some(k=>summary[k]!==0)
    ||!Array.isArray(rows)||!rows.length
    ||rows.length!==(summary.historicalCohortMovies??summary.selectedMovies)
    ||!Number.isInteger(summary.processedMovies)
    ||summary.processedMovies!==rows.filter(r=>r.status!=='no-current-public-youtube-badge').length
    ||!summary.statusCounts||typeof summary.statusCounts!=='object'
    ||Object.values(summary.statusCounts).some(n=>!Number.isInteger(n)||n<0)
    ||rows.some(r=>r.mediaType!=='movie'||!Number.isInteger(r.tmdbId)||r.tmdbId<=0
      ||!VALID.has(r.status)||r.publicationPermitted!==false
      ||r.directPlaybackRoute!==null||r.reviewedVideoId!==null
      ||!Array.isArray(r.videoCandidates)||r.videoCandidates.length>10
      ||r.videoCandidates.some(c=>!VIDEO.test(String(c?.videoId||'')))
      ||new Set(r.videoCandidates.map(c=>c.videoId)).size!==r.videoCandidates.length)
    ||new Set(rows.map(r=>r.tmdbId)).size!==rows.length){
    throw Error('TMDB_FIRST_REVIEW_PACK_UNTRUSTED_SOURCE')
  }
  const counted=Object.fromEntries([...VALID].map(s=>[s,rows.filter(r=>r.status===s).length]))
  if(Object.entries(summary.statusCounts).some(([s,n])=>!VALID.has(s)||counted[s]!==n)
    ||Object.values(counted).reduce((a,b)=>a+b,0)!==rows.length
    ||Object.values(summary.statusCounts).reduce((a,b)=>a+b,0)!==rows.length)
    throw Error('TMDB_FIRST_REVIEW_PACK_STATUS_COUNT_MISMATCH')
  // Only strong exact-video collisions across different films should flag a
  // cross-work conflict; weak shared search hits are NOT hard conflicts.
  const byVideo=new Map()
  for(const row of rows)for(const c of row.videoCandidates){
    if(c.strong!==true)continue
    const ids=byVideo.get(c.videoId)||new Set()
    ids.add(row.tmdbId)
    byVideo.set(c.videoId,ids)
  }
  const items=rows.map(row=>{
    const shared=row.videoCandidates.filter(c=>c.strong===true
      &&(byVideo.get(c.videoId)?.size??0)>1).map(c=>c.videoId)
    return {
      tmdbId:row.tmdbId,title:safeText(row.title),status:row.status,
      lane:shared.length?'cross-work-video-id-conflict':LABEL[row.status],
      priority:shared.length?0:PRIORITY[row.status],
      currentTmdbOfferTypes:Array.isArray(row.tmdbDeOfferTypes)
        ?row.tmdbDeOfferTypes.filter(x=>['free','ads','flatrate','rent','buy'].includes(x)):[],
      candidateVideos:row.videoCandidates.map(c=>({
        videoId:c.videoId,watchUrl:'https://www.youtube.com/watch?v='+c.videoId,
        title:safeText(c.videoTitle),channel:safeText(c.channelTitle),
        durationMinutes:Number.isFinite(c.durationMinutes)?c.durationMinutes:null,
        runtimeDelta:Number.isFinite(c.runtimeDelta)?c.runtimeDelta:null,
        strongMetadataHypothesis:c.strong===true,
        conflictingOtherMovie:shared.includes(c.videoId),
      })),
      checks:['exact-video-and-full-film-cut','DE-playback-on-Android-and-Fire-TV',
        'actual-DE-tariff-not-playlist-class','publisher-and-source-use-rights'],
      independentOfferApproved:false,playbackRoute:null,publicationPermitted:false,
    }
  }).sort((a,b)=>a.priority-b.priority||a.tmdbId-b.tmdbId)
  return {
    kind:TMDB_FIRST_REVIEW_PACK_KIND,privateArtifact:true,
    sourceMode:summary.mode,sourceSelectedFilms:rows.length,
    actuallyApiResearchedMovies:summary.processedMovies,
    videoSearchCalls:summary.calls?.youtubeSearches??null,
    lanes:Object.fromEntries([...new Set(items.map(x=>x.lane))].sort()
      .map(lane=>[lane,items.filter(x=>x.lane===lane).length])),
    items,verifiedDEOffers:0,approvedDirectLinks:0,publicationPermitted:false,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,
  }
}
export function renderTmdbFirstReviewPack(pack){
  if(pack?.kind!==TMDB_FIRST_REVIEW_PACK_KIND||pack.publicationPermitted!==false)
    throw Error('TMDB_FIRST_REVIEW_PACK_OUTPUT_INVALID')
  return [
    '# MovieHub YouTube G2 – TMDB-first: gebündelte manuelle Prüfung',
    '',
    '- Tatsächlich via API untersuchte Filme: **'+pack.actuallyApiResearchedMovies+
      '** von **'+pack.sourceSelectedFilms+'**.',
    '- **0 verifizierte DE-Angebote, 0 freigegebene Direktlinks.**',
    '- Nur privates Reviewer-Artefakt: niemals in öffentlichen Katalog, Hosting oder Firestore übernehmen.',
    '- Für jede Kandidaten-ID: Film/Fassung, DE-Wiedergabe und echten Tarif samt Quellen-/Nutzungsrecht unabhängig prüfen.',
    '- Historisch entfallene TMDB-YouTube-Badges NICHT durch Suche wiederherstellen.',
    '',
    '| TMDB Film | Prüfklasse | Konkrete Kandidaten zur Prüfung |',
    '| --- | --- | --- |',
    ...pack.items.map(r=>'| movie:'+r.tmdbId+' '+r.title+' | '+r.lane+' | '+
      (r.candidateVideos.map(c=>c.videoId+' ('+c.channel+')').join('; ')||'–')+' |'),
    '',
    '**Freigabestatus: AUSSTEHEND.** Diese Liste ist keine technische oder rechtliche Bestätigung.',
  ].join('\n')+'\n'
}
export async function writeTmdbFirstReviewPack({
  source='artifacts/youtube-g2/tmdb-first-link-pilot/qa.json',
  output='artifacts/youtube-g2/tmdb-first-link-pilot',
}={}){
  const qa=JSON.parse(await readFile(source,'utf8'))
  const pack=buildTmdbFirstReviewPack(qa)
  await writeFile(output+'/review-queue.json',JSON.stringify(pack,null,2)+'\n',{mode:0o600})
  await writeFile(output+'/review-queue.md',renderTmdbFirstReviewPack(pack),{mode:0o600})
  return pack
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  writeTmdbFirstReviewPack().catch(e=>{console.error(e.message);process.exitCode=1})
}
