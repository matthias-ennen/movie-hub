import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const WAIPU_CACHE_SCHEMA_VERSION = 1
export const WAIPU_SLOT_DURATION_MS = 4 * 60 * 60 * 1_000

const STATION_CONFIG_URL = 'https://web-proxy.waipu.tv/station-config'
const GRID_INFO_URL = 'https://epg-cache.waipu.tv/api/grid/info'
const DEFAULT_USER_AGENT = 'MovieHub-Waipu-Public-Importer/1.0 (read-only; contact via repository)'

const MESSAGES = Object.freeze({
  INVALID_ARGUMENT: 'Die Waipu-Anfrage enthält einen ungültigen Bezeichner.',
  ENDPOINT_NOT_ALLOWED: 'Ein nicht freigegebener Waipu-Endpunkt wurde blockiert.',
  CREDENTIALS_FORBIDDEN: 'Der öffentliche Waipu-Client darf keine Zugangsdaten senden.',
  NETWORK_ERROR: 'Die öffentliche Waipu-Anfrage ist technisch fehlgeschlagen.',
  RESPONSE_TOO_LARGE: 'Die öffentliche Waipu-Antwort überschreitet das Größenlimit.',
  INVALID_JSON: 'Die öffentliche Waipu-Antwort enthält kein gültiges JSON.',
  FORBIDDEN_STOP: 'Waipu hat den Zugriff abgewiesen.',
  RATE_LIMIT_STOP: 'Waipu hat eine Begrenzung signalisiert.',
  UPSTREAM_ERROR: 'Waipu ist vorübergehend nicht verfügbar.',
  HTTP_ERROR: 'Waipu hat einen unerwarteten HTTP-Status geliefert.',
  SCHEMA_INVALID: 'Die öffentliche Waipu-Antwort entspricht nicht dem erwarteten Mindestvertrag.',
  CACHE_CORRUPT: 'Der persistente Waipu-Cache ist beschädigt oder inkompatibel.',
  CACHE_MISS_ON_304: 'Waipu meldete unveränderte Daten, aber der lokale Cacheeintrag fehlt.',
})

export class WaipuPublicDataError extends Error {
  constructor(code, { status = null, retryAfterSeconds = null, cause = null } = {}) {
    super(MESSAGES[code] || MESSAGES.NETWORK_ERROR, cause ? { cause } : undefined)
    this.name = 'WaipuPublicDataError'
    this.code = MESSAGES[code] ? code : 'NETWORK_ERROR'
    this.status = Number.isInteger(status) ? status : null
    this.retryAfterSeconds = Number.isInteger(retryAfterSeconds) ? retryAfterSeconds : null
  }
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null
}

function integerValue(value) {
  const number = numberValue(value)
  return Number.isInteger(number) ? number : null
}

function stringArray(value) {
  return Array.isArray(value) ? [...new Set(value.map(stringValue).filter(Boolean))] : []
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new WaipuPublicDataError('INVALID_ARGUMENT')
  return date
}

function encodeIdentifier(value) {
  const identifier = stringValue(value)
  if (!identifier || identifier.length > 256 || /[\u0000-\u001f\u007f]/.test(identifier)) {
    throw new WaipuPublicDataError('INVALID_ARGUMENT')
  }
  return encodeURIComponent(identifier)
}

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1_000)) : null
}

function allowedUrl(value) {
  const url = value instanceof URL ? value : new URL(value)
  const gridPath = /^\/api\/grid\/[^/]+\/[^/]+$/
  const programPath = /^\/api\/programs\/[^/]+$/
  const allowed = url.protocol === 'https:'
    && !url.username
    && !url.password
    && !url.search
    && ((url.hostname === 'web-proxy.waipu.tv' && url.pathname === '/station-config')
      || (url.hostname === 'epg-cache.waipu.tv'
        && (url.pathname === '/api/grid/info' || gridPath.test(url.pathname) || programPath.test(url.pathname))))
  if (!allowed) throw new WaipuPublicDataError('ENDPOINT_NOT_ALLOWED')
  return url
}

