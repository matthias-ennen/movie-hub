const publicOrigin = 'https://movie-hub-62459.web.app'

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

export function evaluatePublishedData(dataStatus, waipuIndex, {
  scheduledAt,
  now = new Date(),
  expectedStations = 228,
} = {}) {
  const errors = []
  const stale = []
  const statusAt = Date.parse(dataStatus?.generatedAt)
  const waipuAt = Date.parse(waipuIndex?.generatedAt)
  const dueAt = Date.parse(scheduledAt)
  const horizonStart = Date.parse(waipuIndex?.horizon?.start)
  const horizonEnd = Date.parse(waipuIndex?.horizon?.endExclusive)
  const latestAllowed = now.getTime() + 5 * 60_000

  if (dataStatus?.kind !== 'movie-hub-data-status' || dataStatus?.version !== 2) errors.push('Datenstatus-Schema ungültig')
  if (!Number.isFinite(statusAt) || statusAt > latestAllowed) errors.push('Datenstatus-Zeitstempel ungültig')
  if (!positiveInteger(dataStatus?.catalog?.total)
    || dataStatus.catalog.total !== dataStatus.catalog.movies + dataStatus.catalog.series) errors.push('Katalogzähler inkonsistent')
  if (!positiveInteger(dataStatus?.searchIndex?.total)
    || dataStatus.searchIndex.total !== dataStatus.searchIndex.movies + dataStatus.searchIndex.series
    || !nonNegativeInteger(dataStatus?.completeSearchDetails?.pending)
    || dataStatus.searchIndex.total !== dataStatus.completeSearchDetails.total + dataStatus.completeSearchDetails.pending) {
    errors.push('Suchindexzähler inkonsistent')
  }

  if (waipuIndex?.kind !== 'waipu-live-index' || waipuIndex?.schemaVersion !== 1 || waipuIndex?.status !== 'complete') errors.push('Waipu-Index nicht vollständig')
  if (!Number.isFinite(waipuAt) || waipuAt > latestAllowed) errors.push('Waipu-Zeitstempel ungültig')
  if (waipuIndex?.counts?.stations !== expectedStations) errors.push(`Waipu-Senderzahl ungleich ${expectedStations}`)
  if (!positiveInteger(waipuIndex?.counts?.titles) || !positiveInteger(waipuIndex?.counts?.broadcasts)) errors.push('Waipu-Titel oder Ausstrahlungen fehlen')
  if (!Number.isFinite(horizonStart) || horizonEnd - horizonStart !== 14 * 86400000
    || !Array.isArray(waipuIndex?.days) || waipuIndex.days.length !== 14
    || waipuIndex.days.some((day, index) => !nonNegativeInteger(day.count)
      || day.key !== new Date(horizonStart + index * 86400000).toISOString().slice(0, 10))
    || waipuIndex.days.reduce((total, day) => total + day.count, 0) !== waipuIndex?.counts?.broadcasts) {
    errors.push('Waipu-Tagesbestand inkonsistent')
  }
  if (waipuIndex?.metadata?.required === true && waipuIndex.metadata.complete !== waipuIndex?.counts?.titles) {
    errors.push('Waipu-Titelmetadaten unvollständig')
  }

  if (!Number.isFinite(dueAt)) errors.push('Geplanter Start ungültig')
  else {
    if (Number.isFinite(statusAt) && statusAt < dueAt) stale.push('Datenstatus älter als Tageslauf')
    if (Number.isFinite(waipuAt) && waipuAt < dueAt) stale.push('Waipu-Index älter als Tageslauf')
  }

  return {
    status: errors.length ? 'invalid' : stale.length ? 'stale' : 'fresh',
    reasons: [...errors, ...stale],
    dataStatusAt: dataStatus?.generatedAt,
    waipuAt: waipuIndex?.generatedAt,
    catalogTitles: dataStatus?.catalog?.total,
    searchTitles: dataStatus?.searchIndex?.total,
    stations: waipuIndex?.counts?.stations,
    waipuTitles: waipuIndex?.counts?.titles,
    broadcasts: waipuIndex?.counts?.broadcasts,
  }
}

export async function fetchPublishedData({ fetchImpl = fetch, now = new Date(), origin = publicOrigin } = {}) {
  const paths = ['/data-status.json', '/waipu-live/index.json']
  return Promise.all(paths.map(async (path) => {
    const url = new URL(path, origin)
    url.searchParams.set('watchdog', String(now.getTime()))
    const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Öffentliche Daten ${path}: HTTP ${response.status}`)
    return response.json()
  }))
}
