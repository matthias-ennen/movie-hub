import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'

export const WAIPU_MATCHER_VERSION = 1
export const WAIPU_MATCH_THRESHOLDS = Object.freeze({ movie: 80, series: 75, minimumMargin: 12 })
export const WAIPU_NEGATIVE_MATCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function mediaType(value) {
  if (value === 'series' || value === 'tv') return 'series'
  if (value === 'movie') return 'movie'
  return null
}

function aliases(value) {
  const extra = Array.isArray(value?.aliases) ? value.aliases : []
  return [...new Set([value?.title, value?.originalTitle, ...extra]
    .map(normalizeWaipuText)
    .filter(Boolean))]
}

function yearFromDate(value) {
  const match = String(value || '').match(/^(\d{4})-/)
  return match ? Number(match[1]) : null
}

function tokenDice(left, right) {
  const a = new Set(left.split(/\s+/).filter(Boolean))
  const b = new Set(right.split(/\s+/).filter(Boolean))
  if (!a.size || !b.size) return 0
  let overlap = 0
  for (const token of a) if (b.has(token)) overlap += 1
  return (2 * overlap) / (a.size + b.size)
}

function titleScore(inputAliases, candidateAliases) {
  let best = 0
  let exactCount = 0
  for (const input of inputAliases) {
    for (const candidate of candidateAliases) {
      if (input === candidate) {
        best = Math.max(best, 70)
        exactCount += 1
        continue
      }
      const similarity = tokenDice(input, candidate)
      const containment = input.includes(candidate) || candidate.includes(input)
      best = Math.max(best, Math.round(similarity * 55) + (containment ? 3 : 0))
    }
  }
  return { score: best, exactCount }
}

function normalizedCountries(value) {
  return new Set((Array.isArray(value) ? value : []).map(normalizeWaipuText).filter(Boolean))
}

function countryOverlap(input, candidate) {
  const left = normalizedCountries(input.productionCountries)
  const right = normalizedCountries(candidate.productionCountries || candidate.originCountries)
  if (!left.size || !right.size) return false
  for (const value of left) if (right.has(value)) return true
  return false
}

export function normalizeTmdbMatchCandidate(raw, source = 'local') {
  const type = mediaType(raw?.type ?? raw?.mediaType ?? raw?.media_type)
  const tmdbId = finiteNumber(raw?.tmdbId ?? raw?.id)
  const title = String(raw?.title ?? raw?.name ?? '').trim()
  if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0 || !title) return null
  return {
    tmdbId,
    type,
    title,
    originalTitle: String(raw?.originalTitle ?? raw?.original_title ?? raw?.original_name ?? '').trim() || null,
    year: finiteNumber(raw?.year) ?? yearFromDate(raw?.releaseDate ?? raw?.release_date ?? raw?.firstAirDate ?? raw?.first_air_date),
    productionCountries: Array.isArray(raw?.productionCountries) ? raw.productionCountries : [],
    originCountries: Array.isArray(raw?.originCountries ?? raw?.origin_country)
      ? (raw.originCountries ?? raw.origin_country)
      : [],
    posterUrl: raw?.posterUrl || null,
    source,
  }
}

