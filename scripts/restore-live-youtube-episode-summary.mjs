/**
 * A code-only deployment must reuse the already hosted episode-link summary
 * together with the canonical series shards restored by series:details:restore.
 * A missing or mismatched published summary is a hard error, never a reason
 * to rebuild from absent private YouTube QA or silently revoke valid links.
 */
import { readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const NAME = 'youtube-episode-playlist-summary.json'
const LIVE_ORIGIN = 'https://movie-hub-62459.web.app'

export async function restorePublishedYoutubeEpisodeSummary({
  publicDir = 'public',
  origin = process.env.MOVIE_HUB_LIVE_URL || LIVE_ORIGIN,
  request = fetch,
} = {}) {
  const manifest = JSON.parse(await readFile(resolve(publicDir, 'series-details/manifest.json'), 'utf8'))
  const enrichment = manifest?.youtubeEpisodePlaylistEnrichment
  if (manifest?.kind !== 'series-season-manifest'
    || manifest.version !== 1 || manifest.bucketCount !== 256
    || !Array.isArray(manifest.shards) || manifest.shards.length !== 256
    || !enrichment?.generatedAt
    || !Number.isSafeInteger(enrichment.provisionalEpisodeLinks)
    || enrichment.verificationStatus !== 'not-independently-verified') {
    throw Error('YOUTUBE_EPISODE_RESTORE_INVALID_SERIES_MANIFEST')
  }

  const url = new URL('/' + NAME, origin)
  url.searchParams.set('generation', String(Date.now()))
  const response = await request(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
  })
  if (!response?.ok || !String(response.headers?.get('content-type') || '')
    .toLowerCase().includes('application/json')) {
    throw Error('YOUTUBE_EPISODE_RESTORE_UNAVAILABLE_OR_NON_JSON')
  }
  const summary = await response.json()
  if (summary?.kind !== 'moviehub-youtube-episode-playlist-source-summary'
    || summary.schemaVersion !== 1 || summary.editorialOnly !== true
    || summary.independentlyVerifiedDEOffers !== 0 || summary.verifiedPlaybackRoutes !== 0
    || !Number.isSafeInteger(summary.sourceVideoIds) || summary.sourceVideoIds < 1
    || !Number.isSafeInteger(summary.provisionalEpisodeLinks)
    || summary.provisionalEpisodeLinks < 0
    || !Number.isSafeInteger(summary.confirmedMetadataProposals)
    || summary.confirmedMetadataProposals < summary.provisionalEpisodeLinks
    || !Array.isArray(summary.affectedBuckets)
    || new Set(summary.affectedBuckets).size !== summary.affectedBuckets.length
    || summary.affectedBuckets.some(bucket => !/^[0-9a-f]{2}$/.test(bucket))
    || summary.generatedAt !== enrichment.generatedAt
    || summary.provisionalEpisodeLinks !== enrichment.provisionalEpisodeLinks) {
    throw Error('YOUTUBE_EPISODE_RESTORE_GENERATION_MISMATCH')
  }

  // Only commit a fully validated summary. The existing prepared-publication
  // verifier still checks every affected season shard before Firebase deploy.
  const target = resolve(publicDir, NAME)
  const temporary = target + '.pending'
  await writeFile(temporary, JSON.stringify(summary) + '\n', 'utf8')
  await rename(temporary, target)
  console.log(JSON.stringify({
    reusedPublishedEpisodeGeneration: summary.generatedAt,
    provisionalEpisodeLinks: summary.provisionalEpisodeLinks,
    verifiedDEEpisodeOffers: 0,
  }))
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  restorePublishedYoutubeEpisodeSummary().catch(error => {
    console.error('YOUTUBE_EPISODE_RESTORE_FAILED_CLOSED: ' + error.message)
    process.exitCode = 1
  })
}