function stationList(body) {
  if (Array.isArray(body)) return body
  const source = objectValue(body)
  return Array.isArray(source.stations) ? source.stations : source.channels
}

export function normalizeStations(body) {
  const source = stationList(body)
  if (!Array.isArray(source) || !source.length) throw new WaipuPublicDataError('SCHEMA_INVALID')
  const stations = source.map((entry) => {
    const station = objectValue(entry)
    const id = stringValue(station.id ?? station.stationId ?? station.uuid)
    const displayName = stringValue(station.displayName ?? station.name ?? station.title)
    if (!id || !displayName) throw new WaipuPublicDataError('SCHEMA_INVALID')
    return {
      id,
      displayName,
      logoTemplateUrl: stringValue(station.logoTemplateUrl ?? station.logoUrl ?? station.logo),
      streamQualities: stringArray(station.streamQualities ?? station.qualities),
    }
  })
  if (new Set(stations.map(({ id }) => id)).size !== stations.length) {
    throw new WaipuPublicDataError('SCHEMA_INVALID')
  }
  return stations
}

export function normalizeGridInfo(body) {
  const source = objectValue(body)
  const slots = stringArray(source.slots)
  const slotDurationHours = integerValue(source.slotDurationHours ?? source.slotSizeHours)
  const timezone = stringValue(source.timezone) || 'UTC'
  if (!slots.length || slotDurationHours !== 4 || timezone.toUpperCase() !== 'UTC') {
    throw new WaipuPublicDataError('SCHEMA_INVALID')
  }
  return { slots, slotDurationHours, timezone: 'UTC' }
}

function gridList(body) {
  if (Array.isArray(body)) return body
  const source = objectValue(body)
  return source.programs
}

export function normalizeGrid(body) {
  const source = gridList(body)
  if (!Array.isArray(source)) throw new WaipuPublicDataError('SCHEMA_INVALID')
  return source.map((entry) => {
    const program = objectValue(entry)
    const id = stringValue(program.id ?? program.programId ?? program.uuid)
    const title = stringValue(program.title ?? objectValue(program.textContent).title)
    const start = new Date(program.startTime ?? program.start)
    const stop = new Date(program.stopTime ?? program.stop ?? program.endTime)
    if (!id || !title || !Number.isFinite(start.getTime()) || !Number.isFinite(stop.getTime()) || stop <= start) {
      throw new WaipuPublicDataError('SCHEMA_INVALID')
    }
    return {
      id,
      title,
      episodeTitle: stringValue(program.episodeTitle),
      genre: stringValue(program.genre ?? program.mainGenre ?? program.category),
      seriesId: stringValue(program.seriesId),
      startTime: start.toISOString(),
      stopTime: stop.toISOString(),
      imageUrl: stringValue(program.imageUrl ?? program.previewImageUrl),
    }
  })
}

export function normalizeProgram(body) {
  const source = objectValue(body)
  const text = objectValue(source.textContent)
  const production = objectValue(source.production)
  const series = objectValue(source.series)
  const contentMeta = objectValue(source.contentMeta)
  const id = stringValue(source.id ?? source.programId ?? source.uuid)
  const title = stringValue(text.title ?? source.title)
  if (!id || !title) throw new WaipuPublicDataError('SCHEMA_INVALID')
  const images = Array.isArray(source.imageUrls)
    ? source.imageUrls.map((entry) => stringValue(typeof entry === 'string' ? entry : objectValue(entry).url)).filter(Boolean)
    : []
  return {
    id,
    title,
    originalTitle: stringValue(text.titleOriginal ?? text.originalTitle ?? source.originalTitle),
    description: stringValue(text.descLong ?? text.description ?? source.description),
    shortDescription: stringValue(text.descShort ?? source.shortDescription),
    productionYear: integerValue(production.year ?? source.productionYear),
    productionCountries: stringArray(production.countries ?? source.productionCountries),
    mainGenre: stringValue(contentMeta.mainGenre ?? source.mainGenre ?? source.genre),
    subGenres: stringArray(contentMeta.subGenres ?? source.subGenres),
    seriesId: stringValue(series.id ?? source.seriesId),
    seasonNumber: integerValue(series.seasonNumber ?? source.seasonNumber),
    episodeNumber: integerValue(series.episodeNumber ?? source.episodeNumber),
    episodeTitle: stringValue(series.episodeTitle ?? source.episodeTitle),
    ageRating: stringValue(source.ageRating ?? contentMeta.ageRating),
    imageUrls: [...new Set(images)],
  }
}

