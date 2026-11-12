/**
 * #336 G1e: read-only TTL upper-bound audit of already restored PRIVATE Joyn
 * matcher and TMDB response caches. Never calls a source or TMDB endpoint.
 * A TTL-eligible historical decision is NOT an approved original receipt,
 * nor proof of a hit for a current Joyn programme and candidate context.
 */
import { lstat, readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JOYN_MATCHER_VERSION } from './joyn-tmdb-matcher.mjs'

const DAY = 86_400_000
const MAX_FILE_BYTES = 600 * 1024 * 1024
const MAX_ENTRIES = 250_000

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const safeCount = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_ENTRIES

function cacheEntries(value, kind) {
  if (!record(value) || value.kind !== kind || value.schemaVersion !== 1 ||
      !record(value.entries)) throw new TypeError('Invalid private cache schema')
  const count = Object.keys(value.entries).length
  if (!safeCount(count)) throw new RangeError('Private cache count exceeds bounded audit limit')
  return { values: value.entries, count }
}

function inTtl(entry, now, days) {
  const stamp = entry?.checkedAt
  if (typeof stamp !== 'string') return false
  const checked = Date.parse(stamp)
  const age = now - checked
  return Number.isFinite(checked) && age >= 0 && age < days * DAY
}

/** Only known counters, fixed enums and booleans leave the process. */
export function summarizePrivateJoynCacheTtl({ matchCache, lookupCache, now = Date.now() } = {}) {
  if (!Number.isFinite(now)) throw new TypeError('Invalid audit clock')
  const match = cacheEntries(matchCache, 'joyn-match-cache')
  const lookup = cacheEntries(lookupCache, 'joyn-lookup-cache')
  const compatibleMatcherVersion = matchCache.matcherVersion === JOYN_MATCHER_VERSION
  const matched = { ttlEligible: 0, expiredOrInvalidTime: 0 }
  const unmatched = { ttlEligible: 0, expiredOrInvalidTime: 0 }
  let unclassifiedDecisions = 0
  for (const entry of Object.values(match.values)) {
    const status = entry?.diagnostic?.decision?.status
    if (status === 'matched' || status === 'unmatched') {
      const bucket = status === 'matched' ? matched : unmatched
      if (inTtl(entry, now, status === 'matched' ? 30 : 7)) bucket.ttlEligible++
      else bucket.expiredOrInvalidTime++
    } else {
      unclassifiedDecisions++
    }
  }
  let lookupWithinTtl = 0
  let lookupExpiredOrInvalidTime = 0
  for (const entry of Object.values(lookup.values)) {
    if (inTtl(entry, now, 7)) lookupWithinTtl++
    else lookupExpiredOrInvalidTime++
  }
  return {
    kind: 'g1e-private-joyn-cache-ttl-audit',
    schemaVersion: 1,
    mode: 'private-read-only',
    match: {
      entries: match.count,
      compatibleMatcherVersion,
      ttlEligibleMatchedUpperBound: compatibleMatcherVersion ? matched.ttlEligible : 0,
      ttlEligibleUnmatchedUpperBound: compatibleMatcherVersion ? unmatched.ttlEligible : 0,
      expiredOrInvalidTime: matched.expiredOrInvalidTime + unmatched.expiredOrInvalidTime,
      unclassifiedDecisions,
    },
    lookup: {
      entries: lookup.count,
      ttlEligibleResponseUpperBound: lookupWithinTtl,
      expiredOrInvalidTime: lookupExpiredOrInvalidTime,
    },
    gate: {
      currentProgrammeCacheHitsVerified: false,
      freshOriginalMatcherReceiptsApproved: false,
      measuredProductionSavings: null,
    },
    limitations: 'TTL-only upper bounds; no source programme-key comparisons, candidate-context validation or technical-failure inspection.',
  }
}

async function readPrivateCache(file) {
  const info = await lstat(file)
  if (!info.isFile() || info.size < 1 || info.size > MAX_FILE_BYTES) {
    throw new RangeError('Private cache file outside bounded regular-file limits')
  }
  return JSON.parse(await readFile(file, 'utf8'))
}

async function main(argv) {
  if (argv.length !== 4 || argv[0] !== '--root' || argv[2] !== '--output') {
    throw new TypeError('Private cache audit requires an explicit root and output')
  }
  const root = resolve(argv[1])
  const output = resolve(argv[3])
  const [matchCache, lookupCache] = await Promise.all([
    readPrivateCache(join(root, 'artifacts/joyn-live/match-cache.json')),
    readPrivateCache(join(root, 'artifacts/joyn-live/lookup-cache.json')),
  ])
  const result = summarizePrivateJoynCacheTtl({ matchCache, lookupCache })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    // Never display the original private JSON, filename error or programme ID.
    console.error('G1e private cache TTL audit failed closed; no private content disclosed.')
    process.exitCode = 1
  })
}
