import { describe, expect, it } from 'vitest'
import { enrichJoynCandidatesWithV2, normalizeJoynEpgV2 } from '../src/sources/joyn/joynEpgV2Enrichment.js'

describe('Joyn EPG V2 enrichment', () => {
  const data = {
    epgEventsV2: {
      items: [{
        livestream: { id: 'daserste-de-hd' },
        program: {
          __typename: 'EpgEntryV2',
          id: 'program-2016',
          title: 'Das singende, klingende Bäumchen',
          secondaryTitle: '',
          description: 'Der König hält die schöne Prinzessin vom wahren Leben fern.',
          images: [{ type: 'LIVE_STILL', url: 'https://img.joyn.de/tree.jpg' }],
          ageRating: { minAge: null },
        },
      }],
    },
  }

  it('indexes V2 metadata by the stable Joyn program id', () => {
    expect(normalizeJoynEpgV2(data).get('program-2016')).toMatchObject({
      joynProgramId: 'program-2016',
      joynChannelId: 'daserste-de-hd',
      title: 'Das singende, klingende Bäumchen',
      description: 'Der König hält die schöne Prinzessin vom wahren Leben fern.',
    })
  })

  it('enriches the existing Joyn candidate without changing its identity', () => {
    const result = enrichJoynCandidatesWithV2([{
      joynProgramId: 'program-2016',
      joynChannelId: 'daserste-de-hd',
      title: 'Das singende, klingende Bäumchen',
      startTime: '2026-09-27T08:03:00.000Z',
      endTime: '2026-09-27T09:00:00.000Z',
      programImageUrl: null,
    }], data)

    expect(result.entries[0]).toMatchObject({
      joynProgramId: 'program-2016',
      title: 'Das singende, klingende Bäumchen',
      description: 'Der König hält die schöne Prinzessin vom wahren Leben fern.',
      programImageUrl: 'https://img.joyn.de/tree.jpg',
      epgV2Enriched: true,
    })
    expect(result.metrics).toEqual({
      v2Programs: 1,
      enriched: 1,
      descriptions: 1,
      images: 1,
    })
  })
})
