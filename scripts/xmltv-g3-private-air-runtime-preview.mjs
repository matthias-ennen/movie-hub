/**
 * #336 G3b – pure private adapter-to-runtime projection.
 * No API, disk or publication writes; production source discovery independently
 * rejects unapproved AIR directories. Synthetic registries are test-only.
 */
import { XMLTV_AIR_ROUTE_CANDIDATES, xmltvAirFieldsForEvent } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { mergeTvAirings } from '../src/sources/mergeTvAirings.js'
import { buildLiveAvailabilityIndex } from '../src/sources/liveAvailabilityIndex.js'
import { buildTvRuntimeSnapshot, tvRuntimeTitleKey } from '../src/tv/tvRuntimePublication.js'
import { episodeReference } from '../src/catalog/episodeContext.js'

export function buildPrivateXmltvAirRuntimePreview({
  confirmedEvents = [], catalog = null, existingSources = [], searchIndex = null,
  now = Date.now(), fieldsForEvent = xmltvAirFieldsForEvent,
} = {}) {
  const time = Number(now)
  if (!Number.isFinite(time)) throw new TypeError('Invalid now')
  const counts = { received: 0, rejectedTime: 0, noApprovedRoute: 0, missingCatalogTitle: 0,
    projected: 0, deduplicated: 0 }
  const titles = new Map()
  for (const item of Array.isArray(catalog?.titles) ? catalog.titles : []) {
    const key = tvRuntimeTitleKey(item)
    if (key && typeof item.title === 'string' && item.title.trim()) titles.set(key, item)
  }
  const byProvider = new Map()
  for (const event of Array.isArray(confirmedEvents) ? confirmedEvents : []) {
    counts.received++
    const start = Date.parse(event?.startAt), stop = Date.parse(event?.endAt)
    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start || stop <= time) {
      counts.rejectedTime++; continue
    }
    const fields = fieldsForEvent(event)
    const route = fields?.playbackRoutes?.[0]
    const candidate = XMLTV_AIR_ROUTE_CANDIDATES.find((row) => row.providerId === route?.providerId)
    if (!candidate || fields.providerIds?.length !== 1 || fields.providerIds[0] !== candidate.providerId ||
      fields.playbackRoutes?.length !== 1 || route.mode !== 'WEB_LINK' || route.scope !== 'channel' ||
      route.target !== candidate.target || event.channelId !== candidate.stationId ||
      !Number.isFinite(Date.parse(route.verifiedAt))) { counts.noApprovedRoute++; continue }
    const type = event.titleRef?.mediaType, tmdbId = event.titleRef?.tmdbId
    const key = tvRuntimeTitleKey({ type, tmdbId })
    const title = titles.get(key)
    // A cached response may confirm identity but does not establish a complete
    // catalogue record. Leave that title for the existing metadata ingestion.
    if (!title) { counts.missingCatalogTitle++; continue }
    const id = candidate.providerId
    if (!byProvider.has(id)) byProvider.set(id, new Map())
    const entries = byProvider.get(id)
    if (!entries.has(key)) entries.set(key, { type, tmdbId, title: title.title, tmdbProviderIds: [], airings: [] })
    entries.get(key).airings.push({
      type, tmdbId, stationId: candidate.stationId, canonicalStationId: candidate.stationId,
      stationName: candidate.label, startTime: new Date(start).toISOString(), stopTime: new Date(stop).toISOString(),
      episode: type === 'series' ? episodeReference({ episode: event.episode }) : null,
      providerIds: [id], providerStationIds: { [id]: candidate.stationId }, playbackRoutes: [route],
    })
    counts.projected++
  }
  const generatedAt = new Date(time).toISOString()
  const sourceCatalogs = [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([providerId, entries]) => ({
      providerId, generatedAt, sourceGenerationId: 'private-xmltv-air:' + providerId + ':' + generatedAt,
      entries: [...entries.values()].map((entry) => {
        const airings = mergeTvAirings(entry.airings)
        counts.deduplicated += entry.airings.length - airings.length
        return { ...entry, airings, nextAiring: airings[0] }
      }),
    }))
  const combined = [...(Array.isArray(existingSources) ? existingSources : []), ...sourceCatalogs]
  return { counts, sourceCatalogs,
    liveAvailability: buildLiveAvailabilityIndex(combined, { now: time }),
    tvRuntime: buildTvRuntimeSnapshot({ sourceCatalogs: combined, catalog, searchIndex, now: time }),
  }
}
