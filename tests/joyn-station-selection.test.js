import { describe, expect, it } from 'vitest'
import {
  JOYN_STATION_SELECTION_VERSION,
  isJoynStationEnabled,
  normalizeDisabledJoynStationIds,
  normalizeStoredJoynStationSelection,
  normalizeJoynStationOrder,
  orderJoynStations,
  moveJoynStation,
} from '../src/settings/joynStationSelectionModel.js'

describe('kontoweite Joyn-Senderauswahl', () => {
  it('treats every station as enabled until it is explicitly disabled', () => {
    expect(isJoynStationEnabled([], 'zdf-de-hd')).toBe(true)
    expect(isJoynStationEnabled(['zdf-de-hd'], 'zdf-de-hd')).toBe(false)
    expect(isJoynStationEnabled(['zdf-de-hd'], 'new-station')).toBe(true)
  })

  it('stores only safe, unique disabled station ids', () => {
    expect(normalizeDisabledJoynStationIds(['zdf-de-hd', 'prosieben-de', 'zdf-de-hd', '../secret', '', null]))
      .toEqual(['prosieben-de', 'zdf-de-hd'])
  })

  it('keeps a deliberate empty selection and marks legacy values for migration', () => {
    expect(normalizeStoredJoynStationSelection([], JOYN_STATION_SELECTION_VERSION)).toEqual({
      disabledStationIds: [],
      stationOrder: [],
      version: JOYN_STATION_SELECTION_VERSION,
      needsMigration: false,
    })
    expect(normalizeStoredJoynStationSelection(['prosieben-de'], null)).toMatchObject({
      disabledStationIds: ['prosieben-de'],
      needsMigration: true,
    })
  })

  it('preserves a safe custom order and appends newly published stations', () => {
    expect(normalizeJoynStationOrder(['prosieben-de', 'zdf-de-hd', 'prosieben-de', '../secret']))
      .toEqual(['prosieben-de', 'zdf-de-hd'])
    expect(orderJoynStations([
      { id: 'zdf-de-hd', name: 'ZDF' },
      { id: 'sat1-de', name: 'SAT.1' },
      { id: 'prosieben-de', name: 'ProSieben' },
    ], ['prosieben-de', 'zdf-de-hd']).map(({ id }) => id))
      .toEqual(['prosieben-de', 'zdf-de-hd', 'sat1-de'])
  })

  it('moves a station by one row and leaves boundary moves unchanged', () => {
    const stations = [{ id: 'zdf-de-hd' }, { id: 'sat1-de' }, { id: 'prosieben-de' }]
    expect(moveJoynStation(stations, 'sat1-de', -1)).toEqual(['sat1-de', 'zdf-de-hd', 'prosieben-de'])
    expect(moveJoynStation(stations, 'sat1-de', 1)).toEqual(['zdf-de-hd', 'prosieben-de', 'sat1-de'])
    expect(moveJoynStation(stations, 'zdf-de-hd', -1)).toEqual(['zdf-de-hd', 'sat1-de', 'prosieben-de'])
  })
})
