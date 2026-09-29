import { describe, expect, it } from 'vitest'
import { classifyJoynAlgoliaHits } from '../src/sources/joyn/joynAlgoliaClassifier.js'

describe('Joyn Algolia classifier', () => {
  it('accepts an exact movie title and exposes hard metadata', () => {
    expect(classifyJoynAlgoliaHits({ title: 'Arrival' }, [{
      type: 'MOVIE',
      titles: { DE: 'Arrival' },
      productionYear: 2016,
      video: { duration: 6960 },
    }])).toMatchObject({
      type: 'movie',
      reason: 'validated_algolia_search',
      productionYear: 2016,
      runtimeSeconds: 6960,
    })
  })

  it('maps series and episodes to the series family', () => {
    expect(classifyJoynAlgoliaHits({ title: 'Charmed' }, [{
      type: 'SERIES',
      titles: { DE: 'Charmed - Zauberhafte Hexen' },
      productionYear: 1998,
    }])).toMatchObject({
      type: 'series',
      productionYear: null,
    })

    expect(classifyJoynAlgoliaHits({
      title: 'Charmed',
      secondaryTitle: 'Der Fluch',
    }, [{
      type: 'EPISODE',
      titles: { DE: 'Der Fluch' },
      topLevelTitles: { DE: 'Charmed - Zauberhafte Hexen' },
      season: { number: 3 },
      number: 4,
      video: { duration: 2520 },
    }])).toMatchObject({
      type: 'series',
      seasonNumber: 3,
      episodeNumber: 4,
      runtimeSeconds: 2520,
    })
  })

  it('keeps the validated series year when matching episode evidence is also present', () => {
    expect(classifyJoynAlgoliaHits({
      title: 'Navy CIS: Origins',
      secondaryTitle: 'Doc Tango und Ducky',
    }, [
      {
        type: 'SERIES',
        titles: { DE: 'Navy CIS: Origins' },
        productionYear: 2024,
      },
      {
        type: 'EPISODE',
        titles: { DE: 'Doc Tango und Ducky' },
        topLevelTitles: { DE: 'Navy CIS: Origins' },
        productionYear: 2026,
        season: { number: 2 },
        number: 13,
        series: { id: 'd_p7a4dv90u57' },
        video: { duration: 2492 },
      },
    ])).toMatchObject({
      type: 'series',
      reason: 'validated_algolia_search',
      productionYear: 2024,
      episodeProductionYear: 2026,
      seasonNumber: 2,
      episodeNumber: 13,
      seriesId: 'd_p7a4dv90u57',
      runtimeSeconds: 2492,
    })
  })

  it('rejects unrelated search hits and non-title content', () => {
    expect(classifyJoynAlgoliaHits({ title: 'Doctor Who' }, [{
      type: 'MOVIE',
      titles: { DE: 'Kein Mittel gegen Liebe' },
      productionYear: 2013,
    }])).toMatchObject({
      type: null,
      reason: 'algolia_no_validated_hit',
    })

    expect(classifyJoynAlgoliaHits({ title: 'BBC News' }, [{
      type: 'CLIP',
      titles: { DE: 'BBC-Chef tritt zurück' },
    }])).toMatchObject({
      type: null,
      reason: 'algolia_no_validated_hit',
    })
  })

  it('does not choose when validated hits disagree on movie vs series', () => {
    expect(classifyJoynAlgoliaHits({ title: 'Dark' }, [
      { type: 'MOVIE', titles: { DE: 'Dark' } },
      { type: 'SERIES', titles: { DE: 'Dark' } },
    ])).toMatchObject({
      type: null,
      reason: 'algolia_conflicting_types',
    })
  })
  it('preserves localized and original Joyn titles for validated series evidence', () => {
    const result = classifyJoynAlgoliaHits({ title: 'Navy CIS: Origins' }, [{
      type: 'SERIES',
      titles: { DE: 'Navy CIS: Origins', OV: 'NCIS: Origins' },
      topLevelTitles: { DE: 'Navy CIS: Origins', OV: 'NCIS: Origins' },
      productionYear: 2024,
    }])

    expect(result).toMatchObject({
      type: 'series',
      reason: 'validated_algolia_search',
      evidence: [expect.objectContaining({
        titleDe: 'Navy CIS: Origins',
        titleOv: 'NCIS: Origins',
        topLevelTitleDe: 'Navy CIS: Origins',
        topLevelTitleOv: 'NCIS: Origins',
      })],
    })
  })

})
