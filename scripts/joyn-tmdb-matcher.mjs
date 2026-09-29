import { createHash } from 'node:crypto'
import {
  normalizeTmdbMatchCandidate,
  WaipuTmdbSearchClient,
} from './waipu-tmdb-matcher.mjs'
import { normalizeWaipuText } from './waipu-program-classifier.mjs'

export const JOYN_MATCHER_VERSION = 5

const JOYN_MOVIE_RUNTIME_OVERRUN_TOLERANCE_MINUTES = 5
const JOYN_DESCRIPTION_MIN_OVERLAP = 6
const JOYN_DESCRIPTION_MIN_SCORE = 0.22
const JOYN_DESCRIPTION_MIN_MARGIN = 0.12
const DESCRIPTION_STOPWORDS = new Set([
  'aber','alle','allem','allen','aller','alles','also','auch','auf','aus','bei','beim','bis','das','dass','dem','den',
  'der','des','die','dies','diese','diesem','diesen','dieser','durch','eine','einem','einen','einer','eines','für','gegen',
  'hat','haben','ihm','ihn','ihnen','ihr','ihre','ihrem','ihren','ihrer','ist','mit','nach','nicht','noch','oder','ohne',
  'sich','sie','sind','über','und','unter','vom','von','vor','war','werden','wird','wurde','zum','zur','zwischen',
  'about','after','again','against','also','and','are','because','been','before','being','between','both','but','can',
  'does','during','each','for','from','have','into','more','most','not','only','other','over','same','some','such',
  'than','that','the','their','them','then','there','these','they','this','through','under','very','was','were','what',
  'when','where','which','while','who','with','would',
])

function aliases(value) {
  return [...new Set([
    value?.title,
    value?.originalTitle,
    ...(Array.isArray(value?.aliases) ? value.aliases : []),
  ].map(normalizeWaipuText).filter(Boolean))]
}

function inputTitles(input) {
  return [...new Set([
    input?.title,
    ...(Array.isArray(input?.aliases) ? input.aliases : []),
  ].map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function bestInputTitleScore(input, candidate) {
  const scores = inputTitles(input).map((value) => ({
    value,
    score: score(value, candidate),
  }))
  return scores.sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, 'de'))[0]
    || { value: null, score: 0 }
}

function dice(left, right) {
  const a = new Set(String(left).split(/\s+/).filter(Boolean))
  const b = new Set(String(right).split(/\s+/).filter(Boolean))
  if (!a.size || !b.size) return 0
  let overlap = 0
  for (const token of a) if (b.has(token)) overlap += 1
  return (2 * overlap) / (a.size + b.size)
}

function descriptionTokens(value) {
  return normalizeWaipuText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !DESCRIPTION_STOPWORDS.has(token))
}

function descriptionEvidence(left, right) {
  const a = new Set(descriptionTokens(left))
  const b = new Set(descriptionTokens(right))
  if (!a.size || !b.size) return { score: 0, overlap: 0 }
  let overlap = 0
  for (const token of a) if (b.has(token)) overlap += 1
  return {
    score: (2 * overlap) / (a.size + b.size),
    overlap,
  }
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
    if (Array.isArray(raw?.aliases)) candidate.aliases = [...raw.aliases]
    if (raw?.joynSearchAliasYearVerified === true) {
      candidate.joynSearchAliasYearVerified = true
      candidate.joynSearchAlias = raw.joynSearchAlias || null
      candidate.joynSearchAliasYear = finiteNumber(raw.joynSearchAliasYear)
    }
    if (input?.type && candidate.type !== input.type) continue
    byKey.set(`${candidate.type}:${candidate.tmdbId}`, candidate)
  }
  const ranked = [...byKey.values()]
    .map((candidate) => {
      const matchedInput = bestInputTitleScore(input, candidate)
      return { candidate, score: matchedInput.score, matchedInputTitle: matchedInput.value }
    })
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
    if (bestInputTitleScore(input, candidate).score !== 100) continue
    byKey.set(`${candidate.type}:${candidate.tmdbId}`, candidate)
  }
  return [...byKey.values()]
}

function disambiguateByProductionYear(input, candidates) {
  const inputYear = finiteNumber(input?.productionYear)
  if (!input?.type || inputYear === null) return null

  const exact = exactTitleCandidates(input, candidates)
  if (exact.length < 2) return null

  const exactYear = exact.filter((candidate) => finiteNumber(candidate?.year) === inputYear)
  if (exactYear.length !== 1) return null

  return {
    candidate: exactYear[0],
    productionYear: inputYear,
    competingYears: exact
      .filter((candidate) => candidate.tmdbId !== exactYear[0].tmdbId)
      .map((candidate) => ({ tmdbId: candidate.tmdbId, year: finiteNumber(candidate?.year) })),
  }
}

