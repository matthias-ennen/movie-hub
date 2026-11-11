/**
 * #336 G1b – first source-specific, evidence-reviewed station identities.
 *
 * Exact XMLTV channel IDs below were read from the original, real G0 source
 * report of 2026-11-11 (workflow 43083401056). Canonical IDs are reused
 * unchanged from MovieHub's existing Waipu / Joyn TV station identity.
 *
 * Names are presentation metadata, NEVER runtime/fuzzy-match inputs. This is
 * deliberately a six-station pilot, not an inference for every feed channel.
 * Numeric FreeEPG alternate grids and regional variants require a separate
 * review; never silently merge them into these canonical channels.
 */
const REVIEWED_STATIONS = Object.freeze([
  { stationId: 'ard', stationName: 'Das Erste', epgshare01: 'Das.Erste.de', commonDe: 'DasErste.de' },
  { stationId: 'zdf', stationName: 'ZDF', epgshare01: 'ZDF.de', commonDe: 'ZDF.de' },
  { stationId: 'rtl', stationName: 'RTL', epgshare01: 'RTL.de', commonDe: 'RTL.de' },
  { stationId: 'pro7', stationName: 'ProSieben', epgshare01: 'ProSieben.de', commonDe: 'ProSieben.de' },
  { stationId: 'sat1', stationName: 'SAT.1', epgshare01: 'SAT.1.de', commonDe: 'SAT1.de' },
  { stationId: 'vox', stationName: 'VOX', epgshare01: 'VOX.de', commonDe: 'VOX.de' },
])

export const XMLTV_STATION_MAPPING_VERSION = 1
export const XMLTV_REVIEWED_STATIONS = Object.freeze(
  REVIEWED_STATIONS.map(({ stationId, stationName }) => Object.freeze({ stationId, stationName })),
)

function mappingsFor(key) {
  return Object.freeze(Object.fromEntries(REVIEWED_STATIONS.map((station) => [
    station[key], Object.freeze({ stationId: station.stationId, stationName: station.stationName }),
  ])))
}

export const XMLTV_REVIEWED_STATION_MAPPINGS = Object.freeze({
  epgshare01: mappingsFor('epgshare01'),
  freeepg: mappingsFor('commonDe'),
  'iptv-epg-org': mappingsFor('commonDe'),
})

/** An explicit mapping only. No fallback by display-name or approximate alias. */
export function reviewedXmltvStation(sourceId, rawStationId) {
  return XMLTV_REVIEWED_STATION_MAPPINGS[sourceId]?.[rawStationId] || null
}
