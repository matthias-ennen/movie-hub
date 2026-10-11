import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { writeJoynJson } from './joyn-epg-sync.mjs'

const MINUTE = 60000
const guardedHosts = new Set(['auth.joyn.de', 'api.joyn.de', 'ffqrv35svv-dsn.algolia.net'])
const transientGraphqlCodes = new Set(['INTERNAL_SERVER_ERROR', 'SERVICE_UNAVAILABLE', 'GATEWAY_TIMEOUT', 'TIMEOUT'])

function responseProblem(body, operation, invalidJson) {
  if (invalidJson) return { reason: 'invalid_json', retryable: true }
  if (Array.isArray(body?.errors) && body.errors.length) {
    const codes = body.errors.map(error => error?.extensions?.code)
    return { reason: 'graphql_errors', retryable: codes.every(code => transientGraphqlCodes.has(code)),
      errorCount: codes.length, errorCodes: [...new Set(codes.map(code => transientGraphqlCodes.has(code)
        || ['GRAPHQL_VALIDATION_FAILED', 'BAD_USER_INPUT', 'UNAUTHENTICATED', 'FORBIDDEN', 'PERSISTED_QUERY_NOT_FOUND'].includes(code) ? code : 'UNKNOWN'))] }
  }
  if (operation === 'algolia') return Array.isArray(body?.results) && body.results.length === 1 && Array.isArray(body.results[0]?.hits)
    ? null : { reason: 'missing_algolia_hits', retryable: false }
  if (!body?.data || typeof body.data !== 'object') return { reason: 'missing_graphql_data', retryable: false }
  if (operation === 'titleSearch' && !Array.isArray(body.data.search?.results)) return { reason: 'missing_search_results', retryable: false }
  if (operation === 'searchKey' && !String(body.data.searchApiKey || '').trim()) return { reason: 'missing_search_key', retryable: false }
  return null
}

function operationFor(url) {
  if (url.hostname === 'auth.joyn.de') return 'auth'
  if (url.hostname.endsWith('.algolia.net')) return 'algolia'
  return ({ LiveChannelsAndEPG: 'inventory', EpgEventsV2Enrichment: 'epg', AlgoliaApiKey: 'searchKey',
    SearchQ: 'titleSearch', LandingPageClient: 'seriesDetail' })[url.searchParams.get('operationName')] || 'graphql'
}

export function joynTechnicalFailure(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) => (
    (['status', 'reason'].includes(key) && typeof item === 'string' && /(?:^|_)http_\d+|graphql_error|(?:^|_)error$/.test(item))
    || (item && typeof item === 'object' && joynTechnicalFailure(item))
  ))
}

function failure(code, operation, status = null) {
  return Object.assign(new Error(`Joyn ${operation}: ${code}${status ? ` (HTTP ${status})` : ''}; last complete publication retained.`),
    { code, operation, ...(status ? { status } : {}) })
}

