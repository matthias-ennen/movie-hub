import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { evaluatePublishedData, fetchPublishedData } from './validate-publication-health.mjs'

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
  console.log(`Published Waipu + Joyn generations and app indexes verified: ${result.activeTitles} active titles.`)
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
        console.log('Prepared source generations and app data verified before deployment.')
      } else await verifyPublishedGeneration({ requireJoynHorizon })
      failure = null; break
    } catch (error) {
      failure = error
      if (attempt < 2) await new Promise((done) => setTimeout(done, 2000))
    }
  }
  if (failure) { console.error(failure.message); process.exitCode = 1 }
}
