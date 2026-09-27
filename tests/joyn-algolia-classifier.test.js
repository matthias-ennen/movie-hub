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
})