export class JoynSourceGuard {
  constructor({ directory, state, fetchImpl = fetch, now = Date.now,
    sleep = ms => new Promise(done => setTimeout(done, ms)), budgets = {} }) {
    this.directory = directory; this.state = state; this.fetchImpl = fetchImpl; this.now = now; this.sleep = sleep; this.budgets = budgets
    this.state.run = { startedAt: new Date(now()).toISOString(), status: 'running', budgets: { ...budgets }, requests: {}, retries: 0, errors: {} }
    this.fetch = this.fetch.bind(this)
  }
  static async load(options) {
    let state
    try {
      state = JSON.parse(await readFile(resolve(options.directory, 'source-health.json'), 'utf8'))
      if (state.kind !== 'joyn-source-health' || state.schemaVersion !== 1 || !state.circuit
          || typeof state.circuit.automaticRunsDisabled !== 'boolean'
          || (state.circuit.blockedUntil !== null && !Number.isFinite(Date.parse(state.circuit.blockedUntil)))) throw new Error('Invalid Joyn source health checkpoint.')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      state = { kind: 'joyn-source-health', schemaVersion: 1, circuit: { automaticRunsDisabled: false, blockedUntil: null } }
    }
    if (options.resetCircuit || (!state.circuit.automaticRunsDisabled && Date.parse(state.circuit.blockedUntil) <= (options.now || Date.now)())) state.circuit = { automaticRunsDisabled: false, blockedUntil: null }
    // A first authentication failure must also have a durable checkpoint group.
    try { await readFile(resolve(options.directory, 'checkpoint.json')) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      await writeJoynJson(resolve(options.directory, 'checkpoint.json'), { kind: 'joyn-sync-checkpoint', schemaVersion: 1, windows: {} })
    }
    return new JoynSourceGuard({ ...options, state })
  }
  snapshot() { return structuredClone(this.state) }
  async save() { await writeJoynJson(resolve(this.directory, 'source-health.json'), this.state) }
  assertAvailable() {
    const circuit = this.state.circuit
    if (circuit.automaticRunsDisabled || Date.parse(circuit.blockedUntil) > this.now()) throw failure('JOYN_SOURCE_PAUSED', circuit.operation || 'source')
  }
  async waitUntilAvailable({ maxWaitMs = 15 * MINUTE, signal } = {}) {
    const startedAt = this.now()
    const circuit = this.state.circuit
    const remaining = Date.parse(circuit.blockedUntil) - startedAt
    if (circuit.automaticRunsDisabled || remaining > maxWaitMs) this.assertAvailable()
    if (remaining > 0) {
      this.state.run.pauseWaitMs = remaining
      await this.save()
      while (Date.parse(circuit.blockedUntil) > this.now()) {
        signal?.throwIfAborted()
        if (this.now() - startedAt >= maxWaitMs) this.assertAvailable()
        await this.sleep(Math.min(30000, Date.parse(circuit.blockedUntil) - this.now(), maxWaitMs - (this.now() - startedAt)))
      }
    }
    if (!circuit.automaticRunsDisabled && Date.parse(circuit.blockedUntil) <= this.now()) {
      this.state.circuit = { automaticRunsDisabled: false, blockedUntil: null }
      await this.save()
    }
    this.assertAvailable()
  }
  async stop(code, operation, status = null, pauseMs = 15 * MINUTE, manual = false, diagnostic = null) {
    this.state.circuit = { automaticRunsDisabled: manual, blockedUntil: manual ? null : new Date(this.now() + pauseMs).toISOString(),
      openedAt: new Date(this.now()).toISOString(), reason: code, operation, httpStatus: status,
      ...(diagnostic ? { diagnostic } : {}) }
    await this.save()
    throw failure(code, operation, status)
  }
  async finish(status, error = null) {
    this.state.run.status = status
    this.state.run.finishedAt = new Date(this.now()).toISOString()
    if (error) this.state.run.failure = { code: error.code || 'JOYN_IMPORT_FAILED', operation: error.operation || null }
    await this.save()
  }
  async fetch(input, options = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url || input)
    if (!guardedHosts.has(url.hostname)) {
      const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
      return this.fetchImpl(input, { ...options, signal })
    }
    const operation = operationFor(url)
    this.assertAvailable()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const started = this.state.run.requests[operation] || 0
      if (this.budgets[operation] !== undefined && started >= this.budgets[operation]) throw failure('JOYN_SOURCE_REQUEST_BUDGET', operation)
      this.state.run.requests[operation] = started + 1
      let response, networkError = false
      try {
        const attemptSignal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
        response = await this.fetchImpl(input, { ...options, signal: attemptSignal })
      } catch { networkError = true }
      const status = response?.status
      if (networkError || status >= 500) {
        const reason = networkError ? 'network_error' : `http_${status}`
        this.state.run.errors[reason] = (this.state.run.errors[reason] || 0) + 1
        if (attempt < 2 && !options.signal?.aborted) {
          this.state.run.retries += 1
          await this.sleep(500 * (2 ** attempt)); continue
        }
        await this.stop('JOYN_SOURCE_UNAVAILABLE', operation, status)
      }
      if ([401, 403, 429].includes(status)) {
        this.state.run.errors[`http_${status}`] = (this.state.run.errors[`http_${status}`] || 0) + 1
        const retryAfter = response.headers?.get?.('retry-after')
        const seconds = Number(retryAfter)
        const until = retryAfter && Number.isFinite(seconds) ? this.now() + Math.max(0, seconds) * 1000 : Date.parse(retryAfter)
        const pause = status === 429 && Number.isFinite(until) && until > this.now() ? Math.min(until - this.now(), 7 * 86400000) : 15 * MINUTE
        await this.stop(status === 403 ? 'JOYN_SOURCE_FORBIDDEN' : status === 429 ? 'JOYN_SOURCE_RATE_LIMIT' : 'JOYN_SOURCE_AUTH', operation, status, pause, status === 403)
      }
      if (!response.ok) {
        // Missing optional asset pages are explicit unavailable responses, not cached empty search hits.
        if (operation === 'seriesDetail' && [404, 410].includes(status)) return response
        this.state.run.errors[`http_${status}`] = (this.state.run.errors[`http_${status}`] || 0) + 1
        await this.stop('JOYN_SOURCE_HTTP', operation, status)
      }
      if (['api.joyn.de', 'ffqrv35svv-dsn.algolia.net'].includes(url.hostname)) {
        let body, invalidJson = false
        try { body = await response.clone().json() } catch { invalidJson = true }
        const problem = responseProblem(body, operation, invalidJson)
        if (problem) {
          // Never persist response text, headers, URLs, auth tokens or API keys.
          const diagnostic = { ...problem, httpStatus: status, operation, attempt: attempt + 1 }
          if (operation === 'titleSearch') {
            try { diagnostic.title = String(JSON.parse(url.searchParams.get('variables'))?.text || '').replace(/[\r\n]/g, ' ').slice(0, 160) } catch {}
          }
          this.state.run.lastResponseProblem = diagnostic
          this.state.run.errors[problem.reason] = (this.state.run.errors[problem.reason] || 0) + 1
          if (problem.retryable && attempt < 2 && !options.signal?.aborted) {
            this.state.run.retries += 1
            await this.sleep(500 * (2 ** attempt)); continue
          }
          await this.stop(problem.retryable ? 'JOYN_SOURCE_UNAVAILABLE' : 'JOYN_SOURCE_SCHEMA', operation, status, 15 * MINUTE, false, diagnostic)
        }
      }
      return response
    }
  }
}
