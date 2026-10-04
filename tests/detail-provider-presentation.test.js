import { describe, expect, it } from 'vitest'
import { buildDetailLiveProviderEntries } from '../src/components/detailProviderPresentation.js'

describe('detail live provider presentation', () => {
  it('keeps a live provider visible even when no exact playback route exists', () => {
    const entries = buildDetailLiveProviderEntries({
      providerIds: ['waipu', 'joyn', 'netzkino'],
      liveProviderIds: ['waipu', 'joyn'],
    }, {
      waipu: { id: 'waipu' },
      joyn: { id: 'joyn' },
      netzkino: { id: 'netzkino' },
    }, {
      waipu: { providerId: 'waipu', target: 'https://app.waipu.tv/example' },
    })

    expect(entries).toEqual([
      { providerId: 'waipu', canLaunch: true },
      { providerId: 'joyn', canLaunch: false },
    ])
  })

  it('still respects the enabled provider set', () => {
    const entries = buildDetailLiveProviderEntries({
      providerIds: ['waipu', 'joyn'],
      liveProviderIds: ['waipu', 'joyn'],
    }, {
      joyn: { id: 'joyn' },
    }, {
      waipu: { providerId: 'waipu', target: 'https://app.waipu.tv/example' },
      joyn: { providerId: 'joyn', target: 'https://www.joyn.de/example' },
    })

    expect(entries).toEqual([
      { providerId: 'joyn', canLaunch: true },
    ])
  })
})
