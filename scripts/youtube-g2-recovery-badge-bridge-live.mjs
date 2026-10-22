/** Fixed curated QA -> missing ID YouTube retry -> TMDB -> existing badge bridge.
 * One workflow, one research-only run; never deploy, import or mutate catalog.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getSecret, youtubeGet } from './youtube-api-smoke.mjs'
import { loadPublicMovieHubIndex } from './youtube-g2-tmdb-first-link-pilot.mjs'
import { runCuratedTmdbMembership } from './youtube-g2-curated-tmdb-membership.mjs'
import { runCuratedMissingVideoRecovery, buildExistingYoutubeBadgeLinkReview } from './youtube-g2-recovery-badge-bridge.mjs'

export const INPUT = 'artifacts/youtube-g2/curated-playlists/qa.json'
export const OUTPUT = 'artifacts/youtube-g2/recovery-badge-bridge'

async function tmdbRead(path, params, token) {
  if (!/^\/(?:search\/(?:movie|tv)|movie\/[1-9]\d*)$/.test(path)) {
    throw new Error('G2_TMBD_READ_ENDPOINT_NOT_ALLOWED')
  }
  const u = new URL('https://api.themoviedb.org/3' + path)
  for (const [key, value] of Object.entries(params || {})) u.searchParams.set(key, String(value))
  const response = await fetch(u, {
    headers: { accept: 'application/json', authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error('G2_TMDB_HTTP_' + response.status)
  return response.json()
}

async function main() {
  if (process.env.YOUTUBE_G2_WRITE_MODE) throw new Error('G2_REVIEW_ONLY_NO_WRITE')
  const token = process.env.TMDB_API_READ_TOKEN
  if (!token || token.length < 15) throw new Error('G2_TMDB_READ_TOKEN_REQUIRED')
  const audit = JSON.parse(await readFile(INPUT, 'utf8'))
  const index = await loadPublicMovieHubIndex()
  const key = getSecret()
  const recoveredAudit = await runCuratedMissingVideoRecovery({
    audit, youtubeApi: (endpoint, params) => youtubeGet(endpoint, params, key),
  })
  const tmdb = await runCuratedTmdbMembership({
    audit: recoveredAudit, publicIndex: index,
    tmdbGet: (path, params) => tmdbRead(path, params, token),
  })
  const bridge = buildExistingYoutubeBadgeLinkReview({
    audit: recoveredAudit, tmdbRows: tmdb.rows, publicIndex: index,
  })
  if (!bridge || bridge.sourceVideoIds !== audit.uniqueVideoIds
    || tmdb.summary.processedRows !== audit.uniqueVideoIds
    || bridge.publicationPermitted !== false || bridge.providerWrites !== 0
    || recoveredAudit.firestoreWrites !== 0 || tmdb.summary.catalogWrites !== 0) {
    throw new Error('G2_REPLAY_INTEGRITY_OR_PUBLICATION_GUARD_FAILED')
  }
  await mkdir(OUTPUT, { recursive: true })
  const result = {
    sourceVideoIds: audit.uniqueVideoIds,
    recovery: recoveredAudit.metadataRecovery,
    matcher: tmdb.summary,
    bridge,
  }
  await writeFile(OUTPUT + '/qa.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  const lines = [
    '# YouTube G2 – metadata recovery and existing-badge deep-link candidates (READ ONLY)',
    '',
    '- Original source inventory: ' + audit.uniqueVideoIds + ' videos / exactly two pinned playlists',
    '- Rechecked missing IDs: ' + result.recovery.attempted,
    '- Newly visible videos: ' + result.recovery.recovered,
    '- Still without video details: ' + result.recovery.stillMissing,
    '- Original source inventory unchanged: ' + !result.recovery.sourceInventoryChanged,
    '- Source→TMDB review status: ' + JSON.stringify(tmdb.summary.counts),
    '- Existing exact MovieHub YouTube badges: ' + bridge.knownPublicYoutubeBadges,
    '- Research-only deep-link candidates attached to existing badges: ' + bridge.candidateExistingBadgeRoutes,
    '- This does not cover personal/hidden titles or the wider TMDB-first YouTube badge inventory.',
    '- **0 verified offers, 0 accepted film identities, 0 new movies, 0 production writes.**',
    '',
    '| Video ID | Source metadata | TMDB proposal | Existing exact YouTube badge | Route candidate for REVIEW |',
    '| --- | --- | --- | --- | --- |',
    ...bridge.records.map(r => '| ' + r.videoId
      + ' | ' + r.reviewStatus
      + ' | ' + (r.proposedTitleRef?.tmdbId || '—')
      + ' | ' + r.existingExactYoutubeBadge
      + ' | ' + (r.reviewCandidateWatchUrl ? 'YES - not yet verified' : 'NO') + ' |'),
    '',
  ]
  await writeFile(OUTPUT + '/report.md', lines.join('\n'), { mode: 0o600 })
  process.stdout.write(JSON.stringify({
    sourceVideoIds: result.sourceVideoIds, recovery: result.recovery,
    tmdbCalls: result.matcher.tmdbCalls,
    candidateExistingBadgeRoutes: result.bridge.candidateExistingBadgeRoutes,
    verifiedOffers: 0, acceptedFilms: 0, productionWrites: 0,
  }) + '\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('YouTube G2 recovery+badge bridge FAILED CLOSED: ' + error.message)
    process.exitCode = 1
  })
}
