import { createHash } from 'node:crypto'
import {
  normalizeTmdbMatchCandidate,
  WaipuTmdbSearchClient,
} from './waipu-tmdb-matcher.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'

export const JOYN_MATCHER_VERSION = 1

function aliases(value) {
  return [...new Set([
    value?.title,
    value?.originalTitle,
    ...(Array.isArray(value?.aliases) ? value.aliases : []),
  ].map(normalizeWaipuText).filter(Boolean))]
}

function dice(left, right) {
  const a = new Set(String(left).split(/\s+/).filter(Boolean))
  const b = new Set(String(right).split(/\s+/).filter(Boolean))
  if (!a.size || !b.size) return 0
  let overlap = 0
  for (const token of a) if (b.has(token)) overlap += 1
  return (2 * overlap) / (a.size + b.size)
}

function score(inputTitle, candidate) {
  const input = normalizeWaipuText(inputTitle)
  const candidateAliases = aliases(candidate)
  if (!input || !candidateAliases.length) return 0
  if (candidateAliases.includes(input)) return 100
  return Math.max(...candidateAliases.map((alias) => Math.round(dice(input, alias) * 90)))
}

export function chooseJoynTmdbMatch(input, rawCandidates = []) {
  const byKey = new Map()
  for (const raw of rawCandidates) {
    const candidate = normalizeTmdbMatchCandidate(raw, raw?.source || 'local')
    if (candidate) byKey.set(`${candidate.type}:${candidate.tmdbId}`, candidate)
  }
  const ranked = [...byKey.values()]
    .map((candidate) => ({ candidate, score: score(input?.title, candidate) }))
    .filter((item) => item.score >= 70)
    .sort((a, b) => b.score - a.score || a.candidate.type.localeCompare(b.candidate.type) || a.candidate.tmdbId - b.candidate.tmdbId)

  const best = ranked[0] || null
  const runnerUp = ranked[1] || null
  if (!best) return { status: 'unmatched', reason: 'no_candidate', best: null, runnerUp: null, margin: 0 }

  const margin = best.score - (runnerUp?.score ?? 0)
  if (best.score === 100) {
    const exact = ranked.filter((item) => item.score === 100)
    if (exact.length !== 1) {
      return { status: 'unmatched', reason: 'ambiguous_exact_title', best, runnerUp, margin }
    }
    return { status: 'matched', reason: null, best, runnerUp, margin }
  }

  if (best.score < 86) {
    return { status: 'unmatched', reason: 'below_threshold', best, runnerUp, margin }
  }
  if (runnerUp && margin < 15) {
    return { status: 'unmatched', reason: 'ambiguous_margin', best, runnerUp, margin }
  }
  return { status: 'matched', reason: null, best, runnerUp, margin }
}

export function joynMatchCacheKey(input) {
  return createHash('sha256').update(JSON.stringify({
    version: JOYN_MATCHER_VERSION,
    title: normalizeWaipuText(input?.title),
  })).digest('hex')
}

export async function matchJoynProgram(input, {
  localCandidates = [],
  searchTmdb = null,
} = {}) {
  let result = chooseJoynTmdbMatch(input, localCandidates)
  let source = 'local'

  if (result.status !== 'matched' && typeof searchTmdb === 'function') {
    const remote = await searchTmdb(input)
    result = chooseJoynTmdbMatch(input, [...localCandidates, ...(Array.isArray(remote) ? remote : [])])
    source = 'local+tmdb-search'
  }

  return {
    matcherVersion: JOYN_MATCHER_VERSION,
    status: result.status,
    reason: result.reason,
    source,
    match: result.status === 'matched' ? {
      tmdbId: result.best.candidate.tmdbId,
      type: result.best.candidate.type,
      title: result.best.candidate.title,
      originalTitle: result.best.candidate.originalTitle,
      year: result.best.candidate.year,
      posterUrl: result.best.candidate.posterUrl,
      score: result.best.score,
      margin: result.margin,
    } : null,
  }
}

export class JoynTmdbSearchClient {
  constructor(options = {}) {
    this.client = new WaipuTmdbSearchClient({
      ...options,
      maxRequests: Math.max(2, Number(options.maxRequests || 100)),
    })
  }

  async search(input) {
    const title = String(input?.title || '').trim()
    if (!title) return []
    const movies = await this.client.search({ type: 'movie', title })
    const series = await this.client.search({ type: 'series', title })
    return [...movies, ...series]
  }

  get requestsStarted() {
    return this.client.requestsStarted
  }
}
