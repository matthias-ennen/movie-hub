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
  requireMultiSource = false,
  requireJoynHorizon = true,
  joynIndex,
  availabilityIndex,
  tvRuntimeIndex,
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
  const dayDescriptors = Array.isArray(waipuIndex?.days) ? waipuIndex.days : []
  const dayKeys = dayDescriptors.map((day) => String(day?.key || ''))
  const minimumDayKey = Number.isFinite(horizonStart)
    ? new Date(horizonStart - 86400000).toISOString().slice(0, 10)
    : null
  const maximumDayKey = Number.isFinite(horizonEnd)
    ? new Date(horizonEnd).toISOString().slice(0, 10)
    : null
  if (!Number.isFinite(horizonStart) || horizonEnd - horizonStart !== 14 * 86400000
    || !dayDescriptors.length
    || dayDescriptors.some((day) => !nonNegativeInteger(day.count)
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(day?.key || '')))
    || new Set(dayKeys).size !== dayKeys.length
    || dayKeys.some((key, index) => index > 0 && key <= dayKeys[index - 1])
    || dayKeys.some((key) => key < minimumDayKey || key > maximumDayKey)
    || dayDescriptors.reduce((total, day) => total + day.count, 0) !== waipuIndex?.counts?.broadcasts) {
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

  if (requireMultiSource) {
    const freshTimestamp = (value, label) => {
      const at = Date.parse(value)
      if (!Number.isFinite(at) || at > latestAllowed) errors.push(`${label}-Zeitstempel ungültig`)
      else if (Number.isFinite(dueAt) && at < dueAt) stale.push(`${label} älter als Tageslauf`)
    }
    freshTimestamp(joynIndex?.generatedAt, 'Joyn-Index')
    freshTimestamp(availabilityIndex?.generatedAt, 'Verfügbarkeitsindex')
    freshTimestamp(tvRuntimeIndex?.generatedAt, 'TV-App-Daten')
    if (joynIndex?.kind !== 'joyn-live-index' || joynIndex?.schemaVersion !== 1 || joynIndex?.status !== 'complete'
        || !positiveInteger(joynIndex?.stationCount) || !positiveInteger(joynIndex?.airingCount)
        || joynIndex?.metadata?.required !== true || !positiveInteger(joynIndex?.metadata?.total)
        || joynIndex?.metadata?.complete !== joynIndex?.metadata?.total) errors.push('Joyn-Index oder Titelmetadaten unvollständig')
    const joynDays = Array.isArray(joynIndex?.days) ? joynIndex.days : []
    if (!joynDays.length || joynDays.some((day) => !nonNegativeInteger(day.count) || !/^\d{4}-\d{2}-\d{2}$/.test(day.key))
        || new Set(joynDays.map((day) => day.key)).size !== joynDays.length
        || joynDays.some((day, i) => i > 0 && day.key <= joynDays[i - 1].key)
        || joynDays.reduce((sum, day) => sum + day.count, 0) !== joynIndex?.airingCount) errors.push('Joyn-Tagesbestand inkonsistent')
    const joynStart = Date.parse(joynIndex?.import?.horizon?.start)
    const joynEnd = Date.parse(joynIndex?.import?.horizon?.endExclusive)
    if (requireJoynHorizon && (joynStart !== horizonStart || joynEnd !== horizonEnd
        || joynIndex?.import?.status !== 'complete'
        || joynIndex?.import?.metrics?.windowsProcessed !== 56
        || !Array.isArray(joynIndex?.import?.coverage)
        || joynIndex.import.coverage.length !== joynIndex.stationCount
        || joynIndex.import.coverage.some(station => !positiveInteger(station.programs) || !Array.isArray(station.days))
        || Date.parse(joynIndex?.import?.horizon?.endExclusive) - Date.parse(joynIndex?.import?.horizon?.start) !== 14 * 86400000)) {
      errors.push('Joyn-Import deckt keine vollständig geprüften 14 Tage ab')
    }
    const sources = Array.isArray(availabilityIndex?.sources) ? availabilityIndex.sources : []
    const entries = Array.isArray(availabilityIndex?.entries) ? availabilityIndex.entries : []
    if (availabilityIndex?.kind !== 'moviehub-live-availability-index' || availabilityIndex?.schemaVersion !== 1
        || !positiveInteger(availabilityIndex?.count) || availabilityIndex.count !== entries.length
        || new Set(entries.map((entry) => entry.key)).size !== entries.length
        || !sources.some((s) => s.providerId === 'waipu') || !sources.some((s) => s.providerId === 'joyn')
        || sources.some(source => source.titleCount !== entries.filter(entry => entry.providerIds?.includes(source.providerId)).length)
        || entries.some((entry) => !entry.providerIds?.length || entry.providerIds.some((id) => !sources.some((source) => source.providerId === id)))) {
      errors.push('Gemeinsamer Verfügbarkeitsindex inkonsistent oder Quelle fehlt')
    }
    const runtimeDays = Array.isArray(tvRuntimeIndex?.days) ? tvRuntimeIndex.days : []
    if (tvRuntimeIndex?.kind !== 'moviehub-tv-runtime-index' || tvRuntimeIndex?.schemaVersion !== 1
        || !tvRuntimeIndex?.providers?.includes('waipu') || !tvRuntimeIndex?.providers?.includes('joyn')
        || !runtimeDays.length || runtimeDays.length !== tvRuntimeIndex?.dayCount
        || runtimeDays.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day.key) || !nonNegativeInteger(day.count) || !nonNegativeInteger(day.airingCount))
        || new Set(runtimeDays.map((day) => day.key)).size !== runtimeDays.length
        || runtimeDays.some((day, i) => i > 0 && day.key <= runtimeDays[i - 1].key)
        || runtimeDays.reduce((sum, day) => sum + day.count, 0) !== tvRuntimeIndex?.titleCount
        || runtimeDays.reduce((sum, day) => sum + day.airingCount, 0) !== tvRuntimeIndex?.airingCount) errors.push('TV-App-Daten inkonsistent oder Quelle fehlt')
    for (const [id, sourceIndex] of [['waipu', waipuIndex], ['joyn', joynIndex]]) {
      for (const refs of [sources, tvRuntimeIndex?.sources || []]) {
        const ref = refs.find((source) => source.providerId === id)
        if (!ref || ref.generatedAt !== sourceIndex?.generatedAt
            || (sourceIndex?.sourceGenerationId && ref.sourceGenerationId !== sourceIndex.sourceGenerationId)) errors.push(`${id}: App-Daten und Quellenstand passen nicht zusammen`)
      }
    }
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
    ...(requireMultiSource ? { joynAt: joynIndex?.generatedAt, joynStations: joynIndex?.stationCount,
      joynTitles: joynIndex?.metadata?.total, joynBroadcasts: joynIndex?.airingCount,
      activeTitles: availabilityIndex?.count, tvAirings: tvRuntimeIndex?.airingCount } : {}),
  }
}

export async function fetchPublishedData({ fetchImpl = fetch, now = new Date(), origin = publicOrigin } = {}) {
  const paths = ['/data-status.json', '/waipu-live/index.json', '/joyn-live/index.json', '/live-availability-index.json', '/tv-runtime/index.json']
  return Promise.all(paths.map(async (path) => {
    const url = new URL(path, origin)
    url.searchParams.set('watchdog', String(now.getTime()))
    const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Öffentliche Daten ${path}: HTTP ${response.status}`)
    return response.json()
  }))
}
