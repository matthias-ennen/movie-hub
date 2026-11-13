/**
 * MovieHub #336 G1i – TRUE original Joyn cache-reader feasibility check.
 *
 * Runs ONLY against already restored private files in an ephemeral QA runner.
 * No source calls, TMDB calls, matching, decision approvals, mutation, cache
 * publication, or unknown filenames. All outputs are aggregate-only.
 *
 * A previous read-only scan could count a >audit-limit Joyn cache without
 * proving that the ORIGINAL matcher reader can deserialize that same file.
 * This checks that precise gap, independently of source freshness.
 */
import { lstat, mkdir, open } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JoynLookupCache, JoynMatchCache } from './joyn-match-cache.mjs'

export const G1I_ORIGINAL_LOAD_MAX_BYTES = 600 * 1024 * 1024
export const G1I_ORIGINAL_LOAD_MAX_ROWS = 400_000
const RELATIVE_CACHE_FILES = Object.freeze({
  matcher: 'artifacts/joyn-live/match-cache.json',
  responses: 'artifacts/joyn-live/lookup-cache.json',
})

function safeCount(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const n = Object.keys(raw).length
  return Number.isSafeInteger(n) && n <= G1I_ORIGINAL_LOAD_MAX_ROWS ? n : null
}

async function originalRead(file, kind, now) {
  try {
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1) {
      return { status: 'unavailable', count: null, sizeMiB: null }
    }
    if (info.size > G1I_ORIGINAL_LOAD_MAX_BYTES) {
      return { status: 'too_large', count: null, sizeMiB: null }
    }
    // These are the original methods used by the LIVE Joyn matcher, not a
    // streaming approximation nor a reimplemented interpretation of entries.
    const cache = kind === 'matcher'
      ? await JoynMatchCache.load(file, now)
      : await JoynLookupCache.load(file, now)
    const entries = kind === 'matcher' ? cache.values : cache.entries
    const count = safeCount(entries)
    if (count === null) return { status: 'unavailable', count: null, sizeMiB: null }
    return {
      status: 'loaded',
      count,
      sizeMiB: Math.round(info.size / (1024 * 1024) * 10) / 10,
    }
  } catch {
    // Never print private cache syntax, title, filename content or OS error.
    return { status: 'unavailable', count: null, sizeMiB: null }
  }
}

/**
 * Read-only scoped feasibility result. Independent of title matching,
 * source completeness, cache HITs and future production approval.
 */
export async function inspectOriginalJoynCacheLoad({
  root, now = Date.now(),
} = {}) {
  if (typeof root !== 'string' || !root.trim() || !Number.isFinite(now)) {
    throw new TypeError('Invalid isolated private cache context')
  }
  const directory = resolve(root)
  const matcher = await originalRead(join(directory, RELATIVE_CACHE_FILES.matcher), 'matcher', now)
  const responses = await originalRead(join(directory, RELATIVE_CACHE_FILES.responses), 'responses', now)
  const bothLoadable = matcher.status === 'loaded' && responses.status === 'loaded'
  return {
    kind: 'g1i-private-joyn-original-cache-reader',
    schemaVersion: 1,
    mode: 'private-read-only',
    matcher, responses,
    gate: {
      bothOriginalReadersLoadable: bothLoadable,
      sourceFreshnessSeparatelyRequired: true,
      originalMatcherReceiptsApproved: false,
      liveSourceRequestApproved: false,
      sharedTmdbCacheReadsApproved: false,
      measuredProductionSavings: null,
    },
  }
}

/** Reject everything except fixed enums/numeric aggregates before upload. */
export function isSafeG1iOriginalReaderReport(value) {
  const keys = (value, wanted) => value && typeof value === 'object' &&
    !Array.isArray(value) && Object.keys(value).sort().join('|') === wanted.slice().sort().join('|')
  const row = value => keys(value, ['status', 'count', 'sizeMiB']) &&
    ['loaded', 'unavailable', 'too_large'].includes(value.status) &&
    (value.status === 'loaded'
      ? Number.isSafeInteger(value.count) && value.count >= 0 &&
        value.count <= G1I_ORIGINAL_LOAD_MAX_ROWS &&
        typeof value.sizeMiB === 'number' && Number.isFinite(value.sizeMiB) &&
        value.sizeMiB >= 0 && value.sizeMiB <= 600
      : value.count === null && value.sizeMiB === null)
  const g = value?.gate
  return keys(value, ['kind', 'schemaVersion', 'mode', 'matcher', 'responses', 'gate']) &&
    value.kind === 'g1i-private-joyn-original-cache-reader' &&
    value.schemaVersion === 1 && value.mode === 'private-read-only' &&
    row(value.matcher) && row(value.responses) &&
    keys(g, ['bothOriginalReadersLoadable', 'sourceFreshnessSeparatelyRequired',
      'originalMatcherReceiptsApproved', 'liveSourceRequestApproved',
      'sharedTmdbCacheReadsApproved', 'measuredProductionSavings']) &&
    g.bothOriginalReadersLoadable ===
      (value.matcher.status === 'loaded' && value.responses.status === 'loaded') &&
    g.sourceFreshnessSeparatelyRequired === true &&
    g.originalMatcherReceiptsApproved === false &&
    g.liveSourceRequestApproved === false &&
    g.sharedTmdbCacheReadsApproved === false &&
    g.measuredProductionSavings === null &&
    JSON.stringify(value).length < 1200
}

async function main(argv) {
  if (argv.length !== 4 || argv[0] !== '--root' || argv[2] !== '--output') {
    throw new TypeError('Expected explicit private root and aggregate output path')
  }
  const outputPath = resolve(argv[3])
  const result = await inspectOriginalJoynCacheLoad({ root: argv[1] })
  if (!isSafeG1iOriginalReaderReport(result)) throw new TypeError('Unsafe private aggregate')
  const file = await (async () => {
    await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 })
    return open(outputPath, 'wx', 0o600)
  })()
  try {
    await file.writeFile(JSON.stringify(result, null, 2) + '\n', 'utf8')
  } finally {
    await file.close()
  }
  // Only the fixed-schema numeric and status envelope may be emitted.
  process.stdout.write(JSON.stringify(result) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.error('Private original Joyn cache reader preflight unavailable.')
    process.exitCode = 1
  })
}
