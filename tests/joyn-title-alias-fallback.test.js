import { describe, expect, it } from 'vitest'
import { trustedJoynTitleAliases } from '../scripts/joyn-adapter-diagnostic.mjs'
import { matchJoynProgram } from '../scripts/joyn-tmdb-matcher.mjs'

describe('Joyn bounded typed title aliases', () => {
  it('uses a validated Joyn series alias to reach a unique TMDB series match', async () => {
    const aliases = trustedJoynTitleAliases({
      type: 'series',
      algolia: {
        type: 'series',
        reason: 'validated_algolia_search',
        evidence: [{
          type: 'series',
          joynType: 'SERIES',
          title: 'Navy CIS: Origins - Staffel 1',
          topLevelTitle: 'NCIS: Origins',
        }],
      },
    }, 'Navy CIS: Origins')

    expect(aliases).toContain('NCIS: Origins')

    const result = await matchJoynProgram({
      title: 'Navy CIS: Origins',
      aliases,
      type: 'series',
      productionYear: 2024,
    }, {
      localCandidates: [],
      searchTmdb: async (input) => (
        Array.isArray(input.aliases) && input.aliases.includes('NCIS: Origins')
          ? [{ type: 'series', tmdbId: 243989, title: 'NCIS: Origins', year: 2024 }]
          : []
      ),
    })

    expect(result).toMatchObject({
      status: 'matched',
      match: {
        tmdbId: 243989,
        type: 'series',
        signals: [expect.objectContaining({
          kind: 'joyn_title_alias',
          alias: 'NCIS: Origins',
        })],
      },
    })
  })

  it('drops episode titles while keeping the validated series top-level title', () => {
    const aliases = trustedJoynTitleAliases({
      type: 'series',
      algoliaEpisode: {
        type: 'series',
        reason: 'validated_algolia_search',
        evidence: [
          {
            type: 'series',
            joynType: 'EPISODE',
            title: 'Doc Tango und Ducky',
            topLevelTitle: 'NCIS: Origins',
          },
          {
            type: 'series',
            joynType: 'EPISODE',
            title: 'Las Vegas',
            topLevelTitle: 'NCIS: Origins',
          },
          {
            type: 'series',
            joynType: 'EPISODE',
            title: 'Fremde Federn',
            topLevelTitle: 'NCIS: Origins',
          },
        ],
      },
    }, 'Navy CIS: Origins')

    expect(aliases).toEqual(['NCIS: Origins'])
    expect(aliases).not.toContain('Doc Tango und Ducky')
    expect(aliases).not.toContain('Las Vegas')
    expect(aliases).not.toContain('Fremde Federn')
  })

  it('does not expose alias fallback for an untyped Joyn programme', () => {
    expect(trustedJoynTitleAliases({
      type: null,
      algolia: {
        type: 'series',
        reason: 'validated_algolia_search',
        evidence: [{
          type: 'series',
          topLevelTitle: 'Example Series',
        }],
      },
    }, 'Regionalmagazin')).toEqual([])
  })

  it('ignores unvalidated or cross-type Algolia aliases', () => {
    expect(trustedJoynTitleAliases({
      type: 'series',
      algolia: {
        type: 'movie',
        reason: 'validated_algolia_search',
        evidence: [{ type: 'movie', title: 'Wrong Movie' }],
      },
      algoliaBase: {
        type: 'series',
        reason: 'algolia_no_validated_hit',
        evidence: [{ type: 'series', topLevelTitle: 'Untrusted Series' }],
      },
    }, 'Example')).toEqual([])
  })
})
