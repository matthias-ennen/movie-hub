/**
 * All current curated YouTube playlist IDs -> a complete, lossless staging
 * manifest for the existing MovieHub catalog reconciliation pipeline.
 * This is NOT a catalog import or proof of a playable/rights-cleared offer.
 */
import { buildCuratedEditorialTitleIndex } from '../src/providers/youtubeCuratedEditorialIndex.js'
const VID=/^[A-Za-z0-9_-]{11}$/
const HINTS=new Set(['free','rent-buy'])
const STATUSES=new Set([
  'linked-existing-editorial',
  'existing-film-match-review',
  'not-in-public-index-check-complete-catalog',
  'work-identity-unresolved',
  'video-details-or-screening-review',
])
const ZERO=['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
const safe=x=>String(x??'').replace(/[\n\r<>|]/g,' ').replace(/\s+/g,' ').trim().slice(0,200)
const countsBy=(arr,selector)=>Object.fromEntries([...new Set(arr.map(selector))].sort()
  .map(k=>[k,arr.filter(x=>selector(x)===k).length]))
const filmRef=row=>{
  const t=row?.topCandidates?.[0]?.tmdbId
  return Number.isInteger(Number(t))&&Number(t)>0
    ?{mediaType:'movie',tmdbId:Number(t)}:null
}

export function planCompleteYoutubePlaylistIntake(source,research,{
  now=new Date().toISOString(),
}={}){
  // Existing independently written G2 projection gate validates the precise
  // two user playlists, matching timestamps, matching video IDs and no-writes.
  const hints=buildCuratedEditorialTitleIndex(source,research,{now})
  const audit=source?.audit??source
  if(!Array.isArray(audit?.candidates)||!Array.isArray(research?.rows)
    ||!Array.isArray(hints.entries)
    ||hints.sourceVideoIds!==audit.candidates.length
    ||hints.sourceVideoIds!==research.rows.length
    ||ZERO.some(k=>audit[k]!==0||research.summary[k]!==0)
    ||new Set(audit.candidates.map(c=>c.videoId)).size!==audit.candidates.length
    ||new Set(research.rows.map(r=>r.videoId)).size!==research.rows.length
    ||audit.candidates.some(c=>!VID.test(String(c?.videoId||''))
      ||!HINTS.has(c.editorialOfferHint)
      ||c.accepted!==false||c.toImport!==false
      ||c.playbackRoute!==null||c.verifiedOfferType!==null)){
    throw Error('YOUTUBE_COMPLETE_INTAKE_SOURCE_INVALID')
  }
  const researched=new Map(research.rows.map(r=>[r.videoId,r]))
  const linked=new Map(hints.entries.map(e=>[e.videoId,e]))
  const items=audit.candidates.map(c=>{
    const r=researched.get(c.videoId)
    if(!r||r.editorialOfferHint!==c.editorialOfferHint
      ||r.sourceStatus!==c.status
      ||r.playlistModes.join(',')!==c.playlistModes.join(',')
      ||r.videoTitle!==safe(c.videoTitle)
      ||!Array.isArray(c.playlistIds)||c.playlistIds.length<1
      ||new Set(c.playlistIds).size!==c.playlistIds.length){
      throw Error('YOUTUBE_COMPLETE_INTAKE_VIDEO_PAIR_MISMATCH')
    }
    const ref=filmRef(r)
    const linkedHint=linked.get(c.videoId)
    const status=!c.screened||!c.videoTitle
      ?'video-details-or-screening-review'
      :linkedHint?'linked-existing-editorial'
      :r.publicIndexMembership==='public-present'&&ref?'existing-film-match-review'
      :r.publicIndexMembership==='public-not-present'&&ref
        ?'not-in-public-index-check-complete-catalog'
      :'work-identity-unresolved'
    if(!STATUSES.has(status))throw Error('YOUTUBE_COMPLETE_INTAKE_STATUS_INVALID')
    return {
      videoId:c.videoId,
      playlistClass:c.editorialOfferHint==='free'?'FREE':'R&B',
      playlistModes:[...c.playlistModes],playlistIds:[...c.playlistIds],
      sourceTitle:safe(c.videoTitle)||null,channelTitle:safe(c.channelTitle)||null,
      sourceScreened:c.screened===true,
      sourceStatus:c.status,regionSignal:c.deRegionSignal||'unknown',
      durationMinutes:Number.isFinite(Number(c.minutes))?Number(c.minutes):null,
      suggestedFilmRef:ref,identityResearchStatus:r.matchStatus,
      publicCatalogMembership:r.publicIndexMembership,
      matchConfidence:'hypothesis-not-verified',
      stage:status,
      // Only the previously proven safe editorial projection is ready for
      // display as a playlist DECLARATION; not a confirmed availability.
      existingEditorialLink:linkedHint?{
        tmdbId:linkedHint.tmdbId,videoId:c.videoId,
        target:linkedHint.watchUrl,
      }:null,
      approvedFilmIdentity:false,independentlyVerifiedDEOffer:false,
      newCatalogTitleCreated:false,productionAvailability:null,
      verifiedPlaybackRoute:null,automatedCatalogImport:false,
    }
  })
  const unique=new Set(items.map(i=>i.videoId))
  if(unique.size!==audit.candidates.length
    ||items.filter(i=>i.existingEditorialLink).length!==hints.count
    ||items.some(i=>!HINTS.has(i.playlistModes.includes('free')?'free':'rent-buy')
      ||i.playlistClass!==(i.playlistModes.includes('free')?'FREE':'R&B'))){
    throw Error('YOUTUBE_COMPLETE_INTAKE_COVERAGE_MISMATCH')
  }
  const stages=countsBy(items,i=>i.stage)
  const playlistClasses=countsBy(items,i=>i.playlistClass)
  const identityStatuses=countsBy(items,i=>i.identityResearchStatus)
  const membership=countsBy(items,i=>i.publicCatalogMembership)
  return {
    mode:'YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY',
    generatedAt:new Date(now).toISOString(),
    sourceQAObservedAt:audit.observedAt,
    researchObservedAt:research.summary.generatedAt,
    fullScan:true,twoUserDefinedPlaylists:true,
    uniqueVideoIds:audit.uniqueVideoIds,
    processedVideoIds:items.length,unaccountedForVideoIds:audit.uniqueVideoIds-items.length,
    playlistClasses,stages,identityStatuses,publicCatalogMembership:membership,
    existingMovieEditorialLinks:hints.count,
    newCatalogTitlesImported:0,
    productionAvailabilityRecords:0,
    independentlyVerifiedDEOffers:0,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,nightlyWrites:0,
    publicationPermitted:false,
    items,
  }
}

export function completeYoutubeIntakeReport(plan){
  if(plan?.mode!=='YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY'
    ||!plan.fullScan||plan.unaccountedForVideoIds!==0
    ||plan.processedVideoIds!==plan.uniqueVideoIds
    ||!Array.isArray(plan.items)||plan.items.length!==plan.uniqueVideoIds){
    throw Error('YOUTUBE_COMPLETE_INTAKE_REPORT_INVALID')
  }
  return [
    '# MovieHub YouTube G2 – COMPLETE two-playlist intake / pending catalog reconciliation',
    '',
    '- Source observed: '+plan.sourceQAObservedAt,
    '- TMDB research: '+plan.researchObservedAt,
    '- Two playlists fully scanned: YES',
    '- Unique source video IDs: '+plan.uniqueVideoIds,
    '- Reviewed/staged IDs: '+plan.processedVideoIds,
    '- Missing from full intake: '+plan.unaccountedForVideoIds,
    '- Playlist classes: '+JSON.stringify(plan.playlistClasses),
    '- Existing MovieHub movie editorial links: '+plan.existingMovieEditorialLinks,
    '- Staging lanes: '+JSON.stringify(plan.stages),
    '- TMDB matcher review statuses: '+JSON.stringify(plan.identityStatuses),
    '- Public-index membership only: '+JSON.stringify(plan.publicCatalogMembership),
    '- IMPORTANT: PUBLIC-not-present != absent from personal/private/complete MovieHub catalog.',
    '- 0 new catalog movies; 0 independently verified offers; 0 production catalog/Firestore writes.',
    '',
    '| Video ID | Playlist class | Source title | TMDB proposal (not verified) | Public membership | Intake status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...plan.items.map(item=>'| '+item.videoId+' | '+item.playlistClass
      +' | '+(item.sourceTitle||'—')+' | '+(item.suggestedFilmRef?.tmdbId??'—')
      +' | '+item.publicCatalogMembership+' | '+item.stage+' |'),
    '',
  ].join('\n')
}
