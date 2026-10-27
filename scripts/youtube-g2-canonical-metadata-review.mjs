import { hasDominantFilmHypothesis } from '../src/providers/youtubeCuratedEditorialIndex.js'
import { hasExclusiveActorCanonicalFilmEvidence } from './youtube-g2-exclusive-actor-canonical-film.mjs'
import {hasExclusiveBilledPairFilmHypothesis} from './youtube-g2-exclusive-pair-evidence.mjs'
import {hasExclusiveReportedYearFilmHypothesis} from './youtube-g2-exclusive-source-year-film.mjs'
import {hasDistantTvNamesakeFeatureFilmEvidence} from './youtube-g2-distant-tv-feature-evidence.mjs'
import {hasExclusiveDirectorFeatureFilmEvidence} from './youtube-g2-exclusive-director-evidence.mjs'
/**
 * A bounded stage after the full account-wide intake: fetch canonical TMDB
 * metadata for strong NEW film hypotheses. Film identity is NOT approved by a
 * successful TMDB lookup; source playback rights are never inferred.
 */
export const YOUTUBE_METADATA_REVIEW_KIND = 'moviehub-youtube-canonical-new-film-metadata-review'
export const YOUTUBE_METADATA_REVIEW_LIMIT = 40
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const zeroFields = ['catalogWrites','firestoreWrites','badgeWrites','providerWrites','nightlyWrites']
const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v))
const counts = (values,by) => Object.fromEntries(
  [...new Set(values.map(by))].sort().map(k => [k,values.filter(v => by(v)===k).length]))

export function planYoutubeNewFilmMetadataReview(full,intake,research,{
  now = new Date().toISOString(),
}={}){
  const age=Date.parse(now)-Date.parse(full?.generatedAt)
  if(full?.kind!=='moviehub-youtube-full-catalog-reconciliation'
    ||full.schemaVersion!==1||full.privateArtifact!==true
    ||full.publicationPermitted!==false
    ||!validDate(full.generatedAt)||!validDate(now)
    ||!Number.isFinite(age)||age < -60000||age > 12*3600000
    ||!Array.isArray(full.entries)
    ||full.totalVideoIds!==full.entries.length
    ||full.processedVideoIds!==full.totalVideoIds
    ||full.unaccountedForVideoIds!==0
    ||full.newMoviesImported!==0||full.verifiedDEOffers!==0
    ||zeroFields.some(k=>full[k]!==0)
    ||intake?.mode!=='YOUTUBE_G2_COMPLETE_PLAYLIST_INTAKE_STAGING_ONLY'
    ||!Array.isArray(intake.items)||intake.items.length!==full.totalVideoIds
    ||intake.uniqueVideoIds!==full.totalVideoIds
    ||research?.summary?.mode!=='CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY'
    ||research.summary.sourceVideoIds!==full.totalVideoIds
    ||research.summary.processedRows!==full.totalVideoIds
    ||research.summary.sourceQAObservedAt!==full.sourceObservedAt
    ||!Array.isArray(research.rows)||research.rows.length!==full.totalVideoIds
    ||new Set(research.rows.map(r=>r.videoId)).size!==full.totalVideoIds
    ||new Set(intake.items.map(r=>r.videoId)).size!==full.totalVideoIds) {
    throw Error('YOUTUBE_METADATA_REVIEW_PROVENANCE_INVALID')
  }
  const sources=new Map(intake.items.map(item=>[item.videoId,item]))
  const researched=new Map(research.rows.map(item=>[item.videoId,item]))
  const tmdbKeys=new Set()
  const selected=[]
  for(const entry of full.entries){
    if(!VIDEO_ID.test(String(entry.videoId||''))
      ||!['FREE','R&B'].includes(entry.playlistClass)
      ||entry.filmIdentityApproved!==false||entry.newMovieImported!==false
      ||entry.verifiedOffer!==false){
      throw Error('YOUTUBE_METADATA_REVIEW_UNSAFE_STATUS')
    }
    const source=sources.get(entry.videoId)
    const row=researched.get(entry.videoId)
    if(!source||!row||source.playlistClass!==entry.playlistClass
      ||row.editorialOfferHint!==(entry.playlistClass==='FREE'?'free':'rent-buy')
      ||row.matchStatus!==source.identityResearchStatus){
      throw Error('YOUTUBE_METADATA_REVIEW_SOURCE_MISMATCH')
    }
    if(entry.decision!=='new-tmdb-metadata-review')continue
    const match=/^movie:([1-9]\d*)$/.exec(String(entry.suggestedFilmKey||''))
    const top=row.topCandidates?.[0]
    if(!match||entry.completeCatalogMembership!=='not-in-canonical-inventory'
      ||entry.strongMetadataCandidate!==true||source.sourceScreened!==true
      ||source.regionSignal==='excluded'
      ||row.identityRisk!==null||row.errors?.length!==0
      ||!((row.matchStatus==='review-leading-film-hypothesis'
        &&row.alternativeTvIds?.length===0
        &&(row.topCandidates?.length===1||hasDominantFilmHypothesis(row.topCandidates)))
        ||hasExclusiveActorCanonicalFilmEvidence(source,row)
        ||hasExclusiveBilledPairFilmHypothesis(source.sourceTitle,row)
        ||hasExclusiveReportedYearFilmHypothesis(source.sourceTitle,row)
        ||hasDistantTvNamesakeFeatureFilmEvidence(source.sourceTitle,row)
        ||hasExclusiveDirectorFeatureFilmEvidence(source.sourceTitle,row))
      ||Number(top?.tmdbId)!==Number(match[1])
      ||Number(top.score)<38||top.titleLevel!==4
      ||!Number.isFinite(top.runtimeDelta)||top.runtimeDelta<0||top.runtimeDelta>10
      ||top.yearMismatch===true||top.sequelConflict===true
      ||tmdbKeys.has(Number(match[1]))){
      throw Error('YOUTUBE_METADATA_REVIEW_CANDIDATE_NOT_UNIQUE')
    }
    tmdbKeys.add(Number(match[1]))
    selected.push({
      videoId:entry.videoId,tmdbId:Number(match[1]),
      playlistClass:entry.playlistClass,sourceTitle:source.sourceTitle,
      sourceMinutes:source.durationMinutes,
      researchRuntimeDelta:top.runtimeDelta,
      independentWorkIdentityApproved:false,
    })
  }
  if(selected.length!==full.metadataReviewCandidateCount
    ||selected.length > YOUTUBE_METADATA_REVIEW_LIMIT){
    throw Error('YOUTUBE_METADATA_REVIEW_BUDGET_OR_COUNT_MISMATCH')
  }
  return {generatedAt:now,totalVideoIds:full.totalVideoIds,
    candidateCount:selected.length,candidates:selected}
}

