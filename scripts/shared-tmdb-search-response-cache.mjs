/**
 * MovieHub #336 – opt-in, same-request TMDB response cache bridge.
 *
 * Connects the existing WaipuTmdbSearchClient.responseCache interface with
 * the existing JoynLookupCache 'tmdb-search-v1' namespace. This does NOT
 * approve a film/series/episode identity, change matcher rules, or enable
 * the shared EPG identity index. No production adapter wires this by default.
 *
 * Only literally identical, valid TMDB search request keys may be shared.
 * Never reuse an XMLTV/Joyn/Waipu matcher decision as a search response.
 */
export const SHARED_TMDB_SEARCH_NAMESPACE = 'tmdb-search-v1'
const MAX_QUERY_LENGTH = 255
const MAX_RESPONSE_BYTES = 512 * 1024
const MAX_RESULTS = 100

function requestForKey(key) {
  if (typeof key !== 'string' || key.length > 1024) return null
  try {
    const parsed = JSON.parse(key)
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const [path, params] = parsed
    if (path !== '/search/movie' && path !== '/search/tv') return null
    if (!params || typeof params !== 'object' ||
        Array.isArray(params) || Object.getPrototypeOf(params) !== Object.prototype) return null
    if (JSON.stringify(parsed) !== key) return null

    const allowed = new Set(['language', 'query', 'include_adult',
      ...(path === '/search/movie' ? ['year'] : ['first_air_date_year'])])
    if (Object.keys(params).some(name => !allowed.has(name))) return null
    if (typeof params.language !== 'string' ||
        !/^[a-z]{2}-[A-Z]{2}$/.test(params.language) ||
        typeof params.query !== 'string' || !params.query.trim() ||
        params.query.length > MAX_QUERY_LENGTH ||
        params.query !== params.query.trim() ||
        /[\u0000-\u001f]/u.test(params.query) ||
        params.include_adult !== 'false') return null

    const year = path === '/search/movie' ? params.year : params.first_air_date_year
    if (year !== undefined &&
        (typeof year !== 'string' || !/^\d{4}$/.test(year) ||
         Number(year) < 1888 || Number(year) > 2100)) return null
    return path
  } catch {
    return null
  }
}

function safeResponse(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray(value.results) || value.results.length > MAX_RESULTS ||
      value.error != null || value.errors != null || value.status_code != null ||
      value.success === false) return null
  const titleField = path === '/search/movie' ? 'title' : 'name'
  if (!value.results.every(item => item && typeof item === 'object' &&
        !Array.isArray(item) && Number.isSafeInteger(item.id) && item.id > 0 &&
        typeof item[titleField] === 'string' && item[titleField].trim())) return null
  try {
    const json = JSON.stringify(value)
    if (!json || Buffer.byteLength(json, 'utf8') > MAX_RESPONSE_BYTES) return null
    // Do not give one adapter a mutable reference owned by another adapter.
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Adapter shape understood by BOTH original WaipuTmdbSearchClient and
 * JoynTmdbSearchClient (the latter wraps the same original TMDB client).
 *
 * JoynLookupCache already checks the original 7-day timestamp and technical
 * failure state; a read does not renew that timestamp. No new cache format,
 * file path, remote call, or extra request budget is introduced here.
 *
 * @param {object} lookupCache Existing JoynLookupCache instance; never global.
 */
export function createSharedTmdbSearchResponseCache(lookupCache) {
  if (!lookupCache || typeof lookupCache.get !== 'function' ||
      typeof lookupCache.set !== 'function') {
    throw new TypeError('Existing lookup cache with get/set is required')
  }
  const counters = { hits: 0, misses: 0, stored: 0, rejected: 0 }
  return Object.freeze({
    get(key) {
      const path = requestForKey(key)
      if (!path) {
        counters.rejected++
        return null
      }
      try {
        const response = lookupCache.get(SHARED_TMDB_SEARCH_NAMESPACE, key)
        const safe = safeResponse(response, path)
        if (safe !== null) counters.hits++
        else counters.misses++
        return safe
      } catch {
        // Cache corrupt or unavailable: original TMDB client may fetch normally.
        counters.misses++
        return null
      }
    },
    set(key, response) {
      const path = requestForKey(key)
      const safe = path ? safeResponse(response, path) : null
      if (safe === null) {
        counters.rejected++
        return false
      }
      try {
        lookupCache.set(SHARED_TMDB_SEARCH_NAMESPACE, key, safe)
        counters.stored++
        return true
      } catch {
        counters.rejected++
        return false
      }
    },
    counts() {
      return { ...counters }
    },
  })
}
