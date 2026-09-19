import { describe, expect, it } from 'vitest'
import {
  WAIPU_STATION_SELECTION_VERSION,
  isWaipuStationEnabled,
  normalizeDisabledWaipuStationIds,
  normalizeStoredWaipuStationSelection,
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
      version: WAIPU_STATION_SELECTION_VERSION,
      needsMigration: false,
    })
    expect(normalizeStoredWaipuStationSelection(['rtl'], null)).toMatchObject({
      disabledStationIds: ['rtl'],
      needsMigration: true,
    })
  })
})
