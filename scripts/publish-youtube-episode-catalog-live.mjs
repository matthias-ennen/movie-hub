/**
 * Precompute episode-scoped, PROVISIONAL YouTube playlist watch shortcuts
 * in the EXISTING canonical TMDB series-season shards.
 * No client-side title matching, video lookup, Firestore writes or verified
 * playback/rights claims. Every run removes stale shortcuts (revocation).
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

export const REVIEW_PATH='artifacts/youtube-g2/series-episode-review/qa.json'
export const SHARD_DIR='public/series-details'
export const SUMMARY_PATH='public/youtube-episode-playlist-summary.json'
export const PUBLIC_KIND='moviehub-youtube-episode-playlist-source-summary'
const VID=/^[A-Za-z0-9_-]{11}$/
const MODE=new Set(['free','ads','flatrate','rent','buy','rent-buy'])
const pos=n=>Number.isSafeInteger(n)&&n>0
const positiveDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))
const key=r=>[r.seriesTmdbId,r.seasonNumber,r.episodeNumber,r.episodeTmdbId].join(':')

export function projectYoutubeEpisodePlaylistHints(review,{now=new Date().toISOString()}={}){
  if(review?.kind!=='moviehub-youtube-episode-identity-review'
    ||review.schemaVersion!==1||review.privateArtifact!==true
    ||review.publicationPermitted!==false||review.verifiedDEEpisodeOffers!==0
    ||review.publishedEpisodeLinks!==0
    ||['firestoreWrites','catalogWrites','providerWrites'].some(x=>review[x]!==0)
    ||!Number.isSafeInteger(review.sourceVideoIds)||review.sourceVideoIds<1
    ||review.processedVideoIds!==review.sourceVideoIds
    ||!Array.isArray(review.cases)
    ||review.episodeIdentityReviewCases!==review.cases.length
    ||review.canonicalEpisodeProposals!==
      review.cases.filter(c=>c.canonicalEpisodeProposal).length
    ||!positiveDate(now)||!positiveDate(review.generatedAt)
    ||!positiveDate(review.sourceQAObservedAt)
    ||Date.parse(now)-Date.parse(review.generatedAt)>3*3600_000
    ||Date.parse(review.generatedAt)-Date.parse(now)>60_000
    ||new Set(review.cases.map(c=>c.videoId)).size!==review.cases.length
    ||review.cases.some(c=>!VID.test(String(c?.videoId||''))
      ||!MODE.has(c.playlistOfferHint)
      ||!['exact-unique-canonical-episode-title','explicit-season-episode-markers'].includes(c.identityEvidence)
      ||c.approved!==false||c.publishedPlaybackRoute!==null
      ||c.verifiedDEOffer!==false||c.independentlyVerifiedEpisode!==false)) {
    throw Error('YOUTUBE_EPISODE_CATALOG_UNTRUSTED_REVIEW')
  }
  const candidates=[]
  for(const c of review.cases){
    const ref=c.canonicalEpisodeProposal
    if(!ref)continue
    if(c.status!=='review-exact-episode-metadata-candidate'
      ||ref.mediaType!=='episode'
      ||!['seriesTmdbId','episodeTmdbId','seasonNumber','episodeNumber']
        .every(k=>pos(ref[k]))
      ||!Number.isFinite(c.durationMinutes)||c.durationMinutes<10
      ||c.durationMinutes>120)throw Error('YOUTUBE_EPISODE_CATALOG_INVALID_IDENTITY')
    candidates.push({key:key(ref),ref,
      hint:{
        kind:'moviehub-youtube-editorial-episode-hint',
        schemaVersion:1,
        providerId:'youtube',
        seriesTmdbId:ref.seriesTmdbId,
        episodeTmdbId:ref.episodeTmdbId,
        seasonNumber:ref.seasonNumber,
        episodeNumber:ref.episodeNumber,
        videoId:c.videoId,
        watchUrl:'https://www.youtube.com/watch?v='+c.videoId,
        playlistMode:c.playlistOfferHint,
        verificationStatus:'not-independently-verified',
        evidence:c.identityEvidence,
        generatedAt:now,
        expiresAt:new Date(Date.parse(now)+72*3600_000).toISOString(),
      },
    })
  }
  const byKey=new Map(),collisions=new Set()
  for(const c of candidates){
    if(byKey.has(c.key))collisions.add(c.key)
    else byKey.set(c.key,c)
  }
  for(const k of collisions)byKey.delete(k) // zero false winner for conflicting videos
  return {byKey,collisions:collisions.size,identified:candidates.length}
}
export async function publishYoutubeEpisodePlaylistHints({
  reviewPath=REVIEW_PATH,shardDirectory=SHARD_DIR,summaryPath=SUMMARY_PATH,
  now=new Date().toISOString(),
}={}){
  const review=JSON.parse(await readFile(reviewPath,'utf8'))
  const projected=projectYoutubeEpisodePlaylistHints(review,{now})
  const manifest=JSON.parse(await readFile(shardDirectory+'/manifest.json','utf8'))
  if(manifest?.kind!=='series-season-manifest'
    ||manifest.version!==1||manifest.bucketCount!==256
    ||!Array.isArray(manifest.shards)||manifest.shards.length!==256
    ||new Set(manifest.shards.map(x=>x.bucket)).size!==256) {
    throw Error('YOUTUBE_EPISODE_CATALOG_INVALID_SHARD_MANIFEST')
  }
  // Prepare every modified shard IN MEMORY; reject missing TMDB episode IDs
  // BEFORE writing any source file. No stale source can survive an empty scan.
  const files=[],mapped=new Set(),affected=[]
  for(const shard of manifest.shards){
    if(!/^[0-9a-f]{2}$/.test(String(shard.bucket||''))
      ||!Number.isSafeInteger(shard.count)||shard.count<0)
      throw Error('YOUTUBE_EPISODE_CATALOG_INVALID_BUCKET')
    if(shard.count===0)continue
    const path=shardDirectory+'/'+shard.bucket+'.json'
    const payload=JSON.parse(await readFile(path,'utf8'))
    if(payload?.kind!=='series-season-shard'||payload.version!==1
      ||payload.bucket!==shard.bucket||!Array.isArray(payload.entries)
      ||payload.entries.length!==shard.count)
      throw Error('YOUTUBE_EPISODE_CATALOG_SHARD_MISMATCH')
    let changed=false
    for(const season of payload.entries){
      if(!Array.isArray(season.episodes))continue
      for(const ep of season.episodes){
        const episodeKey=key({
          seriesTmdbId:season.seriesTmdbId,seasonNumber:season.seasonNumber,
          episodeNumber:ep.episodeNumber,episodeTmdbId:ep.tmdbId??ep.id,
        })
        if(Object.hasOwn(ep,'youtubePlaylistHint')){
          delete ep.youtubePlaylistHint
          changed=true
        }
        const x=projected.byKey.get(episodeKey)
        if(x){
          if(Number(season.seriesTmdbId)!==x.ref.seriesTmdbId
            ||Number(season.seasonNumber)!==x.ref.seasonNumber
            ||Number(ep.episodeNumber)!==x.ref.episodeNumber
            ||Number(ep.tmdbId??ep.id)!==x.ref.episodeTmdbId)
            throw Error('YOUTUBE_EPISODE_CATALOG_IDENTITY_MISMATCH')
          ep.youtubePlaylistHint=x.hint
          mapped.add(episodeKey)
          changed=true
        }
      }
    }
    if(changed){files.push({path,payload});affected.push(shard.bucket)}
  }
  if(mapped.size!==projected.byKey.size)
    throw Error('YOUTUBE_EPISODE_CATALOG_EPISODE_NOT_IN_CANONICAL_SHARDS')
  const summary={
    kind:PUBLIC_KIND,schemaVersion:1,generatedAt:now,
    sourceVideoIds:review.sourceVideoIds,
    episodeReviewCases:review.episodeIdentityReviewCases,
    confirmedMetadataProposals:review.canonicalEpisodeProposals,
    provisionalEpisodeLinks:mapped.size,
    ambiguousEpisodeLinksBlocked:projected.collisions,
    independentlyVerifiedDEOffers:0,verifiedPlaybackRoutes:0,
    editorialOnly:true,
    affectedBuckets:affected.sort(),
  }
  for(const {path,payload} of files){
    await writeFile(path,JSON.stringify(payload)+'\n','utf8')
  }
  // Manifest describes the source generation; keep the canonical TMDB
  // timestamps and bucket counts unchanged, only add enrichment metadata.
  manifest.youtubeEpisodePlaylistEnrichment={
    generatedAt:now,provisionalEpisodeLinks:summary.provisionalEpisodeLinks,
    verificationStatus:'not-independently-verified',
  }
  await writeFile(shardDirectory+'/manifest.json',JSON.stringify(manifest)+'\n','utf8')
  await mkdir(summaryPath.slice(0,summaryPath.lastIndexOf('/')),{recursive:true})
  await writeFile(summaryPath,JSON.stringify(summary)+'\n','utf8')
  console.log(JSON.stringify({
    sourceVideoIds:summary.sourceVideoIds,episodeReviewCases:summary.episodeReviewCases,
    provisionalEpisodeLinks:summary.provisionalEpisodeLinks,
    verifiedDEEpisodeOffers:0,affectedSeasonBuckets:affected.length,
  }))
  return summary
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  publishYoutubeEpisodePlaylistHints().catch(e=>{
    console.error('YOUTUBE_EPISODE_CATALOG_FAILED_CLOSED: '+e.message)
    process.exitCode=1
  })
}