export class WaipuPublicApiClient {
  constructor({
    fetchImpl = globalThis.fetch,
    maxResponseBytes = 2 * 1024 * 1024,
    requestTimeoutMs = 15_000,
    userAgent = DEFAULT_USER_AGENT,
    now = Date.now,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.')
    this.fetchImpl = fetchImpl
    this.maxResponseBytes = Math.max(1_024, Number(maxResponseBytes) || 0)
    this.requestTimeoutMs = Math.max(1_000, Number(requestTimeoutMs) || 0)
    this.userAgent = stringValue(userAgent) || DEFAULT_USER_AGENT
    this.now = now
  }

  async getStations(validators = {}) {
    return this.#request(STATION_CONFIG_URL, validators, normalizeStations)
  }

  async getGridInfo(validators = {}) {
    return this.#request(GRID_INFO_URL, validators, normalizeGridInfo)
  }

  async getGrid(stationId, slotStart, validators = {}) {
    const slot = validDate(slotStart).toISOString()
    const url = `https://epg-cache.waipu.tv/api/grid/${encodeIdentifier(stationId)}/${encodeIdentifier(slot)}`
    return this.#request(url, validators, normalizeGrid)
  }

  async getProgram(programId, validators = {}) {
    const url = `https://epg-cache.waipu.tv/api/programs/${encodeIdentifier(programId)}`
    return this.#request(url, validators, normalizeProgram)
  }

  async #request(urlValue, validators, normalize) {
    const url = allowedUrl(urlValue)
    const headers = new Headers({ Accept: 'application/json', 'User-Agent': this.userAgent })
    if (validators && (validators.authorization || validators.cookie)) {
      throw new WaipuPublicDataError('CREDENTIALS_FORBIDDEN')
    }
    const etag = stringValue(validators?.etag)
    const lastModified = stringValue(validators?.lastModified)
    if (etag) headers.set('If-None-Match', etag)
    if (lastModified) headers.set('If-Modified-Since', lastModified)

    let response
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      })
    } catch (cause) {
      throw new WaipuPublicDataError('NETWORK_ERROR', { cause })
    }

    const result = {
      status: response.status,
      etag: response.headers.get('etag') || null,
      lastModified: response.headers.get('last-modified') || null,
      cacheControl: response.headers.get('cache-control') || null,
      notModified: response.status === 304,
      value: null,
    }
    if (response.status === 304) return result
    if (response.status === 403) throw new WaipuPublicDataError('FORBIDDEN_STOP', { status: 403 })
    if (response.status === 429) {
      throw new WaipuPublicDataError('RATE_LIMIT_STOP', {
        status: 429,
        retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after'), this.now()),
      })
    }
    if (response.status >= 500) throw new WaipuPublicDataError('UPSTREAM_ERROR', { status: response.status })
    if (!response.ok) throw new WaipuPublicDataError('HTTP_ERROR', { status: response.status })

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > this.maxResponseBytes) {
      throw new WaipuPublicDataError('RESPONSE_TOO_LARGE', { status: response.status })
    }
    let bytes
    try {
      bytes = Buffer.from(await response.arrayBuffer())
    } catch (cause) {
      throw new WaipuPublicDataError('NETWORK_ERROR', { status: response.status, cause })
    }
    if (bytes.byteLength > this.maxResponseBytes) {
      throw new WaipuPublicDataError('RESPONSE_TOO_LARGE', { status: response.status })
    }
    let body
    try {
      body = JSON.parse(bytes.toString('utf8'))
    } catch (cause) {
      throw new WaipuPublicDataError('INVALID_JSON', { status: response.status, cause })
    }
    result.value = normalize(body)
    return result
  }
}

