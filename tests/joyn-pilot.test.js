import { describe, expect, it } from 'vitest'
import {
  JOYN_PILOT_STATIONS,
  joynPilotStationByWaipuId,
  joynPilotStationBySlug,
} from '../src/sources/joyn/joynPilotStations.js'
import { joynPlaybackRouteForStation } from '../src/sources/joyn/joynPlaybackRoute.js'

describe('Joyn pilot station inventory', () => {
  it('contains six unique confirmed pilot stations with Waipu mappings', () => {
    expect(JOYN_PILOT_STATIONS).toHaveLength(6)
    expect(new Set(JOYN_PILOT_STATIONS.map((station) => station.joynSlug)).size).toBe(6)
    expect(new Set(JOYN_PILOT_STATIONS.map((station) => station.waipuStationId)).size).toBe(6)
    expect(JOYN_PILOT_STATIONS.every((station) => station.joynUrl.startsWith('https://www.joyn.de/live-tv/'))).toBe(true)
  })

  it('maps canonical Waipu station ids without merging provider identities', () => {
    expect(joynPilotStationByWaipuId('pro7')).toMatchObject({
      name: 'ProSieben',
      joynSlug: 'prosieben',
    })
    expect(joynPilotStationBySlug('tele-5')).toMatchObject({
      name: 'Tele 5',
      waipuStationId: 'tele5',
    })
  })

  it('keeps web-confirmed Joyn targets as WEB_LINK until device verification', () => {
    expect(joynPlaybackRouteForStation('sat1', {
      verifiedAt: '2026-09-26T12:00:00Z',
    })).toMatchObject({
      providerId: 'joyn',
      mode: 'WEB_LINK',
      target: 'https://www.joyn.de/live-tv/sat1',
      geoRegion: 'DE',
    })
    expect(joynPlaybackRouteForStation('unknown')).toBeNull()
    expect(joynPlaybackRouteForStation('unknown', { brandId: 'brand-123' })).toMatchObject({
      providerId: 'joyn',
      mode: 'WEB_LINK',
      target: 'https://www.joyn.de/play/live-tv?channel_id=brand-123',
    })
  })
})
