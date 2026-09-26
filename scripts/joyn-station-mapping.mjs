import { WAIPU_MOVIE_HUB_STATIONS } from './waipu-station-order.mjs'
import { stationMatchKey } from './waipu-station-inventory.mjs'

export const JOYN_STATION_MAPPING_VERSION = 1

// Reviewed aliases only. Do not add fuzzy/runtime guesses here.
export const JOYN_STATION_REVIEWED_ALIASES = Object.freeze([
  ['ZDF info', 'zdfinfo'],
  ['MTV live', 'mtv'],
  ['HGTV', 'hgtv'],
  ['ARD Plus Lindenstraße', 'lindenstrasse'],
  ['DEFA TV', 'defatv'],
  ['Top Sci-Fi', 'topscifi'],
])

function canonicalByKey() {
  const grouped = new Map()
  for (const station of WAIPU_MOVIE_HUB_STATIONS) {
    for (const value of [station.name, station.websiteName]) {
      const key = stationMatchKey(value)
      if (!key) continue
      if (!grouped.has(key)) grouped.set(key, new Map())
      grouped.get(key).set(station.id, station)
    }
  }
  return grouped
}

const canonicalLookup = canonicalByKey()
const reviewedLookup = new Map(
  JOYN_STATION_REVIEWED_ALIASES.map(([joynName, canonicalId]) => [
    stationMatchKey(joynName),
    canonicalId,
  ]),
)
const canonicalById = new Map(WAIPU_MOVIE_HUB_STATIONS.map((station) => [station.id, station]))

export function mapJoynStationToCanonical({ id, title } = {}) {
  const joynId = String(id || '').trim() || null
  const joynTitle = String(title || '').trim() || null
  if (!joynTitle) return {
    status: 'unmatched',
    joynId,
    joynTitle,
    canonicalId: null,
    method: null,
  }

  const key = stationMatchKey(joynTitle)
  const reviewedId = reviewedLookup.get(key)
  if (reviewedId && canonicalById.has(reviewedId)) {
    return {
      status: 'matched',
      joynId,
      joynTitle,
      canonicalId: reviewedId,
      canonicalName: canonicalById.get(reviewedId).name,
      method: 'reviewed-alias',
    }
  }

  const candidates = [...(canonicalLookup.get(key)?.values() || [])]
  if (candidates.length === 1) {
    return {
      status: 'matched',
      joynId,
      joynTitle,
      canonicalId: candidates[0].id,
      canonicalName: candidates[0].name,
      method: 'normalized-name',
    }
  }

  return {
    status: candidates.length > 1 ? 'ambiguous' : 'unmatched',
    joynId,
    joynTitle,
    canonicalId: null,
    method: null,
    candidates: candidates.map(({ id: candidateId, name }) => ({ id: candidateId, name })),
  }
}

export function buildJoynStationMapping(streams = []) {
  const entries = (Array.isArray(streams) ? streams : [])
    .map((stream) => mapJoynStationToCanonical({
      id: stream?.id,
      title: stream?.title,
    }))
    .sort((left, right) => (
      String(left.joynTitle || '').localeCompare(String(right.joynTitle || ''), 'de')
      || String(left.joynId || '').localeCompare(String(right.joynId || ''))
    ))

  return {
    schemaVersion: JOYN_STATION_MAPPING_VERSION,
    kind: 'joyn-station-mapping',
    counts: {
      joynStreams: entries.length,
      matched: entries.filter((entry) => entry.status === 'matched').length,
      normalizedName: entries.filter((entry) => entry.method === 'normalized-name').length,
      reviewedAlias: entries.filter((entry) => entry.method === 'reviewed-alias').length,
      ambiguous: entries.filter((entry) => entry.status === 'ambiguous').length,
      unmatched: entries.filter((entry) => entry.status === 'unmatched').length,
    },
    entries,
  }
}
