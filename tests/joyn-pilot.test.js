import { describe, expect, it } from 'vitest'
import {
  JOYN_PILOT_STATIONS,
  joynPilotStationByWaipuId,
  joynPilotStationBySlug,
} from '../src/sources/joyn/joynPilotStations.js'

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

  it('keeps the legacy public-link inventory separate from productive channel-id routing', () => {
    expect(JOYN_PILOT_STATIONS.every((station) => station.linkScope === 'channel-live-page')).toBe(true)
    expect(JOYN_PILOT_STATIONS.every((station) => station.deviceVerification === 'pending')).toBe(true)
  })
})
