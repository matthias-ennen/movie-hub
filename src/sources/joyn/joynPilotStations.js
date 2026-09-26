export const JOYN_PILOT_STATIONS_VERSION = 1

export const JOYN_PILOT_STATIONS = Object.freeze([
  {
    stationKey: 'prosieben',
    name: 'ProSieben',
    joynSlug: 'prosieben',
    joynUrl: 'https://www.joyn.de/live-tv/prosieben',
    waipuStationId: 'pro7',
    access: 'free',
    linkScope: 'channel-live-page',
    deviceVerification: 'pending',
  },
  {
    stationKey: 'sat1',
    name: 'SAT.1',
    joynSlug: 'sat1',
    joynUrl: 'https://www.joyn.de/live-tv/sat1',
    waipuStationId: 'sat1',
    access: 'free',
    linkScope: 'channel-live-page',
    deviceVerification: 'pending',
  },
  {
    stationKey: 'kabeleins',
    name: 'Kabel Eins',
    joynSlug: 'kabel-eins',
    joynUrl: 'https://www.joyn.de/live-tv/kabel-eins',
    waipuStationId: 'kabeleins',
    access: 'free',
    linkScope: 'channel-live-page',
    deviceVerification: 'pending',
  },
  {
    stationKey: 'zdf',
    name: 'ZDF',
    joynSlug: 'zdf',
    joynUrl: 'https://www.joyn.de/live-tv/zdf',
    waipuStationId: 'zdf',
    access: 'free',
    linkScope: 'channel-live-page',
    deviceVerification: 'pending',
  },
  {
    stationKey: 'dmax',
    name: 'DMAX',
    joynSlug: 'dmax',
    joynUrl: 'https://www.joyn.de/live-tv/dmax',
    waipuStationId: 'dmax',
    access: 'free',
    linkScope: 'channel-live-page',
    deviceVerification: 'pending',
  },
  {
    stationKey: 'tele5',
    name: 'Tele 5',
    joynSlug: 'tele-5',
    joynUrl: 'https://www.joyn.de/live-tv/tele-5',
    waipuStationId: 'tele5',
    access: 'free',
    linkScope: 'channel-live-page',
    deviceVerification: 'pending',
  },
])

export function joynPilotStationByWaipuId(stationId) {
  const id = String(stationId || '').trim()
  return JOYN_PILOT_STATIONS.find((station) => station.waipuStationId === id) || null
}

export function joynPilotStationBySlug(slug) {
  const value = String(slug || '').trim()
  return JOYN_PILOT_STATIONS.find((station) => station.joynSlug === value) || null
}
