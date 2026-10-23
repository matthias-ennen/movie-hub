/**
 * YouTube G2: use the EXISTING TMDB canonical metadata client to inspect
 * previously absent, strong one-to-one movie candidates.
 * These are NOT approved YouTube film identities or verified DE offers.
 * Only private QA artifacts are generated. No public or Firestore writes.
 */
export const NEW_FILM_PREFLIGHT_KIND='youtube-g2-tmdb-new-film-metadata-preflight'
export const NEW_FILM_PREFLIGHT_MAX_CANDIDATES=50
const ZERO_FIELDS=['catalogWrites','firestoreWrites','badgeWrites','providerWrites','nightlyWrites']
const goodTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const digits=s=>/^movie:[1-9]\d*$/.test(String(s))
const summ=(arr,key)=>Object.fromEntries([...new Set(arr.map(key))].sort().map(x=>[
  x,arr.filter(item=>key(item)===x).length]))
function assertPipeline(reconciliation,intake,now){
  if(reconciliation?.kind!=='moviehub-youtube-full-catalog-reconciliation'
    ||reconciliation.schemaVersion!==1
    ||reconciliation.privateArtifact!==true
    ||reconciliation.publicationPermitted!==false
    ||intake?.mode!=='YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY'
    ||!Array.isArray(reconciliation.entries)||!Array.isArray(intake.items)
    ||!Number.isInteger(reconciliation.totalVideoIds)
    ||reconciliation.totalVideoIds!==intake.uniqueVideoIds
    ||reconciliation.processedVideoIds!==reconciliation.totalVideoIds
    ||reconciliation.unaccountedForVideoIds!==0
    ||reconciliation.entries.length!==reconciliation.totalVideoIds
    ||new Set(reconciliation.entries.map(x=>x.videoId)).size!==reconciliation.totalVideoIds
    ||reconciliation.newMoviesImported!==0||reconciliation.verifiedDEOffers!==0
    ||ZERO_FIELDS.some(k=>reconciliation[k]!==0)
    ||!goodTime(reconciliation.generatedAt)||!goodTime(intake.generatedAt)
    ||Date.parse(now)-Date.parse(reconciliation.generatedAt)>12*3600000
    ||Date.parse(now)<Date.parse(reconciliation.generatedAt)-60000) {
    throw Error('YOUTUBE_NEW_FILM_PREFLIGHT_INVALID_SOURCE')
  }
}
export function selectYoutubeNewFilmMetadataCandidates(reconciliation,intake,{
  now=new Date().toISOString(),
}={}){
  assertPipeline(reconciliation,intake,now)
  const intakeByVideo=new Map(intake.items.map(x=>[x.videoId,x]))
  const candidates=reconciliation.entries
    .filter(e=>e.decision==='new-tmdb-metadata-review')
    .map(e=>{
      const src=intakeByVideo.get(e.videoId)
      if(!src||e.suggestedFilmKey!=='movie:'+src.suggestedFilmRef?.tmdbId
        ||e.strongMetadataCandidate!==true
        ||!digits(e.suggestedFilmKey)||!Number.isFinite(src.durationMinutes)
        ||src.durationMinutes<35||src.regionSignal==='excluded'
        ||e.completeCatalogMembership!=='not-in-canonical-inventory'
        ||e.filmIdentityApproved!==false||e.newMovieImported!==false
        ||e.verifiedOffer!==false||!['FREE','R&B'].includes(e.playlistClass)){
        throw Error('YOUTUBE_NEW_FILM_PREFLIGHT_CANDIDATE_UNTRUSTED')
      }
      return {
        videoId:e.videoId,tmdbId:Number(src.suggestedFilmRef.tmdbId),
        key:e.suggestedFilmKey,sourceRuntimeMinutes:src.durationMinutes,
        sourceTitle:src.sourceTitle,playlistClass:e.playlistClass,
        sourceStage:e.originalStage,
      }
    })
    .sort((a,b)=>a.key.localeCompare(b.key))
  if(candidates.length>NEW_FILM_PREFLIGHT_MAX_CANDIDATES
    ||new Set(candidates.map(x=>x.key)).size!==candidates.length
    ||new Set(candidates.map(x=>x.videoId)).size!==candidates.length){
    throw Error('YOUTUBE_NEW_FILM_PREFLIGHT_BUDGET_OR_COLLISION')
  }
  return candidates
}
const isNonEmpty=x=>typeof x==='string'&&x.trim().length>=2
export function assessFetchedYoutubeFilmMetadata(candidate,tmdbTitle){
  if(!tmdbTitle||!isNonEmpty(tmdbTitle.title)
    ||tmdbTitle.type!=='movie'||tmdbTitle.source!=='tmdb'
    ||Number(tmdbTitle.tmdbId)!==candidate.tmdbId
    ||tmdbTitle.id!=='tmdb-movie-'+candidate.tmdbId){
    return {outcome:'metadata-identity-mismatch',runtimeDelta:null,canonicalReady:false}
  }
  const tmdbRuntime=Number(tmdbTitle.runtimeMinutes)
  const delta=Math.abs(tmdbRuntime-candidate.sourceRuntimeMinutes)
  const goodRuntime=Number.isFinite(tmdbRuntime)&&tmdbRuntime>=35
    &&Number.isFinite(delta)&&delta<=10
  const metadataReady=tmdbTitle.metadataComplete===true
    &&isNonEmpty(tmdbTitle.description)
    &&(isNonEmpty(tmdbTitle.posterPath)||isNonEmpty(tmdbTitle.posterUrl)
      ||isNonEmpty(tmdbTitle.backdropPath)||isNonEmpty(tmdbTitle.backdropUrl))
  return {
    outcome:goodRuntime&&metadataReady
      ?'tmdb-metadata-ready-for-work-review'
      :!goodRuntime?'film-runtime-mismatch':'tmdb-metadata-incomplete',
    runtimeDelta:Number.isFinite(delta)?Number(delta.toFixed(2)):null,
    canonicalReady:goodRuntime&&metadataReady,
  }
}
export async function inspectYoutubeNewFilmMetadata(reconciliation,intake,{
  loadTitle,now=new Date().toISOString(),
}={}){
  if(typeof loadTitle!=='function')throw Error('YOUTUBE_TMDB_CANONICAL_LOADER_REQUIRED')
  const candidates=selectYoutubeNewFilmMetadataCandidates(reconciliation,intake,{now})
  const rows=[]
  for(const c of candidates){
    let assessment
    let tmdbTitle=null
    try{
      tmdbTitle=await loadTitle({type:'movie',tmdbId:c.tmdbId},now)
      assessment=assessFetchedYoutubeFilmMetadata(c,tmdbTitle)
    }catch(e){
      assessment={outcome:'tmdb-metadata-fetch-error',
        errorCode:String(e?.code||'TMDB_FETCH_FAILED').slice(0,80),
        runtimeDelta:null,canonicalReady:false}
    }
    // Distinct metadata QA does not certify the film footage or DE offer.
    rows.push({
      ...c,...assessment,
      tmdbTitle:tmdbTitle?.title||null,
      metadataVersion:Number(tmdbTitle?.metadataVersion)||null,
      tmdbMetadataFetchSucceeded:tmdbTitle!==null,
      filmIdentityApproved:false,playlistPlaybackVerified:false,
      newMovieImported:false,independentlyVerifiedDEOffer:false,
    })
  }
  return {
    kind:NEW_FILM_PREFLIGHT_KIND,schemaVersion:1,
    generatedAt:now,
    sourceObservedAt:reconciliation.sourceObservedAt,
    fullCatalogObservedAt:reconciliation.inventoryGeneratedAt,
    accountedSourceVideoIds:reconciliation.totalVideoIds,
    tmdbCandidateCount:candidates.length,
    inspectedCandidates:rows.length,
    counts:summ(rows,r=>r.outcome),
    metadataReadyForWorkReview:rows.filter(x=>x.canonicalReady).length,
    approvedFilmIdentities:0,newMoviesImported:0,
    verifiedDEOffers:0,catalogWrites:0,firestoreWrites:0,
    badgeWrites:0,providerWrites:0,
    privateArtifact:true,publicationPermitted:false,rows,
  }
}
export function youtubeNewFilmMetadataReport(data){
  if(data?.kind!==NEW_FILM_PREFLIGHT_KIND||!data.privateArtifact
    ||data.inspectedCandidates!==data.tmdbCandidateCount){
    throw Error('YOUTUBE_NEW_FILM_PREFLIGHT_REPORT_INVALID')
  }
  return [
    '# YouTube G2 – TMDB canonical movie metadata preflight (read-only)',
    '',
    '- All upstream video IDs: '+data.accountedSourceVideoIds,
    '- Strict new-title metadata candidates: '+data.tmdbCandidateCount,
    '- TMDB metadata candidates actually inspected: '+data.inspectedCandidates,
    '- Metadata ready for separate work identity review: '+data.metadataReadyForWorkReview,
    '- Outcomes: '+JSON.stringify(data.counts),
    '- New catalog imports: 0; verified DE offers: 0; production writes: 0',
    '',
    '| Video ID | Playlist | TMDB ID | Title (TMDB) | Runtime delta | Review outcome |',
    '| --- | --- | --- | --- | --- | --- |',
    ...data.rows.map(x=>'| '+x.videoId+' | '+x.playlistClass+' | '+x.tmdbId
      +' | '+(x.tmdbTitle||'—').replace(/[|\r\n]/g,' ')+' | '
      +(x.runtimeDelta??'—')+' | '+x.outcome+' |'),
    '',
  ].join('\n')
}
