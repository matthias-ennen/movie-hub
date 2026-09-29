import { describe, expect, it } from 'vitest'
import { classifyJoynAlgoliaHits } from '../src/sources/joyn/joynAlgoliaClassifier.js'

describe('Joyn Algolia path preservation', () => {
  it('preserves validated series and episode paths for bounded detail resolution', () => {
    const result = classifyJoynAlgoliaHits({
      title: 'Navy CIS: Origins',
      secondaryTitle: 'Doc Tango und Ducky',
    }, [{
      type: 'EPISODE',
      objectID: 'episode-1',
      titles: { DE: 'Doc Tango und Ducky' },
      topLevelTitles: { DE: 'Navy CIS: Origins' },
      path: '/serien/navy-cis-origins/folgen/doc-tango-und-ducky',
      fullPath: '/serien/navy-cis-origins/folgen/doc-tango-und-ducky',
      topLevelPath: '/serien/navy-cis-origins',
      series: {
        id: 'd_p7a4dv90u57',
        path: '/serien/navy-cis-origins',
      },
      season: { number: 2 },
      number: 13,
    }])

    expect(result).toMatchObject({
      type: 'series',
      reason: 'validated_algolia_search',
      evidence: [expect.objectContaining({
        joynType: 'EPISODE',
        path: '/serien/navy-cis-origins/folgen/doc-tango-und-ducky',
        fullPath: '/serien/navy-cis-origins/folgen/doc-tango-und-ducky',
        seriesPath: '/serien/navy-cis-origins',
        topLevelPath: '/serien/navy-cis-origins',
      })],
    })
  })
})
