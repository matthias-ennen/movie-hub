/**
 * Public-only MovieHub search-index membership for G2 YouTube hypotheses.
 * This is not the complete account/personal catalog and authorizes NO imports.
 * Official publicly served search index; no YouTube/TMDB API calls.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const PUBLIC_SEARCH_INDEX_URL = 'https://movie-hub-62459.web.app/search-index.json'
export const OUTPUT_DIR = 'artifacts/youtube-g2/public-membership-125'
const MAX_INDEX_BYTES = 30 * 1024 * 1024
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/
const isPositiveInteger = value => Number.isInteger(Number(value)) && Number(value) > 0
const movieKey = tmdbId => 'movie:' + Number(tmdbId)

export function compareYoutubeHypothesesToPublicIndex(audit, publicIndex, {
  now = Date.now(),
  maxAgeDays = 14,
  minimumPublicEntries = 100,
} = {}) {
  const cases = audit?.cases
  const s = audit?.summary
  if (!Array.isArray(cases) || cases.length !== 125
    || new Set(cases.map(c => c?.videoId)).size !== 125
    || cases.some(c => !VIDEO_ID.test(c?.videoId || ''))
    || s?.newEligibleUniqueVideos !== 125
    || s?.matcherVersion !== 'v1.1'
    || s?.replayMode !== true
    || s?.comparison?.sameVideoIds !== true
    || s?.publicationPermitted !== false
    || s?.catalogWrites !== 0 || s?.firestoreWrites !== 0) {
    throw new Error('INVALID_G2_READ_ONLY_V11_AUDIT')
  }
  if (publicIndex?.kind !== 'search-index' || publicIndex?.version !== 1
    || publicIndex?.country !== 'DE'
    || publicIndex?.source === 'fallback'
    || !Array.isArray(publicIndex?.entries)
    || publicIndex.entries.length < minimumPublicEntries
    || publicIndex.count !== publicIndex.entries.length) {
    throw new Error('INVALID_PUBLIC_SEARCH_INDEX')
  }
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now)
  const indexTime = Date.parse(publicIndex.generatedAt || '')
  if (!Number.isFinite(nowMs) || !Number.isFinite(indexTime)
    || nowMs - indexTime > maxAgeDays * 86400000
    || indexTime - nowMs > 86400000) {
    throw new Error('PUBLIC_SEARCH_INDEX_STALE_OR_FUTURE')
  }
  const publicIds = new Set()
  let invalidEntries = 0
  for (const entry of publicIndex.entries) {
    if (!isPositiveInteger(entry?.tmdbId)
      || !['movie', 'series'].includes(entry?.type)) {
      invalidEntries++
      continue
    }
    publicIds.add(entry.type + ':' + Number(entry.tmdbId))
  }
  // A broken/stub index must not be used as negative membership evidence.
  if (invalidEntries > 0 || publicIds.size < minimumPublicEntries) {
    throw new Error('PUBLIC_SEARCH_INDEX_INTEGRITY_FAILED')
  }
  const candidates = []
  for (const item of cases) {
    if (!String(item.status || '').startsWith('review-leading-')) continue
    const tmdbId = item.topCandidates?.[0]?.tmdbId
    if (!isPositiveInteger(tmdbId)) throw new Error('LEADING_HYPOTHESIS_WITHOUT_TMDB_ID')
    const key = movieKey(tmdbId)
    candidates.push({
      videoId: item.videoId,
      channelId: item.channelId,
      tmdbId: Number(tmdbId),
      matcherStatus: item.status,
      publicSearchMembership: publicIds.has(key) ? 'present' : 'not-present',
      personalCatalogMembership: 'unknown',
      workIdentityVerified: false,
      verifiedDEOffer: false,
      toImport: false,
    })
  }
  const present = candidates.filter(c => c.publicSearchMembership === 'present')
  const absent = candidates.filter(c => c.publicSearchMembership === 'not-present')
  return {
    scope: 'PUBLIC_SEARCH_INDEX_ONLY',
    generatedAt: new Date(nowMs).toISOString(),
    sourceIndexGeneratedAt: new Date(indexTime).toISOString(),
    sourceIndexCount: publicIndex.entries.length,
    sourceIndexUniqueTitleRefs: publicIds.size,
    comparedVideoIds: cases.length,
    leadingVideoHypotheses: candidates.length,
    leadingUniqueWorkHypotheses: new Set(candidates.map(c => movieKey(c.tmdbId))).size,
    presentInPublicSearchIndex: present.length,
    notPresentInPublicSearchIndex: absent.length,
    fullCatalogNewTitles: null,
    personalCatalogCoverage: 'not-loaded',
    verifiedFilms: 0,
    verifiedDEOffers: 0,
    publicationPermitted: false,
    catalogWrites: 0,
    firestoreWrites: 0,
    providerWrites: 0,
    badgeWrites: 0,
    nightlyWrites: 0,
    candidates,
  }
}

export async function readOfficialPublicSearchIndex(fetchFn = fetch) {
  const response = await fetchFn(PUBLIC_SEARCH_INDEX_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  })
  if (!response?.ok || response?.status !== 200
    || response?.url !== PUBLIC_SEARCH_INDEX_URL) {
    throw new Error('PUBLIC_SEARCH_INDEX_FETCH_FAILED')
  }
  const declaredSize = Number(response.headers?.get?.('content-length') || 0)
  if (declaredSize > MAX_INDEX_BYTES) throw new Error('PUBLIC_SEARCH_INDEX_TOO_LARGE')
  const body = await response.arrayBuffer()
  if (body.byteLength > MAX_INDEX_BYTES) throw new Error('PUBLIC_SEARCH_INDEX_TOO_LARGE')
  return JSON.parse(new TextDecoder().decode(body))
}

async function main() {
  if (process.env.YOUTUBE_G2_WRITE_MODE) throw new Error('No write mode permitted')
  const path = process.env.YOUTUBE_G2_AUDIT_QA_PATH || ''
  if (!path) throw new Error('Original GitHub QA artifact path required')
  const audit = JSON.parse(await readFile(path, 'utf8'))
  const index = await readOfficialPublicSearchIndex()
  const report = compareYoutubeHypothesesToPublicIndex(audit, index)
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(OUTPUT_DIR + '/public-membership.json',
    JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  const lines = [
    '# MovieHub G2 – Published PUBLIC Search-Index Membership (read-only)',
    '',
    '- Source: ' + PUBLIC_SEARCH_INDEX_URL,
    '- Published index generated at: ' + report.sourceIndexGeneratedAt,
    '- Published index entries: ' + report.sourceIndexCount,
    '- Exact G2 v1.1 videos: ' + report.comparedVideoIds,
    '- Leading **unverified** video hypotheses: ' + report.leadingVideoHypotheses,
    '- Present in PUBLIC search index: ' + report.presentInPublicSearchIndex,
    '- Not present in PUBLIC search index: ' + report.notPresentInPublicSearchIndex,
    '- Full/personal MovieHub catalog: UNKNOWN. **Not present does NOT mean new film.**',
    '- Film/cut/DE-offer checks: NONE. No accepted import candidates.',
    '- All production writes: ZERO. Publication permitted: FALSE.',
    '',
  ]
  await writeFile(OUTPUT_DIR + '/report.md', lines.join('\n'), { mode: 0o600 })
  process.stdout.write(JSON.stringify({
    publicPresent: report.presentInPublicSearchIndex,
    publicAbsent: report.notPresentInPublicSearchIndex,
    fullCatalogNewTitles: null,
    publicationPermitted: false,
    writes: 0,
  }) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write('G2 PUBLIC MEMBERSHIP FAILED CLOSED: ' + error.message + '\n')
    process.exitCode = 1
  })
}
