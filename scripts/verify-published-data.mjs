import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { evaluatePublishedData, fetchPublishedData } from './validate-publication-health.mjs'

const YOUTUBE_PUBLIC_ORIGIN = 'https://movie-hub-62459.web.app'
const YOUTUBE_PUBLIC_REPORTS = [
  'youtube-verified-title-routes.json',
  'youtube-curated-source-status.json',
]
async function optionalPreparedJson(directory, path) {
  try { return JSON.parse(await readFile(resolve(directory, path), 'utf8')) }
  catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}
/**
 * Verify exact YouTube route publication, including a legitimate empty index.
 * Source status is optional only if the upstream API failed before producing it.
 * A failed YouTube sync must never invent available offers.
 */
export async function verifyYoutubePublishedReports({
  fetchImpl = fetch, directory = 'public', origin = YOUTUBE_PUBLIC_ORIGIN,
  prepared = false,
} = {}) {
  const [route, source] = await Promise.all(
    YOUTUBE_PUBLIC_REPORTS.map(p => optionalPreparedJson(directory, p)),
  )
  if (route?.kind !== 'moviehub-youtube-verified-title-routes'
    || route?.schemaVersion !== 1 || route.providerId !== 'youtube'
    || !Array.isArray(route.entries)
    || route.count !== route.entries.length) {
    throw new Error('YouTube-Routenmanifest im Build fehlt oder ist ungültig')
  }
  if (source && (source.kind !== 'moviehub-youtube-curated-source-status'
    || source.sourcePlaylistCount !== 2 || !source.fullyScanned
    || !Number.isInteger(source.approvedDEOfferRoutes))) {
    throw new Error('YouTube-Playlist-Quellenbericht im Build ungültig')
  }
  if (prepared) return { directRoutes: route.count, sourceReportAvailable: Boolean(source) }
  for (const [path, expected] of [
    [YOUTUBE_PUBLIC_REPORTS[0], route],
    ...(source ? [[YOUTUBE_PUBLIC_REPORTS[1], source]] : []),
  ]) {
    const url = new URL('/' + path, origin)
    url.searchParams.set('watchdog', String(Date.now()))
    const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!response?.ok) throw new Error('YouTube-Veröffentlichung nicht erreichbar: ' + path)
    const actual = await response.json()
    if (!isDeepStrictEqual(actual, expected)) {
      throw new Error('Published generation differs from build: ' + path)
    }
  }
  return { directRoutes: route.count, sourceReportAvailable: Boolean(source) }
}

export function validatePreparedGeneration(expected, { requireJoynHorizon = true, now = new Date() } = {}) {
  const scheduledAt = new Date(Math.min(Date.parse(expected[1]?.generatedAt), Date.parse(expected[2]?.generatedAt))).toISOString()
  const result = evaluatePublishedData(expected[0], expected[1], { scheduledAt, now,
    requireMultiSource: true, requireJoynHorizon, joynIndex: expected[2], availabilityIndex: expected[3], tvRuntimeIndex: expected[4] })
  if (result.status !== 'fresh') throw new Error(result.reasons.join('; '))
  return result
}

export async function verifyPublishedGeneration({ fetchImpl = fetch, directory = 'public', requireJoynHorizon = true } = {}) {
  const paths = ['data-status.json', 'waipu-live/index.json', 'joyn-live/index.json', 'live-availability-index.json', 'tv-runtime/index.json']
  const expected = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve(directory, path), 'utf8'))))
  const actual = await fetchPublishedData({ fetchImpl })
  for (let i = 0; i < paths.length; i += 1) {
    if (!isDeepStrictEqual(actual[i], expected[i])) throw new Error(`Published generation differs from build: ${paths[i]}`)
  }
  const result = validatePreparedGeneration(actual, { requireJoynHorizon })
  const youtube = await verifyYoutubePublishedReports({ fetchImpl, directory })
  console.log(`Published Waipu + Joyn generations and app indexes verified: ${result.activeTitles} active titles.`)
  console.log('YouTube published routes verified: ' + youtube.directRoutes + ' independent title links; source report present: ' + youtube.sourceReportAvailable + '.')
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let failure
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const requireJoynHorizon = process.env.REQUIRE_JOYN_14_DAYS === 'true'
      if (process.argv.includes('--prepared')) {
        const paths = ['data-status.json', 'waipu-live/index.json', 'joyn-live/index.json', 'live-availability-index.json', 'tv-runtime/index.json']
        const expected = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve('public', path), 'utf8'))))
        validatePreparedGeneration(expected, { requireJoynHorizon })
        await verifyYoutubePublishedReports({ prepared: true })
        console.log('Prepared source generations, YouTube routes and app data verified before deployment.')
      } else await verifyPublishedGeneration({ requireJoynHorizon })
      failure = null; break
    } catch (error) {
      failure = error
      if (attempt < 2) await new Promise((done) => setTimeout(done, 2000))
    }
  }
  if (failure) { console.error(failure.message); process.exitCode = 1 }
}
