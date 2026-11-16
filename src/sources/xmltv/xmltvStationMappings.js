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

// #838 A3: exact identities from repeated G0 runs on 2026-11-16.
// Source-reviewed only; not part of the production allowlist until activation.
const EXPANSION_STATIONS = Object.freeze([
  { stationId: 'arte', stationName: 'ARTE', epgshare01: 'ARTE.de', commonDe: 'ARTE.de' },
  { stationId: '3sat', stationName: '3sat', epgshare01: '3sat.de', commonDe: '3sat.de' },
  { stationId: 'zdfneo', stationName: 'ZDFneo', epgshare01: 'ZDFneo.de', commonDe: 'zdf_neo.de' },
  { stationId: 'zdfinfo', stationName: 'ZDFinfo', epgshare01: 'ZDFinfo.de', commonDe: 'ZDFinfo.de' },
  { stationId: 'einsfestival', stationName: 'ONE', epgshare01: 'ONE.de', commonDe: 'ONE.de' },
  { stationId: 'kabeleins', stationName: 'Kabel Eins', epgshare01: 'kabel.eins.de', commonDe: 'KabelEins.de' },
  { stationId: 'rtl2', stationName: 'RTLZWEI', epgshare01: 'RTLZWEI.de', commonDe: 'RTLZWEI.de' },
  { stationId: 'superrtl', stationName: 'SUPER RTL', epgshare01: 'SUPER.RTL.de', commonDe: 'SuperRTL.de' },
  { stationId: 'tele5', stationName: 'TELE 5', epgshare01: 'Tele.5.de', commonDe: 'Tele5.de' },
  { stationId: 'prosieben_maxx', stationName: 'ProSieben MAXX', epgshare01: 'ProSieben.MAXX.de', commonDe: 'ProSiebenMAXX.de' },
  { stationId: 'sat1gold', stationName: 'SAT.1 GOLD', epgshare01: 'SAT.1.Gold.de', commonDe: 'SAT1GOLD.de' },
  { stationId: 'rtlnitro', stationName: 'NITRO', epgshare01: 'NITRO.de', commonDe: 'NITRO.de' },
])

export const XMLTV_REVIEWED_EXPANSION_STATIONS = Object.freeze(
  EXPANSION_STATIONS.map(({ stationId, stationName }) => Object.freeze({ stationId, stationName })),
)

export const XMLTV_STATION_MAPPING_VERSION = 1
export const XMLTV_REVIEWED_STATIONS = Object.freeze(
  REVIEWED_STATIONS.map(({ stationId, stationName }) => Object.freeze({ stationId, stationName })),
)

function mappingsFor(key, stations = REVIEWED_STATIONS) {
  return Object.freeze(Object.fromEntries(stations.map((station) => [
    station[key], Object.freeze({ stationId: station.stationId, stationName: station.stationName }),
  ])))
}

export const XMLTV_REVIEWED_STATION_MAPPINGS = Object.freeze({
  epgshare01: mappingsFor('epgshare01'),
  freeepg: mappingsFor('commonDe'),
  'iptv-epg-org': mappingsFor('commonDe'),
})

// Separate, opt-in registry for offline verification. Never use as a production default.
export const XMLTV_REVIEWED_EXPANSION_STATION_MAPPINGS = Object.freeze({
  epgshare01: mappingsFor('epgshare01', EXPANSION_STATIONS),
  freeepg: mappingsFor('commonDe', EXPANSION_STATIONS),
  'iptv-epg-org': mappingsFor('commonDe', EXPANSION_STATIONS),
})

/** An explicit mapping only. No fallback by display-name or approximate alias. */
export function reviewedXmltvStation(sourceId, rawStationId) {
  if (!Object.hasOwn(XMLTV_REVIEWED_STATION_MAPPINGS, sourceId)) return null
  const rows = XMLTV_REVIEWED_STATION_MAPPINGS[sourceId]
  return Object.hasOwn(rows, rawStationId) ? rows[rawStationId] : null
}