export function scoreWaipuTmdbCandidate(input, rawCandidate) {
  const candidate = normalizeTmdbMatchCandidate(rawCandidate, rawCandidate?.source)
  if (!candidate || candidate.type !== input?.type) return null
  const inputAliases = aliases(input)
  const candidateAliases = aliases(candidate)
  const title = titleScore(inputAliases, candidateAliases)
  if (title.score < 35) return null

  let score = title.score
  const signals = [`title:${title.score}`]
  if (title.exactCount > 1) {
    score += 5
    signals.push('multiple_exact_aliases:+5')
  }

  const inputYear = finiteNumber(input.productionYear)
  const candidateYear = finiteNumber(candidate.year)
  if (inputYear !== null && candidateYear !== null) {
    const difference = Math.abs(inputYear - candidateYear)
    if (input.type === 'movie') {
      if (difference === 0) { score += 20; signals.push('movie_year_exact:+20') }
      else if (difference === 1) { score += 10; signals.push('movie_year_near:+10') }
      else if (difference === 2) { score += 4; signals.push('movie_year_tolerated:+4') }
      else { score -= 20; signals.push('movie_year_conflict:-20') }
    } else if (difference === 0) {
      score += 5
      signals.push('series_year_exact:+5')
    } else if (difference === 1) {
      score += 3
      signals.push('series_year_near:+3')
    }
  }

  if (countryOverlap(input, candidate)) {
    score += 5
    signals.push('country_overlap:+5')
  }
  if (input.type === 'series' && (input.seriesId || input.seasonNumber !== null || input.episodeNumber !== null)) {
    score += 8
    signals.push('series_structure:+8')
  }

  return { candidate, score, signals }
}

export function chooseWaipuTmdbMatch(input, candidates, thresholds = WAIPU_MATCH_THRESHOLDS) {
  const scored = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => scoreWaipuTmdbCandidate(input, candidate))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.candidate.tmdbId - right.candidate.tmdbId)
  const best = scored[0] || null
  const runnerUp = scored[1] || null
  const minimumScore = input?.type === 'series' ? thresholds.series : thresholds.movie
  const margin = best ? best.score - (runnerUp?.score ?? 0) : 0
  if (!best) return { status: 'unmatched', reason: 'no_candidate', best: null, runnerUp: null, margin: 0 }
  if (best.score < minimumScore) {
    return { status: 'unmatched', reason: 'below_threshold', best, runnerUp, margin }
  }
  if (runnerUp && margin < thresholds.minimumMargin) {
    return { status: 'unmatched', reason: 'ambiguous_margin', best, runnerUp, margin }
  }
  return { status: 'matched', reason: null, best, runnerUp, margin }
}

export function matchCacheKey(input) {
  const payload = JSON.stringify({
    version: WAIPU_MATCHER_VERSION,
    type: input?.type || null,
    aliases: aliases(input).sort(),
    year: finiteNumber(input?.productionYear),
    countries: [...normalizedCountries(input?.productionCountries)].sort(),
  })
  return createHash('sha256').update(payload).digest('hex')
}

export async function matchWaipuProgram(input, {
  localCandidates = [],
  searchTmdb = null,
  decisions = null,
  thresholds = WAIPU_MATCH_THRESHOLDS,
  now = Date.now,
  negativeCacheMaxAgeMs = WAIPU_NEGATIVE_MATCH_MAX_AGE_MS,
} = {}) {
  const key = matchCacheKey(input)
  const cached = decisions?.get?.(key)
  if (cached?.matcherVersion === WAIPU_MATCHER_VERSION && cached?.status === 'matched') {
    return { ...cached, cache: 'hit' }
  }
  const cachedAt = Date.parse(cached?.checkedAt)
  if (cached?.matcherVersion === WAIPU_MATCHER_VERSION
      && cached?.status === 'unmatched'
      && cached?.source === 'local+tmdb-search'
      && Number.isFinite(cachedAt)
      && now() - cachedAt < negativeCacheMaxAgeMs) {
    return { ...cached, cache: 'hit' }
  }

  let result = chooseWaipuTmdbMatch(input, localCandidates, thresholds)
  let source = 'local'
  if (result.status !== 'matched' && typeof searchTmdb === 'function') {
    const remote = await searchTmdb(input)
    const byKey = new Map()
    for (const candidate of [...localCandidates, ...(Array.isArray(remote) ? remote : [])]) {
      const normalized = normalizeTmdbMatchCandidate(candidate, candidate?.source || 'tmdb-search')
      if (normalized) byKey.set(`${normalized.type}:${normalized.tmdbId}`, normalized)
    }
    result = chooseWaipuTmdbMatch(input, [...byKey.values()], thresholds)
    source = 'local+tmdb-search'
  }

  const decision = {
    matcherVersion: WAIPU_MATCHER_VERSION,
    checkedAt: new Date(now()).toISOString(),
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
      signals: result.best.signals,
    } : null,
  }
  decisions?.set?.(key, decision)
  return { ...decision, cache: 'miss' }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

