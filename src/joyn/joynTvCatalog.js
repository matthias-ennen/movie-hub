export const JOYN_LIVE_CATALOG_VERSION = 1
export const JOYN_LIVE_INDEX_URL = '/joyn-live/index.json'
export const JOYN_LIVE_STATIONS_URL = '/joyn-live/stations.json'

function safeStationId(value) {
  const id = String(value || '').trim()
  return /^[a-zA-Z0-9._-]{1,128}$/.test(id) ? id : null
}

function normalizeStation(raw) {
  const id = safeStationId(raw?.id ?? raw?.joynId)
  const name = String(raw?.name ?? raw?.title ?? '').trim()
  if (!id || !name) return null
  return {
    id,
    name,
    canonicalId: safeStationId(raw?.canonicalId),
    logoUrl: String(raw?.logoUrl || '').trim() || null,
    brandId: String(raw?.brandId || '').trim() || null,
  }
}

export function normalizeJoynLiveStationCatalog(indexRaw, stationsRaw) {
  if (indexRaw?.schemaVersion !== JOYN_LIVE_CATALOG_VERSION
      || indexRaw?.kind !== 'joyn-live-index'
      || indexRaw?.status !== 'complete'
      || stationsRaw?.schemaVersion !== JOYN_LIVE_CATALOG_VERSION
      || stationsRaw?.kind !== 'joyn-live-stations') return null

  const stations = (Array.isArray(stationsRaw.stations) ? stationsRaw.stations : [])
    .map(normalizeStation)
    .filter(Boolean)

  if (!stations.length) return null

  const days = (Array.isArray(indexRaw.days) ? indexRaw.days : [])
    .map((day) => ({ key: String(day?.key || ''), count: Number(day?.count) }))
    .filter(({ key, count }) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isInteger(count) && count >= 0)
    .sort((left, right) => left.key.localeCompare(right.key))

  return {
    status: 'ready',
    generatedAt: indexRaw.generatedAt || null,
    horizon: indexRaw.horizon || null,
    stations,
    days,
  }
}

export async function loadJoynLiveStationCatalog({ fetchImpl = fetch } = {}) {
  try {
    const [indexResponse, stationsResponse] = await Promise.all([
      fetchImpl(JOYN_LIVE_INDEX_URL, { cache: 'no-store' }),
      fetchImpl(JOYN_LIVE_STATIONS_URL, { cache: 'no-store' }),
    ])
    if (!indexResponse.ok || !stationsResponse.ok) return { status: 'unavailable', stations: [], days: [] }
    return normalizeJoynLiveStationCatalog(
      await indexResponse.json(),
      await stationsResponse.json(),
    ) || { status: 'unavailable', stations: [], days: [] }
  } catch {
    return { status: 'unavailable', stations: [], days: [] }
  }
}
