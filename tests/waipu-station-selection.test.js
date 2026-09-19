import { describe, expect, it } from 'vitest'
import {
  WAIPU_STATION_SELECTION_VERSION,
  isWaipuStationEnabled,
  normalizeDisabledWaipuStationIds,
  normalizeStoredWaipuStationSelection,
  normalizeWaipuStationOrder,
  orderWaipuStations,
  moveWaipuStation,
} from '../src/settings/waipuStationSelectionModel.js'

describe('kontoweite TV-Senderauswahl', () => {
  it('treats every station as enabled until it is explicitly disabled', () => {
    expect(isWaipuStationEnabled([], 'zdf')).toBe(true)
    expect(isWaipuStationEnabled(['zdf'], 'zdf')).toBe(false)
    expect(isWaipuStationEnabled(['zdf'], 'new-station')).toBe(true)
  })

  it('stores only safe, unique disabled station ids', () => {
    expect(normalizeDisabledWaipuStationIds(['zdf', 'rtl', 'zdf', '../secret', '', null]))
      .toEqual(['rtl', 'zdf'])
  })

  it('keeps a deliberate empty selection and marks legacy values for migration', () => {
    expect(normalizeStoredWaipuStationSelection([], WAIPU_STATION_SELECTION_VERSION)).toEqual({
      disabledStationIds: [],
      stationOrder: [],
      version: WAIPU_STATION_SELECTION_VERSION,
      needsMigration: false,
    })
    expect(normalizeStoredWaipuStationSelection(['rtl'], null)).toMatchObject({
      disabledStationIds: ['rtl'],
      needsMigration: true,
    })
  })

  it('preserves a safe custom order and appends newly published stations', () => {
    expect(normalizeWaipuStationOrder(['vox', 'ard', 'vox', '../secret']))
      .toEqual(['vox', 'ard'])
    expect(orderWaipuStations([
      { id: 'ard', name: 'Das Erste' },
      { id: 'zdf', name: 'ZDF' },
      { id: 'vox', name: 'VOX' },
    ], ['vox', 'ard']).map(({ id }) => id)).toEqual(['vox', 'ard', 'zdf'])
  })

  it('moves a station by one row and leaves boundary moves unchanged', () => {
    const stations = [{ id: 'ard' }, { id: 'zdf' }, { id: 'rtl' }]
    expect(moveWaipuStation(stations, 'zdf', -1)).toEqual(['zdf', 'ard', 'rtl'])
    expect(moveWaipuStation(stations, 'zdf', 1)).toEqual(['ard', 'rtl', 'zdf'])
    expect(moveWaipuStation(stations, 'ard', -1)).toEqual(['ard', 'zdf', 'rtl'])
  })
})