export class WaipuTmdbSearchClient {
  constructor({
    token,
    fetchImpl = globalThis.fetch,
    language = 'de-DE',
    maxRequests = 100,
    paceMs = 250,
    maxRetries = 3,
    now = Date.now,
    sleep = delay,
  } = {}) {
    if (!String(token || '').trim()) throw new TypeError('TMDB token is required.')
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.')
    this.token = String(token).trim()
    this.fetchImpl = fetchImpl
    this.language = language
    this.maxRequests = Math.max(1, Math.floor(Number(maxRequests) || 0))
    this.paceMs = Math.max(0, Math.floor(Number(paceMs) || 0))
    this.maxRetries = Math.max(0, Math.floor(Number(maxRetries) || 0))
    this.now = now
    this.sleep = sleep
    this.lastStartedAt = null
    this.requestsStarted = 0
  }

  async search(input) {
    const query = String(input?.title || input?.originalTitle || '').trim()
    if (!query || !['movie', 'series'].includes(input?.type)) return []
    const endpoint = input.type === 'movie' ? '/search/movie' : '/search/tv'
    const params = {
      language: this.language,
      query,
      include_adult: 'false',
    }
    if (input.type === 'movie' && Number.isInteger(Number(input.productionYear))) {
      params.year = String(input.productionYear)
    }
    const payload = await this.#request(endpoint, params)
    return (Array.isArray(payload?.results) ? payload.results : []).map((result) => ({
      ...result,
      type: input.type,
      source: 'tmdb-search',
    }))
  }

  async #request(path, params, attempt = 0) {
    if (this.requestsStarted >= this.maxRequests) {
      const error = new Error(`TMDB request budget exhausted after ${this.requestsStarted} requests.`)
      error.code = 'TMDB_REQUEST_BUDGET'
      throw error
    }
    if (this.lastStartedAt !== null) {
      const wait = this.paceMs - (this.now() - this.lastStartedAt)
      if (wait > 0) await this.sleep(wait)
    }
    this.lastStartedAt = this.now()
    this.requestsStarted += 1
    const url = new URL(`https://api.themoviedb.org/3${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const response = await this.fetchImpl(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}` },
    })
    if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : 500 * (2 ** attempt))
      return this.#request(path, params, attempt + 1)
    }
    if (!response.ok) {
      const body = await response.text()
      const error = new Error(`TMDB search failed with HTTP ${response.status}: ${body.slice(0, 200)}`)
      error.code = 'TMDB_SEARCH_FAILED'
      throw error
    }
    return response.json()
  }
}

export class WaipuMatchDecisionStore {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial))
  }

  get(key) { return this.values.get(key) }
  set(key, value) { this.values.set(key, value) }
  toJSON() {
    return {
      schemaVersion: 1,
      kind: 'waipu-tmdb-match-decisions',
      matcherVersion: WAIPU_MATCHER_VERSION,
      decisions: Object.fromEntries([...this.values.entries()].sort(([left], [right]) => left.localeCompare(right))),
    }
  }

  static async load(path) {
    try {
      const payload = JSON.parse(await readFile(path, 'utf8'))
      if (payload?.schemaVersion !== 1 || payload?.kind !== 'waipu-tmdb-match-decisions') throw new Error('invalid match cache')
      return new WaipuMatchDecisionStore(payload.decisions)
    } catch (error) {
      if (error?.code === 'ENOENT') return new WaipuMatchDecisionStore()
      throw error
    }
  }

  async save(path) {
    await mkdir(dirname(resolve(path)), { recursive: true })
    const temporary = `${resolve(path)}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(this.toJSON(), null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, resolve(path))
  }
}