function disambiguateByDescription(input, candidates) {
  const inputDescription = String(input?.description || '').trim()
  if (!input?.type || !inputDescription) return null

  const exact = exactTitleCandidates(input, candidates)
  if (exact.length < 2 || exact.some((candidate) => !String(candidate?.description || '').trim())) return null

  const ranked = exact
    .map((candidate) => ({
      candidate,
      ...descriptionEvidence(inputDescription, candidate.description),
    }))
    .sort((left, right) => (
      right.score - left.score
      || right.overlap - left.overlap
      || left.candidate.tmdbId - right.candidate.tmdbId
    ))

  const best = ranked[0]
  const runnerUp = ranked[1]
  const margin = best.score - runnerUp.score
  const overlapMargin = best.overlap - runnerUp.overlap
  if (best.overlap < JOYN_DESCRIPTION_MIN_OVERLAP
      || best.score < JOYN_DESCRIPTION_MIN_SCORE
      || margin < JOYN_DESCRIPTION_MIN_MARGIN
      || overlapMargin < 3) return null

  return {
    candidate: best.candidate,
    score: best.score,
    overlap: best.overlap,
    runnerUpScore: runnerUp.score,
    runnerUpOverlap: runnerUp.overlap,
    margin,
  }
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
    type: input?.type || null,
    description: normalizeWaipuText(input?.description),
    productionYear: finiteNumber(input?.productionYear),
    seasonNumber: finiteNumber(input?.seasonNumber),
    episodeNumber: finiteNumber(input?.episodeNumber),
    broadcastDurationMinutes: finiteNumber(input?.broadcastDurationMinutes),
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

  let yearResolution = null
  if (result.status !== 'matched' && result.reason === 'ambiguous_exact_title') {
    yearResolution = disambiguateByProductionYear(input, combinedCandidates)
    if (yearResolution) {
      result = {
        status: 'matched',
        reason: null,
        best: {
          candidate: yearResolution.candidate,
          score: 100,
          matchedInputTitle: bestInputTitleScore(input, yearResolution.candidate).value,
        },
        runnerUp: null,
        margin: 100,
      }
      source += '+year'
    }
  }

  let descriptionResolution = null
  if (result.status !== 'matched' && result.reason === 'ambiguous_exact_title') {
    descriptionResolution = disambiguateByDescription(input, combinedCandidates)
    if (descriptionResolution) {
      result = {
        status: 'matched',
        reason: null,
        best: {
          candidate: descriptionResolution.candidate,
          score: 100,
          matchedInputTitle: bestInputTitleScore(input, descriptionResolution.candidate).value,
        },
        runnerUp: null,
        margin: descriptionResolution.margin,
      }
      source += '+description'
    }
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
          matchedInputTitle: bestInputTitleScore(input, durationResolution.candidate).value,
        },
        runnerUp: null,
        margin: 100,
      }
      source += '+duration'
    }
  }

  const signals = []
  const matchedInputTitle = result.status === 'matched' ? result.best?.matchedInputTitle : null
  if (matchedInputTitle
      && normalizeWaipuText(matchedInputTitle) !== normalizeWaipuText(input?.title)) {
    signals.push({
      kind: 'joyn_title_alias',
      alias: matchedInputTitle,
    })
  }
  const searchAliasResolution = result.status === 'matched' && result.best?.candidate?.joynSearchAliasYearVerified === true
    ? {
      alias: result.best.candidate.joynSearchAlias,
      productionYear: result.best.candidate.joynSearchAliasYear,
    }
    : null
  if (searchAliasResolution) {
    source += '+search-alias-year'
    signals.push({
      kind: 'tmdb_search_alias_year',
      alias: searchAliasResolution.alias,
      productionYear: searchAliasResolution.productionYear,
    })
  }
  if (yearResolution) {
    signals.push({
      kind: 'production_year',
      productionYear: yearResolution.productionYear,
      competingYears: yearResolution.competingYears,
    })
  }
  if (descriptionResolution) {
    signals.push({
      kind: 'description',
      score: Number(descriptionResolution.score.toFixed(3)),
      overlap: descriptionResolution.overlap,
      runnerUpScore: Number(descriptionResolution.runnerUpScore.toFixed(3)),
      runnerUpOverlap: descriptionResolution.runnerUpOverlap,
      margin: Number(descriptionResolution.margin.toFixed(3)),
    })
  }
  if (durationResolution) {
    signals.push({
      kind: 'broadcast_duration',
      slotMinutes: durationResolution.slotMinutes,
      runtimeMinutes: durationResolution.runtimeMinutes,
      excluded: durationResolution.excluded,
    })
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
      signals,
    } : null,
  }
}

function withVerifiedJoynSearchAlias(input, candidates) {
  const values = Array.isArray(candidates) ? candidates : []
  const title = String(input?.title || '').trim()
  const inputYear = finiteNumber(input?.productionYear)
  if (!title || !input?.type || inputYear === null || values.length !== 1) return values

  const normalized = normalizeTmdbMatchCandidate(values[0], values[0]?.source || 'tmdb-search')
  if (!normalized || normalized.type !== input.type || finiteNumber(normalized.year) !== inputYear) return values

  return [{
    ...values[0],
    aliases: [...new Set([
      ...(Array.isArray(values[0]?.aliases) ? values[0].aliases : []),
      title,
    ].filter(Boolean))],
    joynSearchAliasYearVerified: true,
    joynSearchAlias: title,
    joynSearchAliasYear: inputYear,
  }]
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
    const titles = inputTitles(input)
    if (!titles.length) return []

    if (input?.type === 'movie' || input?.type === 'series') {
      const hasYear = finiteNumber(input.productionYear) !== null
      for (const title of titles) {
        const queryInput = { ...input, title }
        const results = await this.client.search({
          type: input.type,
          title,
          productionYear: input.productionYear,
          firstAirDateYear: input.type === 'series' && hasYear,
        })
        if (results.length > 0) return withVerifiedJoynSearchAlias(queryInput, results)
        if (!hasYear) continue

        const fallback = await this.client.search({
          type: input.type,
          title,
        })
        if (fallback.length > 0) return fallback
      }
      return []
    }

    const title = titles[0]
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
