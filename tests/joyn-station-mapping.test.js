import { describe, expect, it } from 'vitest'
import {
  buildJoynStationMapping,
  mapJoynStationToCanonical,
} from '../scripts/joyn-station-mapping.mjs'

describe('Joyn station mapping', () => {
  it('maps exact normalized station names to canonical MovieHub ids', () => {
    expect(mapJoynStationToCanonical({ id: 'prosieben-de', title: 'ProSieben' }))
      .toMatchObject({
        status: 'matched',
        canonicalId: 'pro7',
        method: 'normalized-name',
      })
    expect(mapJoynStationToCanonical({ id: 'wdr-koeln-de-hd', title: 'WDR Köln' }))
      .toMatchObject({
        status: 'matched',
        canonicalId: 'wdr_koeln',
      })
  })

  it('uses only reviewed aliases for known naming differences', () => {
    expect(mapJoynStationToCanonical({ id: 'zdfinfo-de-hd', title: 'ZDF info' }))
      .toMatchObject({
        status: 'matched',
        canonicalId: 'zdfinfo',
        method: 'reviewed-alias',
      })
  })

  it('does not fuzzy-guess an unknown Joyn station', () => {
    expect(mapJoynStationToCanonical({ id: 'unknown', title: 'Completely Different TV' }))
      .toMatchObject({
        status: 'unmatched',
        canonicalId: null,
      })
  })

  it('reports mapping coverage deterministically', () => {
    const report = buildJoynStationMapping([
      { id: 'prosieben-de', title: 'ProSieben' },
      { id: 'zdfinfo-de-hd', title: 'ZDF info' },
      { id: 'unknown', title: 'Completely Different TV' },
    ])
    expect(report.counts).toMatchObject({
      joynStreams: 3,
      matched: 2,
      reviewedAlias: 1,
      unmatched: 1,
    })
  })
})
