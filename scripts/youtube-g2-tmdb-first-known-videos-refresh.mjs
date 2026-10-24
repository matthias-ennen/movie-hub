/**
 * Refresh exactly known YouTube video IDs from trusted prior real API QA,
 * without search.list. Re-score each current video against the same TMDB
 * movie identity and current DE WatchProvider evidence. Review-only:
 * neither search rank nor official video metadata is playback entitlement.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getSecret,youtubeGet} from './youtube-api-smoke.mjs'
import {loadPublicMovieHubIndex} from './youtube-g2-tmdb-first-link-pilot.mjs'
import {buildArchivedTmdbFirstReview,ARCHIVED_SOURCE_RUN}
  from './youtube-g2-tmdb-first-archived-review.mjs'
import {TMDB_FIRST_GOLDEN} from './youtube-g2-quality-golden.mjs'
import {
  exactYoutubeProviderIds,exactDeYoutubeOfferTypes,
  evaluateTmdbFirstYoutubeLinks,
} from './youtube-g2-tmdb-first-link-model.mjs'

export const MAX_RECHECK_VIDEO_IDS=250
export const MAX_RECHECK_VIDEO_CALLS=5
export const MAX_RECHECK_TMDB_CALLS=51
export const ARCHIVE_PATH='artifacts/youtube-g2/tmdb-first-link-pilot/qa.json'
export const OUTPUT='artifacts/youtube-g2/tmdb-first-current-known-video-review'
export const REVIEW_KIND='moviehub-youtube-g2-tmdb-first-existing-video-refresh'
const videoId=id=>/^[A-Za-z0-9_-]{11}$/.test(String(id||''))
const positive=x=>Number.isInteger(Number(x))&&Number(x)>0
const badge=x=>Array.isArray(x?.providerIds)&&x.providerIds.includes('youtube')
  ||Array.isArray(x?.providerOffers)&&x.providerOffers.some(p=>p?.id==='youtube')
export async function refreshKnownTmdbFirstVideoCandidates({
  archive,publicIndex,tmdbGet,youtubeApi,now=new Date().toISOString(),
}={}){
  // This checks original exact 25 TMDB IDs, 0 approved offers, 0 writes and
  // the original 50-search budget before any network fetch.
  const provenance=buildArchivedTmdbFirstReview(archive)
  const stamp=new Date(now).toISOString()
  const age=Date.parse(stamp)-Date.parse(publicIndex?.generatedAt||'')
  if(publicIndex?.kind!=='search-index'||publicIndex?.version!==1
    ||publicIndex?.country!=='DE'||publicIndex?.source==='fallback'
    ||!Array.isArray(publicIndex?.entries)||publicIndex.count!==publicIndex.entries.length
    ||publicIndex.entries.length<100||!Number.isFinite(age)
    ||age< -86400000||age>30*86400000
    ||typeof tmdbGet!=='function'||typeof youtubeApi!=='function'){
    throw Error('CURRENT_KNOWN_VIDEO_PUBLIC_SOURCE_INVALID')
  }
  const publicBadges=new Set(publicIndex.entries.filter(e=>
    e?.type==='movie'&&positive(e?.tmdbId)&&badge(e)).map(e=>Number(e.tmdbId)))
  let tmdbCalls=0,videoCalls=0
  const tm=async(path,params={})=>{
    if(!/^\/(?:watch\/providers\/movie|movie\/[1-9]\d*(?:\/watch\/providers)?)$/.test(path)
      ||++tmdbCalls>MAX_RECHECK_TMDB_CALLS)
      throw Error('CURRENT_KNOWN_VIDEO_TMDB_BUDGET_OR_PATH')
    return tmdbGet(path,params)
  }
  const directory=await tm('/watch/providers/movie',{language:'de-DE',watch_region:'DE'})
  const youtubeProviderIds=exactYoutubeProviderIds(directory)
  if(!youtubeProviderIds.length)throw Error('CURRENT_KNOWN_VIDEO_YOUTUBE_PROVIDER_MISSING')
  const chosen=[],requested=new Set()
  for(const row of archive.rows){
    if(!publicBadges.has(row.tmdbId)){
      chosen.push({row,offerTypes:[],film:null,reason:'current-public-youtube-badge-missing'})
      continue
    }
    const offers=exactDeYoutubeOfferTypes(
      await tm('/movie/'+row.tmdbId+'/watch/providers'),youtubeProviderIds)
    if(!offers.length){
      chosen.push({row,offerTypes:[],film:null,reason:'current-DE-youtube-offer-missing'})
      continue
    }
    const film=await tm('/movie/'+row.tmdbId,{
      language:'de-DE',append_to_response:'alternative_titles,credits,external_ids',
    })
    if(Number(film?.id)!==row.tmdbId)
      throw Error('CURRENT_KNOWN_VIDEO_TMDB_FILM_IDENTITY_CHANGED')
    for(const candidate of row.videoCandidates){
      if(!videoId(candidate?.videoId))throw Error('CURRENT_KNOWN_VIDEO_ID_INVALID')
      requested.add(candidate.videoId)
    }
    chosen.push({row,offerTypes:offers,film,reason:null})
  }
  if(requested.size>MAX_RECHECK_VIDEO_IDS)
    throw Error('CURRENT_KNOWN_VIDEO_UNEXPECTED_REQUEST_VOLUME')
  const raw=new Map(), ids=[...requested]
  for(let i=0;i<ids.length;i+=50){
    if(++videoCalls>MAX_RECHECK_VIDEO_CALLS)
      throw Error('CURRENT_KNOWN_VIDEO_LOOKUP_HARD_STOP')
    const batch=ids.slice(i,i+50)
    const allowed=new Set(batch)
    const response=await youtubeApi('videos',{
      part:'snippet,contentDetails,status',id:batch.join(','),
    })
    if(!Array.isArray(response?.items)
      ||response.items.some(x=>!allowed.has(x?.id)||raw.has(x.id)))
      throw Error('CURRENT_KNOWN_VIDEO_RESPONSE_UNTRUSTED')
    for(const x of response.items)raw.set(x.id,x)
  }
  const rows=chosen.map(({row,offerTypes,film,reason})=>{
    const current=reason==='current-public-youtube-badge-missing'
      ?{...row,status:'no-current-public-youtube-badge',
        tmdbDeOfferTypes:[],videoCandidates:[],reviewedVideoId:null,
        directPlaybackRoute:null,publicationPermitted:false}
      :reason==='current-DE-youtube-offer-missing'
        ?{...row,status:'no-current-tmdb-de-youtube-offer',
          tmdbDeOfferTypes:[],videoCandidates:[],reviewedVideoId:null,
          directPlaybackRoute:null,publicationPermitted:false}
        :evaluateTmdbFirstYoutubeLinks(
          {mediaType:'movie',tmdbId:row.tmdbId,title:row.title,
            originalTitle:row.originalTitle,year:row.year},
          film,offerTypes,row.videoCandidates.map(c=>raw.get(c.videoId)).filter(Boolean),
          {observedAt:stamp})
    return {
      ...current,
      archivedStatus:row.status,
      archivedVideoCandidateCount:row.videoCandidates.length,
      currentMetadataResolvedForArchivedCandidates:
        row.videoCandidates.filter(x=>raw.has(x.videoId)).length,
      currentVideoCandidateCount:current.videoCandidates.length,
      candidateReviewOnly:true,approvedDEOffer:false,
      playbackRoute:null,publicationPermitted:false,
    }
  })
  if(rows.length!==TMDB_FIRST_GOLDEN.length
    ||rows.some(x=>x.publicationPermitted!==false
      ||x.approvedDEOffer!==false||x.playbackRoute!==null
      ||x.directPlaybackRoute!==null)
    ||new Set(rows.map(x=>x.tmdbId)).size!==25){
    throw Error('CURRENT_KNOWN_VIDEO_UNVERIFIED_ROUTE_REJECTED')
  }
  const summary={
    kind:REVIEW_KIND,sourceRun:ARCHIVED_SOURCE_RUN,
    observationMode:'fresh-videos-list-of-archived-ids-no-new-search',
    generatedAt:stamp,privateArtifact:true,publicationPermitted:false,
    originalMovieCohort:25,
    currentPublicBadges:chosen.filter(c=>c.reason!=='current-public-youtube-badge-missing').length,
    currentTmdbDEYoutubeOffers:chosen.filter(c=>c.offerTypes.length>0).length,
    archivedCandidateEntries:provenance.summary.rawCandidateCount,
    archivedDistinctIds:provenance.summary.distinctVideoIds,
    uniqueKnownIdsRequested:ids.length,videoIdsResolved:raw.size,
    unavailableOrDeletedVideoIds:ids.length-raw.size,
    videoLookups:videoCalls,youtubeSearchCalls:0,tmdbReadCalls:tmdbCalls,
    currentStatuses:Object.fromEntries([...new Set(rows.map(x=>x.status))].sort()
      .map(status=>[status,rows.filter(x=>x.status===status).length])),
    statusChangesFromArchived:rows.filter(x=>x.status!==x.archivedStatus).length,
    independentlyVerifiedDEOffers:0,publishedDirectRoutes:0,
    firestoreWrites:0,catalogWrites:0,providerWrites:0,badgeWrites:0,
  }
  return {summary,rows}
}
export function renderCurrentKnownReview(result){
  const {summary,rows}=result
  return [
    '# YouTube G2 – aktueller video.list-Abgleich bekannter TMDB-first-Kandidaten',
    '',
    '- Ausgangspunkt: echter historischer 25-Film-Run #'+summary.sourceRun,
    '- Aktuelle YouTube Suchaufrufe: **0**; videos.list Batches: '+summary.videoLookups,
    '- Historisch gesammelte Video-Kandidaten: '+summary.archivedCandidateEntries,
    '- Historisch unterschiedliche Video-IDs: '+summary.archivedDistinctIds,
    '- Tatsächlich für aktuelle DE-TMDB-YouTube-Angebote erneut angefragte eindeutige IDs: '+summary.uniqueKnownIdsRequested,
    '- Aktuelle Videos-Metadaten gefunden: '+summary.videoIdsResolved,
    '- Nicht mehr auflösbare Videos: '+summary.unavailableOrDeletedVideoIds,
    '- Aktuelle DE-TMDB-YouTube-Angebotshypothesen: '+summary.currentTmdbDEYoutubeOffers,
    '- Veränderungen der Matcher-Reviewklassen: '+summary.statusChangesFromArchived,
    '- Aktuelle Review-Klassen: '+JSON.stringify(summary.currentStatuses),
    '- 0 unabhängig bestätigte deutsche Angebote, 0 neue produktive Direktlinks.',
    '- Vollfilm, korrektes Werk, Tarif und echte DE-Wiedergabe bleiben unabhängig zu prüfen.',
    '',
    '| TMDB-Film | Bisherige Klasse | Neue Klasse | Historische Videos | Jetzt per API aufgelöst |',
    '| --- | --- | --- | ---: | ---: |',
    ...rows.map(x=>'| movie:'+x.tmdbId+' | '+x.archivedStatus
      +' | '+x.status+' | '+x.archivedVideoCandidateCount
      +' | '+x.currentMetadataResolvedForArchivedCandidates+' |'),
    '',
  ].join('\n')
}
async function tmdbLive(path,params={},token){
  const u=new URL('https://api.themoviedb.org/3'+path)
  for(const [key,value] of Object.entries(params))u.searchParams.set(key,String(value))
  const r=await fetch(u,{
    headers:{accept:'application/json',authorization:'Bearer '+token},
    signal:AbortSignal.timeout(20000),
  })
  if(!r.ok)throw Error('TMDB_READ_HTTP_'+r.status)
  return r.json()
}
export async function writeCurrentKnownReview({
  archivePath=ARCHIVE_PATH,output=OUTPUT,now=new Date().toISOString(),
  tmdbToken=process.env.TMDB_API_READ_TOKEN,
  youtubeKey=getSecret(),
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('CURRENT_KNOWN_VIDEO_REVIEW_NO_WRITES')
  if(typeof tmdbToken!=='string'||tmdbToken.length<15)
    throw Error('TMDB_READER_TOKEN_MISSING')
  const archive=JSON.parse(await readFile(archivePath,'utf8'))
  const index=await loadPublicMovieHubIndex()
  const result=await refreshKnownTmdbFirstVideoCandidates({
    archive,publicIndex:index,now,
    tmdbGet:(path,params)=>tmdbLive(path,params,tmdbToken),
    youtubeApi:(path,params)=>youtubeGet(path,params,youtubeKey),
  })
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/qa.json',JSON.stringify(result,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',renderCurrentKnownReview(result)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify(result.summary))
  return result.summary
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  writeCurrentKnownReview().catch(e=>{
    console.error('KNOWN-VIDEO RECHECK FAILED CLOSED: '+e.message)
    process.exitCode=1
  })
}
