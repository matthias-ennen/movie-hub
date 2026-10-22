/** Replay exactly the two-playlist QA artifact using TMDB (read-only). */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { runCuratedTmdbMembership } from './youtube-g2-curated-tmdb-membership.mjs'
export const INPUT = 'artifacts/youtube-g2/curated-playlists/qa.json'
export const OUTPUT = 'artifacts/youtube-g2/curated-tmdb-membership'
const INDEX = 'https://movie-hub-62459.web.app/search-index.json'
const MAX_INDEX_BYTES = 30 * 1024 * 1024

async function readPublicIndex(request = fetch) {
  const response = await request(INDEX, {
    redirect: 'error', headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  })
  if (response?.status !== 200 || response?.url !== INDEX) {
    throw new Error('MOVIEHUB_PUBLISHED_INDEX_UNAVAILABLE')
  }
  if (Number(response.headers.get('content-length') || 0) > MAX_INDEX_BYTES) {
    throw new Error('MOVIEHUB_PUBLISHED_INDEX_TOO_LARGE')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_INDEX_BYTES) throw new Error('MOVIEHUB_PUBLISHED_INDEX_TOO_LARGE')
  return JSON.parse(new TextDecoder().decode(bytes))
}
async function tmdbRead(path, params, token) {
  if (!/^\/(?:search\/(?:movie|tv)|movie\/[1-9]\d*)$/.test(path)) {
    throw new Error('UNAPPROVED_TMDB_PATH')
  }
  const url = new URL('https://api.themoviedb.org/3' + path)
  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, String(value))
  }
  const response = await fetch(url, {
    headers: { accept: 'application/json', authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error('TMDB_READ_HTTP_' + response.status)
  return response.json()
}
export function membershipReport({ summary, rows }) {
  const lines = [
    '# YouTube G2 – two user-curated playlists → TMDB v1.1 (READ ONLY)',
    '',
    '- Source QA at: ' + summary.sourceQAObservedAt,
    '- Published MovieHub search index at: ' + summary.publishedIndexGeneratedAt,
    '- Matched/reviewed exact video IDs: ' + summary.processedRows + '/' + summary.sourceVideoIds,
    '- Matcher: ' + summary.matcherVersion,
    '- Status: ' + JSON.stringify(summary.counts),
    '- Public membership (not full personal catalog): ' + JSON.stringify(summary.publicIndexMembership),
    '- TMDB requests: ' + summary.tmdbCalls,
    '- Verified works=0, verified DE offers=0, new imports=0; ALL production writes=0.',
    '- No public-index hit is a verified film identity; not-present is NOT new.',
    '',
    '| Video ID | Playlist hint | Video title | Matcher review status | Leading movie hypotheses | Public index membership |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(r => '| ' + r.videoId + ' | ' + r.editorialOfferHint
      + ' | ' + r.videoTitle.replace(/\|/g, ' ')
      + ' | ' + r.matchStatus
      + ' | ' + (r.topCandidates.map(c => String(c.tmdbId) + ' (title='
        + c.titleLevel + ', delta=' + (c.runtimeDelta ?? '?') + 'm)').join(', ') || '—')
      + ' | ' + r.publicIndexMembership + ' |'),
    '',
  ]
  return lines.join('\n')
}
async function main() {
  if (process.env.YOUTUBE_G2_WRITE_MODE) throw new Error('READ_ONLY_MODE_REQUIRED')
  const token = process.env.TMDB_API_READ_TOKEN
  if (!token || token.length < 15) throw new Error('TMDB_READ_TOKEN_MISSING')
  const audit = JSON.parse(await readFile(INPUT, 'utf8'))
  const index = await readPublicIndex()
  const data = await runCuratedTmdbMembership({
    audit, publicIndex: index,
    tmdbGet: (p, q) => tmdbRead(p, q, token),
  })
  await mkdir(OUTPUT, { recursive: true })
  await writeFile(OUTPUT + '/qa.json', JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  await writeFile(OUTPUT + '/report.md', membershipReport(data) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ ...data.summary, rows: undefined }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.error('CURATED TMDB READ-ONLY AUDIT FAILED CLOSED: ' + e.message)
    process.exitCode = 1
  })
}
