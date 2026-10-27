import { hasDominantFilmHypothesis } from '../src/providers/youtubeCuratedEditorialIndex.js'
import { hasExclusiveActorCanonicalFilmEvidence } from './youtube-g2-exclusive-actor-canonical-film.mjs'
import {hasExclusiveBilledPairFilmHypothesis} from './youtube-g2-exclusive-pair-evidence.mjs'
/**
 * Read-only, private reconciliation of ALL YouTube G2 playlist video IDs with
 * MovieHub's canonical complete title inventory (including personal titles).
 * A matcher hypothesis is never a film identity or a confirmed offer.
 */
export const RECONCILIATION_KIND='moviehub-youtube-full-catalog-reconciliation'
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/
const ZERO_FIELDS=['catalogWrites','firestoreWrites','badgeWrites','providerWrites','nightlyWrites']
const byCounts=(items,key)=>Object.fromEntries([...new Set(items.map(key))].sort()
  .map(k=>[k,items.filter(i=>key(i)===k).length]))
const refKey=ref=>ref?.mediaType==='movie'&&Number.isInteger(ref?.tmdbId)&&ref.tmdbId>0
  ?'movie:'+ref.tmdbId:null
const dateOk=t=>typeof t==='string'&&Number.isFinite(Date.parse(t))
function ensureInput(intake,inventory,research,now){
  const nowMs=Date.parse(now)
  if(intake?.mode!=='YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY'
    ||intake.fullScan!==true||intake.twoUserDefinedPlaylists!==true
    ||intake.publicationPermitted!==false
    ||!Array.isArray(intake.items)||!Number.isInteger(intake.uniqueVideoIds)
    ||intake.uniqueVideoIds<1||intake.processedVideoIds!==intake.uniqueVideoIds
    ||intake.unaccountedForVideoIds!==0||intake.items.length!==intake.uniqueVideoIds
    ||intake.newCatalogTitlesImported!==0||intake.independentlyVerifiedDEOffers!==0
    ||intake.productionAvailabilityRecords!==0
    ||ZERO_FIELDS.some(k=>intake[k]!==0)
    ||!dateOk(intake.generatedAt)||!dateOk(inventory?.generatedAt)
    ||nowMs-Date.parse(intake.generatedAt)>12*3600000
    ||nowMs-Date.parse(intake.generatedAt)< -60000
    ||nowMs-Date.parse(inventory.generatedAt)>24*3600000
    ||nowMs-Date.parse(inventory.generatedAt)< -60000
    ||inventory.kind!=='title-candidate-inventory'||inventory.schemaVersion!==2
    ||inventory.identity!=='media-type+tmdb-id'
    ||inventory.policy?.searchIndexRole!=='classification-only'
    ||!Array.isArray(inventory.candidates)||!Array.isArray(inventory.searchOnly?.keys)
    ||inventory.counts?.canonicalCandidates!==inventory.candidates.length
    ||inventory.searchOnly.count!==inventory.searchOnly.keys.length
    ||research?.summary?.mode!=='CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY'
    ||!Array.isArray(research.rows)
    ||research.summary.generatedAt!==intake.researchObservedAt
    ||research.summary.sourceQAObservedAt!==intake.sourceQAObservedAt
    ||research.summary.sourceVideoIds!==intake.uniqueVideoIds
    ||research.summary.processedRows!==intake.uniqueVideoIds
    ||research.summary.verifiedFilms!==0||research.summary.verifiedDEOffers!==0
    ||research.summary.publicationPermitted!==false
    ||ZERO_FIELDS.some(k=>research.summary[k]!==0)
    ||new Set(intake.items.map(x=>x.videoId)).size!==intake.uniqueVideoIds
    ||new Set(research.rows.map(x=>x.videoId)).size!==intake.uniqueVideoIds
    ||intake.items.some(x=>!VIDEO_ID.test(String(x?.videoId||''))
      ||!['FREE','R&B'].includes(x.playlistClass)
      ||x.matchConfidence!=='hypothesis-not-verified'
      ||x.approvedFilmIdentity!==false||x.automatedCatalogImport!==false
      ||x.newCatalogTitleCreated!==false
      ||x.independentlyVerifiedDEOffer!==false
      ||x.productionAvailability!==null||x.verifiedPlaybackRoute!==null)){
    throw Error('YOUTUBE_FULL_CATALOG_RECONCILIATION_INPUT_INVALID')
  }
}
function strongCandidate(item,row){
  const top=row?.topCandidates?.[0]
  return item.sourceScreened===true&&item.regionSignal!=='excluded'
    &&row.identityRisk===null
    &&Array.isArray(row.errors)&&row.errors.length===0
    &&((row.matchStatus==='review-leading-film-hypothesis'
      &&Array.isArray(row.alternativeTvIds)&&row.alternativeTvIds.length===0
      &&Array.isArray(row.topCandidates)
      &&(row.topCandidates.length===1||hasDominantFilmHypothesis(row.topCandidates)))
      ||hasExclusiveActorCanonicalFilmEvidence(item,row)
      ||hasExclusiveBilledPairFilmHypothesis(item.sourceTitle,row))
    &&top?.tmdbId===item.suggestedFilmRef?.tmdbId
    &&Number.isFinite(top.score)&&top.score>=38&&top.titleLevel===4
    &&Number.isFinite(top.runtimeDelta)&&top.runtimeDelta>=0&&top.runtimeDelta<=10
    &&top.yearMismatch!==true&&top.sequelConflict!==true
}
export function reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{
  now=new Date().toISOString(),
}={}){
  ensureInput(intake,inventory,research,now)
  const keys=new Map()
  for(const x of inventory.candidates){
    if(!/^(movie|series):[1-9]\d*$/.test(String(x?.key||''))
      ||!Array.isArray(x.sources)||keys.has(x.key)) {
      throw Error('YOUTUBE_FULL_CATALOG_INVENTORY_KEY_DUPLICATE_OR_INVALID')
    }
    keys.set(x.key,x)
  }
  const searchOnly=new Set(inventory.searchOnly.keys)
  if(searchOnly.size!==inventory.searchOnly.count
    ||[...searchOnly].some(k=>keys.has(k))){
    throw Error('YOUTUBE_FULL_CATALOG_SEARCH_ONLY_OVERLAP')
  }
  const researchById=new Map(research.rows.map(r=>[r.videoId,r]))
  const workOccurrences=byCounts(intake.items.filter(x=>refKey(x.suggestedFilmRef)),
    x=>refKey(x.suggestedFilmRef))
  const entries=intake.items.map(item=>{
    const row=researchById.get(item.videoId)
    if(!row||row.editorialOfferHint!==(item.playlistClass==='FREE'?'free':'rent-buy')
      ||row.matchStatus!==item.identityResearchStatus
      ||row.publicIndexMembership!==item.publicCatalogMembership){
      throw Error('YOUTUBE_FULL_CATALOG_RESEARCH_VIDEO_MISMATCH')
    }
    const key=refKey(item.suggestedFilmRef)
    const existing=key?keys.get(key):null
    const searched=key?searchOnly.has(key):false
    const strong=strongCandidate(item,row)
    const unique=key&&workOccurrences[key]===1
    const decision=item.stage==='linked-existing-editorial'
      ?'already-linked-editorial'
      :!key?'work-identity-unresolved'
      :existing?'exists-in-complete-catalog-review'
      :searched?'search-index-only-review'
      :!unique?'multi-video-one-film-review'
      :strong?'new-tmdb-metadata-review'
      :'work-identity-review'
    return {
      videoId:item.videoId,playlistClass:item.playlistClass,
      suggestedFilmKey:key,publicCatalogMembership:item.publicCatalogMembership,
      completeCatalogMembership:existing?'canonical-existing'
        :searched?'search-index-only':'not-in-canonical-inventory',
      canonicalSources:existing?[...existing.sources]:[],
      originalStage:item.stage,decision,
      strongMetadataCandidate:strong&&Boolean(unique),
      // Preview, not automatic film approval, import or published provider offer.
      filmIdentityApproved:false,newMovieImported:false,verifiedOffer:false,
    }
  })
  return {
    kind:RECONCILIATION_KIND,schemaVersion:1,generatedAt:now,
    sourceObservedAt:intake.sourceQAObservedAt,
    inventoryGeneratedAt:inventory.generatedAt,
    totalVideoIds:intake.uniqueVideoIds,processedVideoIds:entries.length,
    unaccountedForVideoIds:intake.uniqueVideoIds-entries.length,
    catalogCandidateCount:inventory.candidates.length,
    searchOnlyCandidateCount:inventory.searchOnly.count,
    playlistClasses:byCounts(entries,x=>x.playlistClass),
    fullCatalogMembership:byCounts(entries,x=>x.completeCatalogMembership),
    decisionsSummary:byCounts(entries,x=>x.decision),
    metadataReviewCandidateCount:entries.filter(x=>x.decision==='new-tmdb-metadata-review').length,
    verifiedDEOffers:0,newMoviesImported:0,publicationPermitted:false,
    catalogWrites:0,firestoreWrites:0,badgeWrites:0,providerWrites:0,nightlyWrites:0,
    privateArtifact:true,entries,
  }
}
export function completeCatalogReport(data){
  if(data?.kind!==RECONCILIATION_KIND||data.unaccountedForVideoIds!==0
    ||data.privateArtifact!==true)throw Error('YOUTUBE_FULL_CATALOG_REPORT_INVALID')
  return [
    '# YouTube G2 – complete-account catalog reconciliation (private, READ ONLY)',
    '',
    '- Reconciled video IDs: '+data.processedVideoIds+'/'+data.totalVideoIds,
    '- Canonical account catalog candidates: '+data.catalogCandidateCount,
    '- Separate search-only keys: '+data.searchOnlyCandidateCount,
    '- Full catalogue membership: '+JSON.stringify(data.fullCatalogMembership),
    '- Reconciliation: '+JSON.stringify(data.decisionsSummary),
    '- TMDB metadata review candidates (not imported): '+data.metadataReviewCandidateCount,
    '- No films or verified offers written. Full account references are private.',
    '',
    '| Video ID | Playlist | TMDB hypothesis | Full catalog | Action |',
    '| --- | --- | --- | --- | --- |',
    ...data.entries.map(e=>'| '+e.videoId+' | '+e.playlistClass
      +' | '+(e.suggestedFilmKey||'—')+' | '+e.completeCatalogMembership
      +' | '+e.decision+' |'),
    '',
  ].join('\n')
}
