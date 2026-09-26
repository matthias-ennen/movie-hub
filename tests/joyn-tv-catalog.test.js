import { describe, expect, it } from 'vitest'
import {
  JOYN_LIVE_CATALOG_VERSION,
  normalizeJoynLiveStationCatalog,
} from '../src/joyn/joynTvCatalog.js'

describe('Joyn live station catalog', () => {
  it('normalizes a complete published Joyn station catalog', () => {
    expect(normalizeJoynLiveStationCatalog({
      schemaVersion: JOYN_LIVE_CATALOG_VERSION,
      kind: 'joyn-live-index',
      status: 'complete',
      generatedAt: '2026-09-26T15:00:00.000Z',
      days: [{ key: '2026-09-26', count: 100 }],
    }, {
      schemaVersion: JOYN_LIVE_CATALOG_VERSION,
      kind: 'joyn-live-stations',
      stations: [{
        id: 'prosieben-de',
        name: 'ProSieben',
        canonicalId: 'pro7',
        logoUrl: 'https://example.invalid/pro7.png',
      }],
    })).toMatchObject({
      status: 'ready',
      stations: [{
        id: 'prosieben-de',
        name: 'ProSieben',
        canonicalId: 'pro7',
      }],
    })
  })

  it('rejects partial or incompatible publication', () => {
    expect(normalizeJoynLiveStationCatalog({
      schemaVersion: 1,
      kind: 'joyn-live-index',
      status: 'partial',
    }, {
      schemaVersion: 1,
      kind: 'joyn-live-stations',
      stations: [{ id: 'prosieben-de', name: 'ProSieben' }],
    })).toBeNull()
  })
})
