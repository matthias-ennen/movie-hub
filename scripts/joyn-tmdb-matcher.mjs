import { createHash } from 'node:crypto'
import {
  normalizeTmdbMatchCandidate,
  WaipuTmdbSearchClient,
} from './waipu-tmdb-matcher.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'

export const JOYN_MATCHER_VERSION = 2

const JOYN_MOVIE_RUNTIME_OVERRUN_TOLERANCE_MINUTES = 5

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
    if (!candidate) continue
    if (input?.type && candidate.type !== input.type) continue
    byKey.set(`${candidate.type}:${candidate.tmdbId}`, candidate)
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

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function exactTitleCandidates(input, rawCandidates = []) {
  const byKey = new Map()
  for (const raw of rawCandidates) {
    const candidate = normalizeTmdbMatchCandidate(raw, raw?.source || 'local')
    if (!candidate) continue
    if (input?.type && candidate.type !== input.type) continue
    if (score(input?.title, candidate) !== 100) continue
    byKey.set(`${candidate.type}:${candidate.tmdbId}`, candidate)
  }
  return [...byKey.values()]
}

async function disambiguateMovieByBroadcastDuration(input, candidates, loadTmdbDetails) {
  const slotMinutes = finiteNumber(input?.broadcastDurationMinutes)
  if (input?.type !== 'movie'
      || slotMinutes === null
      || slotMinutes <= 0
      || typeof loadTmdbDetails !== 'function') return null

  const exact = exactTitleCandidates(input, candidates)
  if (exact.length < 2) return null

  const detailed = await Promise.all(exact.map(async (candidate) => {
    try {
      const detail = await loadTmdbDetails(candidate)
      return {
        candidate,
        runtimeMinutes: finiteNumber(detail?.runtimeMinutes),
      }
    } catch {
      return { candidate, runtimeMinutes: null }
    }
  }))

  const maximumPossibleRuntime = slotMinutes + JOYN_MOVIE_RUNTIME_OVERRUN_TOLERANCE_MINUTES
  const plausible = detailed.filter(({ runtimeMinutes }) => (
    runtimeMinutes !== null && runtimeMinutes <= maximumPossibleRuntime
  ))
  const impossible = detailed.filter(({ runtimeMinutes }) => (
    runtimeMinutes !== null && runtimeMinutes > maximumPossibleRuntime
  ))
  const unknown = detailed.filter(({ runtimeMinutes }) => runtimeMinutes === null)

  if (plausible.length !== 1 || impossible.length !== exact.length - 1 || unknown.length > 0) return null

  return {
    candidate: plausible[0].candidate,
    runtimeMinutes: plausible[0].runtimeMinutes,
    slotMinutes,
    excluded: impossible.map(({ candidate, runtimeMinutes }) => ({
      tmdbId: candidate.tmdbId,
      runtimeMinutes,
    })),
  }
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
  loadTmdbDetails = null,
} = {}) {
  let result = chooseJoynTmdbMatch(input, localCandidates)
  let source = 'local'

  let combinedCandidates = [...localCandidates]
  if (result.status !== 'matched' && typeof searchTmdb === 'function') {
    const remote = await searchTmdb(input)
    combinedCandidates = [...localCandidates, ...(Array.isArray(remote) ? remote : [])]
    result = chooseJoynTmdbMatch(input, combinedCandidates)
    source = 'local+tmdb-search'
  }

  let durationResolution = null
  if (result.status !== 'matched' && result.reason === 'ambiguous_exact_title') {
    durationResolution = await disambiguateMovieByBroadcastDuration(input, combinedCandidates, loadTmdbDetails)
    if (durationResolution) {
      result = {
        status: 'matched',
        reason: null,
        best: {
          candidate: durationResolution.candidate,
          score: 100,
        },
        runnerUp: null,
        margin: 100,
      }
      source += '+duration'
    }
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
      signals: durationResolution ? [{
        kind: 'broadcast_duration',
        slotMinutes: durationResolution.slotMinutes,
        runtimeMinutes: durationResolution.runtimeMinutes,
        excluded: durationResolution.excluded,
      }] : [],
    } : null,
  }
}

export class JoynTmdbSearchClient {
  constructor(options = {}) {
    this.client = new WaipuTmdbSearchClient({
      ...options,
      maxRequests: Math.max(2, Number(options.maxRequests || 100)),
    })
    this.detailClient = new WaipuTmdbSearchClient({
      ...options,
      maxRequests: Math.max(1, Number(options.detailMaxRequests || 300)),
    })
  }

  async search(input) {
    const title = String(input?.title || '').trim()
    if (!title) return []
    if (input?.type === 'movie' || input?.type === 'series') {
      return this.client.search({ type: input.type, title })
    }
    const movies = await this.client.search({ type: 'movie', title })
    const series = await this.client.search({ type: 'series', title })
    return [...movies, ...series]
  }

  async detail(candidate) {
    return this.detailClient.detail(candidate)
  }

  get requestsStarted() {
    return this.client.requestsStarted
  }

  get detailRequestsStarted() {
    return this.detailClient.requestsStarted
  }
}
