/**
 * Code-only Firebase deployments must retain ALL trusted public YouTube
 * projections from the already published generation. No playlist scans,
 * TMDB lookups or client-side matching are necessary on a code deploy.
 */
import { mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { restorePublishedYoutubeEpisodeSummary }
  from './restore-live-youtube-episode-summary.mjs'
import {
  YOUTUBE_SEARCH_PUBLIC_PATHS, verifyYoutubeSearchCompanionPublication,
} from './verify-youtube-search-companion-publication.mjs'

const ORIGIN = 'https://movie-hub-62459.web.app'
const jsonHeader = response => String(response?.headers?.get?.('content-type') || '').toLowerCase()
const cacheHeader = response => String(response?.headers?.get?.('cache-control') || '').toLowerCase()

export async function restorePublishedYoutubeSearchCompanion({
  publicDir = 'public',
  origin = process.env.MOVIE_HUB_LIVE_URL || ORIGIN,
  request = fetch,
  now = Date.now(),
} = {}) {
  const staging = await mkdtemp(join(tmpdir(), 'moviehub-youtube-search-restore-'))
  try {
    for (const path of YOUTUBE_SEARCH_PUBLIC_PATHS) {
      const url = new URL('/' + path, origin)
      url.searchParams.set('generation', String(now))
      const response = await request(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
      })
      if (!response?.ok || !jsonHeader(response).includes('application/json')
        || !/(?:^|[,\s])no-store(?:[,\s]|$)/.test(cacheHeader(response))) {
        throw Error('YOUTUBE_SEARCH_RESTORE_UNAVAILABLE_OR_CACHEABLE:' + path)
      }
      await writeFile(join(staging, path),
        JSON.stringify(await response.json()) + '\n', 'utf8')
    }
    // Reuse the SAME validated public contract as the prepared- and
    // hosted-publication checks. All three files must agree in generation,
    // canonical TMDB identities, playback provenance and count.
    const checked = await verifyYoutubeSearchCompanionPublication({
      directory: staging, prepared: true, now,
    })
    if (!checked.published) throw Error('YOUTUBE_SEARCH_RESTORE_MISSING_COMPANION')
    // Do not replace any public file until the COMPLETE triplet validates.
    for (const path of YOUTUBE_SEARCH_PUBLIC_PATHS) {
      const target = resolve(publicDir, path)
      const temporary = target + '.pending'
      await writeFile(temporary, await readFile(join(staging, path)))
      await rename(temporary, target)
    }
    console.log(JSON.stringify({
      reusedPublishedYoutubeSearchCompanion: true,
      searchablePlaylistFilms: checked.count,
    }))
    return checked
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function restorePublishedYoutubeCodeProjections(options = {}) {
  const episode = await restorePublishedYoutubeEpisodeSummary(options)
  const search = await restorePublishedYoutubeSearchCompanion(options)
  return { episode, search }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  restorePublishedYoutubeCodeProjections().catch(error => {
    console.error('YOUTUBE_CODE_DEPLOY_RESTORE_FAILED_CLOSED: ' + error.message)
    process.exitCode = 1
  })
}