export async function inspectYoutubeNewFilmMetadata(plan,{
  loadTitle,now=plan?.generatedAt,
}={}){
  if(!Array.isArray(plan?.candidates)
    ||plan.candidateCount!==plan.candidates.length
    ||typeof loadTitle!=='function'
    ||!validDate(now))throw Error('YOUTUBE_METADATA_REVIEW_PLAN_INVALID')
  const inspected=[]
  for(const c of plan.candidates){
    let status='tmdb-metadata-review'
    let metadata=null
    let reason=null
    try{
      const title=await loadTitle({type:'movie',tmdbId:c.tmdbId},now)
      const titleMinutes=Number(title?.runtimeMinutes)
      if(title?.type!=='movie'||title?.source!=='tmdb'
        ||Number(title.tmdbId)!==c.tmdbId
        ||title.id!=='tmdb-movie-'+c.tmdbId
        ||typeof title.title!=='string'||!title.title.trim()
        ||!Number.isFinite(titleMinutes)||titleMinutes<=0
        ||!Number.isFinite(Number(c.sourceMinutes))
        ||Math.abs(titleMinutes-Number(c.sourceMinutes))>10){
        status='identity-or-duration-review'
        reason='TMDB_ID_TYPE_TITLE_OR_RUNTIME_DISAGREEMENT'
      } else {
        metadata={
          id:title.id,type:'movie',tmdbId:c.tmdbId,source:'tmdb',
          title:title.title,originalTitle:title.originalTitle||null,
          year:title.year??null,runtimeMinutes:titleMinutes,
          posterUrl:title.posterUrl||null,
          metadataVersion:title.metadataVersion,
          metadataChecks:title.metadataChecks||null,
        }
      }
    }catch(e){
      status='tmdb-request-review'
      reason=e?.code||'TMDB_LOOKUP_ERROR'
    }
    inspected.push({
      videoId:c.videoId,tmdbId:c.tmdbId,playlistClass:c.playlistClass,
      status,reason,tmdb:metadata,
      workIdentityApproved:false,newMovieImported:false,offerPublished:false,
    })
  }
  return {
    kind:YOUTUBE_METADATA_REVIEW_KIND,schemaVersion:1,
    generatedAt:now,totalVideoIds:plan.totalVideoIds,
    candidatesSelected:plan.candidateCount,
    metadataReviewed:inspected.length,
    metadataPreviewReady:inspected.filter(x=>x.tmdb).length,
    counts:counts(inspected,x=>x.status),
    approvedFilmIdentities:0,newMoviesImported:0,
    verifiedDEOffers:0,publicationPermitted:false,
    catalogWrites:0,firestoreWrites:0,providerWrites:0,badgeWrites:0,
    privateArtifact:true,items:inspected,
  }
}
export function youtubeMetadataReviewMarkdown(data){
  if(data?.kind!==YOUTUBE_METADATA_REVIEW_KIND
    ||data.metadataReviewed!==data.candidatesSelected
    ||!data.privateArtifact||data.newMoviesImported!==0){
    throw Error('YOUTUBE_METADATA_REVIEW_REPORT_INVALID')
  }
  return [
    '# YouTube G2 – canonical TMDB metadata review for potential NEW films',
    '',
    '- Source videos processed by parent pipeline: '+data.totalVideoIds,
    '- New-film hypotheses selected: '+data.candidatesSelected,
    '- Canonical TMDB metadata retrieved and runtime-checked: '+data.metadataPreviewReady,
    '- Outcome counts: '+JSON.stringify(data.counts),
    '- No imported films, offer approvals, provider writes or Firestore writes.',
    '- This PRIVATE review is a metadata step, not an independent film identity approval.',
    '',
    '| Video ID | Playlist | TMDB | TMDB title | Review result |',
    '| --- | --- | --- | --- | --- |',
    ...data.items.map(x=>'| '+x.videoId+' | '+x.playlistClass
      +' | '+x.tmdbId+' | '+String(x.tmdb?.title||'—').replace(/\|/g,' ')
      +' | '+x.status+' |'),
    '',
  ].join('\n')
}
