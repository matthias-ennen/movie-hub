export const WAIPU_DETAIL_DEFAULTS = Object.freeze({
  requestBudget: 300,
  paceMs: 500,
  jitterMs: 150,
  maxRetries: 3,
  retryBaseMs: 2_000,
})

function integer(value, fallback, minimum, maximum) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

function retryable(error) {
  return error?.code === 'UPSTREAM_ERROR' || error?.code === 'NETWORK_ERROR'
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

export class WaipuProgramDetailLoader {
  constructor({
    cache,
    client,
    requestBudget = WAIPU_DETAIL_DEFAULTS.requestBudget,
    paceMs = WAIPU_DETAIL_DEFAULTS.paceMs,
    jitterMs = WAIPU_DETAIL_DEFAULTS.jitterMs,
    maxRetries = WAIPU_DETAIL_DEFAULTS.maxRetries,
    retryBaseMs = WAIPU_DETAIL_DEFAULTS.retryBaseMs,
    now = Date.now,
    random = Math.random,
    sleep = delay,
  } = {}) {
    if (!cache?.getProgram || !client?.getProgram) throw new TypeError('Waipu cache and client are required.')
    this.cache = cache
    this.client = client
    this.requestBudget = integer(requestBudget, WAIPU_DETAIL_DEFAULTS.requestBudget, 1, 10_000)
    this.paceMs = integer(paceMs, WAIPU_DETAIL_DEFAULTS.paceMs, 350, 10_000)
    this.jitterMs = integer(jitterMs, WAIPU_DETAIL_DEFAULTS.jitterMs, 0, 2_000)
    this.maxRetries = integer(maxRetries, WAIPU_DETAIL_DEFAULTS.maxRetries, 0, 3)
    this.retryBaseMs = integer(retryBaseMs, WAIPU_DETAIL_DEFAULTS.retryBaseMs, 100, 60_000)
    this.now = now
    this.random = random
    this.sleep = sleep
    this.previousStartedAt = null
    this.metrics = {
      requestsStarted: 0,
      retries: 0,
      cacheHits: 0,
      detailsLoaded: 0,
    }
  }

  async load(programId) {
    const result = await this.cache.getProgram({
      getProgram: (id) => this.#requestWithRetry(() => this.client.getProgram(id)),
    }, programId)
    if (result.cache === 'immutable') this.metrics.cacheHits += 1
    else this.metrics.detailsLoaded += 1
    return result.value
  }

  async #requestWithRetry(operation) {
    let retries = 0
    while (true) {
      try {
        return await this.#gatedRequest(operation)
      } catch (error) {
        if (!retryable(error) || retries >= this.maxRetries) throw error
        await this.sleep(this.retryBaseMs * (2 ** retries) + Math.floor(this.random() * (this.jitterMs + 1)))
        retries += 1
        this.metrics.retries += 1
      }
    }
  }

  async #gatedRequest(operation) {
    if (this.metrics.requestsStarted >= this.requestBudget) {
      const error = new Error(`Waipu detail request budget exhausted after ${this.metrics.requestsStarted} requests.`)
      error.code = 'REQUEST_BUDGET_EXHAUSTED'
      throw error
    }
    if (this.previousStartedAt !== null) {
      const gap = this.paceMs + Math.floor(this.random() * (this.jitterMs + 1))
      const remaining = this.previousStartedAt + gap - this.now()
      if (remaining > 0) await this.sleep(remaining)
    }
    this.previousStartedAt = this.now()
    this.metrics.requestsStarted += 1
    return operation()
  }
}
