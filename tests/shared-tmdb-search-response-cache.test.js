import { describe, expect, it, vi } from 'vitest'
import { JoynLookupCache } from '../scripts/joyn-match-cache.mjs'
import { JoynTmdbSearchClient } from '../scripts/joyn-tmdb-matcher.mjs'
import { WaipuTmdbSearchClient } from '../scripts/waipu-tmdb-matcher.mjs'
import {
  SHARED_TMDB_SEARCH_NAMESPACE,
  createSharedTmdbSearchResponseCache,
} from '../scripts/shared-tmdb-search-response-cache.mjs'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const movie = { id: 1101, title: 'Beispiel Film', release_date: '2020-05-10' }
const series = { id: 1102, name: 'Beispiel Serie', first_air_date: '2019-07-01' }
const reply = results => ({
  ok: true, status: 200, headers: new Headers(),
  json: async () => ({ page: 1, total_pages: 1, results }),
  text: async () => '',
})
const key = (path, params) => JSON.stringify([path, params])
const movieKey = key('/search/movie', {
  language: 'de-DE', query: movie.title, include_adult: 'false',
})

describe('MovieHub #336: opt-in cross-adapter TMDB response-cache bridge', () => {
  it('reuses an original Joyn TMDB search response in Waipu with ZERO second HTTP starts', async () => {
    const stored = new JoynLookupCache({}, NOW)
    const responseCache = createSharedTmdbSearchResponseCache(stored)
    const joynFetch = vi.fn(async () => reply([movie]))
    const waipuFetch = vi.fn(async () => { throw new Error('Must not request network') })
    const joyn = new JoynTmdbSearchClient({
      token: 'test', fetchImpl: joynFetch, responseCache, paceMs: 0, maxRetries: 0,
    })
    const waipu = new WaipuTmdbSearchClient({
      token: 'test', fetchImpl: waipuFetch, responseCache, paceMs: 0, maxRetries: 0,
    })
    expect((await joyn.search({ type: 'movie', title: movie.title }))[0].id).toBe(1101)
    expect(joyn.requestsStarted).toBe(1)
    expect(stored.get(SHARED_TMDB_SEARCH_NAMESPACE, movieKey).results[0].id).toBe(1101)
    const result = await waipu.search({ type: 'movie', title: movie.title })
    expect(result[0].id).toBe(1101)
    expect(waipu.requestsStarted).toBe(0)
    expect(waipuFetch).not.toHaveBeenCalled()
    expect(responseCache.counts()).toMatchObject({ hits: 1, stored: 1 })
    // It is a raw API response, not an automatically approved work identity.
    expect(stored.get(SHARED_TMDB_SEARCH_NAMESPACE, movieKey)).not.toHaveProperty('approved')
  })

  it('reuses a typed, year-scoped Waipu TV search in Joyn when every parameter agrees', async () => {
    const stored = new JoynLookupCache({}, NOW)
    const responseCache = createSharedTmdbSearchResponseCache(stored)
    const waipuFetch = vi.fn(async () => reply([series]))
    const joynFetch = vi.fn(async () => { throw new Error('No duplicate transport') })
    const waipu = new WaipuTmdbSearchClient({
      token: 'test', fetchImpl: waipuFetch, responseCache, paceMs: 0, maxRetries: 0,
    })
    const joyn = new JoynTmdbSearchClient({
      token: 'test', fetchImpl: joynFetch, responseCache, paceMs: 0, maxRetries: 0,
    })
    const input = { type: 'series', title: series.name, productionYear: 2019 }
    expect((await waipu.search({ ...input, firstAirDateYear: true }))[0].id).toBe(1102)
    expect((await joyn.search(input))[0].id).toBe(1102)
    expect(waipu.requestsStarted).toBe(1)
    expect(joyn.requestsStarted).toBe(0)
    expect(joynFetch).not.toHaveBeenCalled()
    const tvKey = key('/search/tv', {
      language: 'de-DE', query: series.name, include_adult: 'false', first_air_date_year: '2019',
    })
    expect(stored.get(SHARED_TMDB_SEARCH_NAMESPACE, tvKey).results[0].id).toBe(1102)
  })

  it('keeps movie and TV search, language, query and year distinct', async () => {
    const stored = new JoynLookupCache({}, NOW)
    const responseCache = createSharedTmdbSearchResponseCache(stored)
    const requests = []
    const fetchImpl = async url => {
      const u = new URL(String(url))
      requests.push(u.pathname + '?' + u.search)
      return reply(u.pathname.endsWith('/tv') ? [series] : [movie])
    }
    const de = new WaipuTmdbSearchClient({
      token: 'test', fetchImpl, responseCache, paceMs: 0, maxRetries: 0,
    })
    const en = new WaipuTmdbSearchClient({
      token: 'test', fetchImpl, responseCache, language: 'en-US',
      paceMs: 0, maxRetries: 0,
    })
    await de.search({ type: 'movie', title: movie.title, productionYear: 2020 })
    await de.search({ type: 'movie', title: movie.title, productionYear: 2021 })
    await en.search({ type: 'movie', title: movie.title, productionYear: 2020 })
    await de.search({ type: 'movie', title: movie.title + ' II', productionYear: 2020 })
    await de.search({ type: 'series', title: movie.title, firstAirDateYear: true, productionYear: 2020 })
    expect(requests).toHaveLength(5)
    expect(de.requestsStarted).toBe(4)
    expect(en.requestsStarted).toBe(1)
  })

  it('treats one seven-day-old original Joyn cache entry as stale, without extending its TTL', async () => {
    const stored = new JoynLookupCache({}, NOW)
    const responseCache = createSharedTmdbSearchResponseCache(stored)
    expect(responseCache.set(movieKey, { results: [movie] })).toBe(true)
    const oldTimestamp = stored.entries[stored.cacheKey(SHARED_TMDB_SEARCH_NAMESPACE, movieKey)].checkedAt
    expect(responseCache.get(movieKey).results[0].id).toBe(1101)
    expect(stored.entries[stored.cacheKey(SHARED_TMDB_SEARCH_NAMESPACE, movieKey)].checkedAt)
      .toBe(oldTimestamp)
    stored.now = NOW + 7 * DAY + 1
    expect(responseCache.get(movieKey)).toBeNull()
    const fetchImpl = vi.fn(async () => reply([movie]))
    const client = new WaipuTmdbSearchClient({
      token: 'test', fetchImpl, responseCache, paceMs: 0, maxRetries: 0,
    })
    await client.search({ type: 'movie', title: movie.title })
    expect(client.requestsStarted).toBe(1)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('rejects detail endpoints, diagnostic pages, unexpected flags and malformed keys', () => {
    const cache = createSharedTmdbSearchResponseCache(new JoynLookupCache({}, NOW))
    const keys = [
      key('/movie/1101', { language: 'de-DE' }),
      key('/search/movie', { language: 'de-DE', query: movie.title, include_adult: 'true' }),
      key('/search/movie', { language: 'de-DE', query: movie.title, include_adult: 'false', page: '2' }),
      key('/search/tv', { language: 'de-DE', query: series.name, include_adult: 'false', year: '2019' }),
      key('/search/movie', { language: 'de-DE', query: movie.title, include_adult: 'false', region: 'US' }),
      key('/search/movie', { language: 'de-DE', query: ' ', include_adult: 'false' }),
      key('/search/movie', { language: 'de-DE', query: movie.title, include_adult: 'false', year: '0000' }),
      '__proto__',
      '{this is not json',
    ]
    for (const bad of keys) {
      expect(cache.get(bad)).toBeNull()
      expect(cache.set(bad, { results: [movie] })).toBe(false)
    }
    expect(cache.counts().rejected).toBe(keys.length * 2)
  })

  it('does not store or reuse error-shaped, invalid or excessively large TMDB responses', () => {
    const stored = new JoynLookupCache({}, NOW)
    const cache = createSharedTmdbSearchResponseCache(stored)
    const invalid = [
      { results: [movie], status_code: 34 },
      { results: [movie], success: false },
      { results: [{ id: 12, name: 'Wrong media shape' }] },
      { results: [{ id: -1, title: 'Invalid ID' }] },
      { results: [movie], error: 'rate limited' },
      { results: Array(101).fill(movie) },
      { results: [movie], long: 'x'.repeat(512 * 1024) },
    ]
    for (const response of invalid) expect(cache.set(movieKey, response)).toBe(false)
    stored.set(SHARED_TMDB_SEARCH_NAMESPACE, movieKey, { results: [{ id: 3, name: 'Bogus' }] })
    expect(cache.get(movieKey)).toBeNull()
    expect(cache.counts()).toMatchObject({ hits: 0, stored: 0 })
  })

  it('does not share mutable result references between adapters', () => {
    const stored = new JoynLookupCache({}, NOW)
    const cache = createSharedTmdbSearchResponseCache(stored)
    const value = { results: [{ ...movie }] }
    expect(cache.set(movieKey, value)).toBe(true)
    value.results[0].title = 'Mutated by source'
    const first = cache.get(movieKey)
    first.results[0].title = 'Mutated by consumer'
    const second = cache.get(movieKey)
    expect(second.results[0].title).toBe(movie.title)
  })

  it('falls back to the original network client if the optional cache is broken', async () => {
    const cache = createSharedTmdbSearchResponseCache({
      get() { throw new Error('Broken optional cache') },
      set() { throw new Error('Read-only or broken cache') },
    })
    const fetchImpl = vi.fn(async () => reply([movie]))
    const client = new WaipuTmdbSearchClient({
      token: 'test', fetchImpl, responseCache: cache, paceMs: 0, maxRetries: 0,
    })
    const matches = await client.search({ type: 'movie', title: movie.title })
    expect(matches[0].id).toBe(movie.id)
    expect(client.requestsStarted).toBe(1)
    expect(cache.counts()).toMatchObject({ hits: 0, misses: 1, rejected: 1 })
  })

  it('preserves default independent behavior unless explicitly wired', async () => {
    const fetchImpl = vi.fn(async () => reply([movie]))
    const waipu = new WaipuTmdbSearchClient({
      token: 'test', fetchImpl, paceMs: 0, maxRetries: 0,
    })
    const joyn = new JoynTmdbSearchClient({
      token: 'test', fetchImpl, paceMs: 0, maxRetries: 0,
    })
    await waipu.search({ type: 'movie', title: movie.title })
    await joyn.search({ type: 'movie', title: movie.title })
    expect(waipu.requestsStarted).toBe(1)
    expect(joyn.requestsStarted).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
