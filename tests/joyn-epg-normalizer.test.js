import { describe, expect, it } from 'vitest'
import { inspectSourceSchema } from '../src/sources/fieldDiscovery.js'
import { JOYN_EPG_UPSTREAM_FIELD_POLICY } from '../src/sources/policies/joynUpstreamFieldPolicy.js'
import { normalizeJoynLiveChannelsAndEpg } from '../src/sources/joyn/joynEpgNormalizer.js'

const fixture = {
  liveStreams: [{
    id: 'channel-1',
    title: 'ProSieben',
    type: 'LIVE',
    quality: 'HD',
    logo: { url: 'https://img.joyn.de/logo.webp' },
    brand: { brandCode: 'brand-1', title: 'ProSieben', livestream: { logo: { url: 'https://img.joyn.de/brand-logo.webp' } } },
    epgEvents: [{
      startDate: 1790446500,
      endDate: 1790452800,
      program: {
        id: 'program-1',
        title: 'Beispielfilm',
        secondaryTitle: '',
        startDate: 1790446500,
        endDate: 1790452800,
        __typename: 'MovieProgram',
      },
    }],
  }],
}

describe('Joyn EPG upstream', () => {
  it('normalizes Joyn-owned channel/program/time data without TMDB assumptions', () => {
    expect(normalizeJoynLiveChannelsAndEpg(fixture)).toEqual([{
      source: 'joyn-epg',
      joynChannelId: 'channel-1',
      channelTitle: 'ProSieben',
      brandId: 'brand-1',
      brandTitle: 'ProSieben',
      channelLogoUrl: 'https://img.joyn.de/brand-logo.webp',
      streamType: 'LIVE',
      quality: 'HD',
      joynProgramId: 'program-1',
      title: 'Beispielfilm',
      secondaryTitle: null,
      startTime: '2026-09-26T18:15:00.000Z',
      endTime: '2026-09-26T20:00:00.000Z',
      programType: 'MovieProgram',
      programImageUrl: null,
    }])
  })

  it('classifies the currently observed Joyn EPG schema without review fields', () => {
    const report = inspectSourceSchema(fixture, {
      sourceId: 'joyn-epg',
      policy: JOYN_EPG_UPSTREAM_FIELD_POLICY,
    })
    expect(report.summary.breaking).toBe(0)
    expect(report.summary.review).toBe(0)
  })

  it('drops malformed events and deterministically removes duplicates', () => {
    const duplicated = structuredClone(fixture)
    duplicated.liveStreams[0].epgEvents.push(
      structuredClone(duplicated.liveStreams[0].epgEvents[0]),
      {
        startDate: 'invalid',
        endDate: 'invalid',
        program: { id: 'broken', title: 'Broken' },
      },
    )
    expect(normalizeJoynLiveChannelsAndEpg(duplicated)).toHaveLength(1)
  })
})