function cacheKey(kind, key) {
  return createHash('sha256').update(`${kind}\n${key}`).digest('hex')
}

function recordPath(root, kind, key) {
  return resolve(root, kind, `${cacheKey(kind, key)}.json`)
}

function validators(record) {
  return record ? { etag: record.etag, lastModified: record.lastModified } : {}
}

export class WaipuEpgCache {
  constructor({ root, now = Date.now } = {}) {
    if (!stringValue(root)) throw new TypeError('A cache root is required.')
    this.root = resolve(root)
    this.now = now
    this.inFlightPrograms = new Map()
  }

  async read(kind, key) {
    const path = recordPath(this.root, kind, key)
    let source
    try {
      source = await readFile(path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
    try {
      const record = JSON.parse(source)
      if (record.schemaVersion !== WAIPU_CACHE_SCHEMA_VERSION || record.kind !== kind || record.key !== key) {
        throw new Error('record mismatch')
      }
      return record
    } catch (cause) {
      throw new WaipuPublicDataError('CACHE_CORRUPT', { cause })
    }
  }

  async write(kind, key, response, { immutable = false } = {}) {
    const path = recordPath(this.root, kind, key)
    const record = {
      schemaVersion: WAIPU_CACHE_SCHEMA_VERSION,
      kind,
      key,
      storedAt: new Date(this.now()).toISOString(),
      checkedAt: new Date(this.now()).toISOString(),
      immutable: Boolean(immutable),
      etag: response.etag || null,
      lastModified: response.lastModified || null,
      value: response.value,
    }
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.${createHash('sha1').update(String(Math.random())).digest('hex')}.tmp`
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
    return record
  }

  async #revalidate(kind, key, fetcher, {
    immutable = false,
    freezeExisting = false,
    useValidators = true,
  } = {}) {
    const cached = await this.read(kind, key)
    if (cached?.immutable) return { value: cached.value, cache: 'immutable' }
    if (cached && freezeExisting) {
      const frozen = await this.write(kind, key, {
        value: cached.value,
        etag: cached.etag,
        lastModified: cached.lastModified,
      }, { immutable: true })
      return { value: frozen.value, cache: 'frozen' }
    }
    const response = await fetcher(useValidators ? validators(cached) : {})
    if (response.notModified) {
      if (!cached) throw new WaipuPublicDataError('CACHE_MISS_ON_304', { status: 304 })
      return { value: cached.value, cache: 'revalidated' }
    }
    const record = await this.write(kind, key, response, { immutable })
    return { value: record.value, cache: cached ? 'updated' : 'miss' }
  }

  async getStations(client) {
    return this.#revalidate('stations', 'station-config', (conditions) => client.getStations(conditions))
  }

  async getGridInfo(client) {
    return this.#revalidate('grid-info', 'grid-info', (conditions) => client.getGridInfo(conditions))
  }

  async getGrid(client, stationId, slotStart) {
    const slot = validDate(slotStart)
    const key = `${stringValue(stationId) || ''}|${slot.toISOString()}`
    if (!stringValue(stationId)) throw new WaipuPublicDataError('INVALID_ARGUMENT')
    const immutable = slot.getTime() + WAIPU_SLOT_DURATION_MS <= this.now()
    return this.#revalidate(
      'grid',
      key,
      (conditions) => client.getGrid(stationId, slot, conditions),
      { immutable, freezeExisting: immutable },
    )
  }

  async getProgram(client, programId) {
    const id = stringValue(programId)
    if (!id) throw new WaipuPublicDataError('INVALID_ARGUMENT')
    const cached = await this.read('program', id)
    if (cached) return { value: cached.value, cache: 'immutable' }
    if (this.inFlightPrograms.has(id)) return this.inFlightPrograms.get(id)
    const pending = this.#revalidate(
      'program',
      id,
      () => client.getProgram(id),
      { immutable: true, useValidators: false },
    ).finally(() => this.inFlightPrograms.delete(id))
    this.inFlightPrograms.set(id, pending)
    return pending
  }
}
