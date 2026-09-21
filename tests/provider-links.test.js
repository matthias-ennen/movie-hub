import { describe, expect, it } from 'vitest'
import {
  getProviderDestination,
  getWaipuEpgDestination,
  selectWaipuAiring,
} from '../src/data/catalog.js'

describe('provider destinations', () => {
  it('builds public provider destinations from the selected title', () => {
    expect(getProviderDestination('netflix', 'Dune: Part Two'))
      .toBe('https://www.netflix.com/search?q=Dune%3A%20Part%20Two')
    expect(getProviderDestination('prime', 'Dune: Part Two'))
      .toBe('https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Dune%3A%20Part%20Two')
    expect(getProviderDestination('youtube', 'Dune: Part Two'))
      .toBe('https://www.youtube.com/results?search_query=Dune%3A%20Part%20Two')
  })

  it('uses stable provider entry pages where no title search is required', () => {
    expect(getProviderDestination('disney', 'Shōgun')).toBe('https://www.disneyplus.com/de-de')
    expect(getProviderDestination('waipu', 'Machete Kills')).toBe('https://app.waipu.tv/waiputhek')
    expect(getProviderDestination('waipu', 'Live TV', { waipuMode: 'live' }))
      .toBe('https://www.waipu.tv/fernsehen/')
  })

  it('builds the verified Waipu EPG link from a currently running airing', () => {
    const waipuLive = {
      airings: [
        {
          stationId: 'zdfneo',
          programId: 'future-program',
          startTime: '2026-09-22T20:15:00.000Z',
          stopTime: '2026-09-22T22:00:00.000Z',
        },
        {
          stationId: 'kinowelt',
          programId: '7c5d8267-439f-5e0f-8fb7-e44349f60746',
          startTime: '2026-09-21T10:40:00.000Z',
          stopTime: '2026-09-21T12:40:00.000Z',
        },
      ],
    }

    expect(getProviderDestination('waipu', 'Gefährliche Brandung', {
      waipuMode: 'live',
      waipuLive,
      now: Date.parse('2026-09-21T11:30:00.000Z'),
    })).toBe('https://app.waipu.tv/epgdetails/kinowelt/7c5d8267-439f-5e0f-8fb7-e44349f60746')
  })

  it('uses the next future Waipu airing when none is currently running', () => {
    const waipuLive = {
      airings: [
        {
          stationId: 'sat1',
          programId: 'later-program',
          startTime: '2026-10-04T20:50:00.000Z',
          stopTime: '2026-10-04T23:40:00.000Z',
        },
        {
          stationId: 'zdfneo',
          programId: 'next-program',
          startTime: '2026-09-24T12:00:00.000Z',
          stopTime: '2026-09-24T12:50:00.000Z',
        },
      ],
    }

    expect(getWaipuEpgDestination(waipuLive, {
      now: Date.parse('2026-09-21T12:00:00.000Z'),
    })).toBe('https://app.waipu.tv/epgdetails/zdfneo/next-program')
  })

  it('resolves simultaneous Waipu airings deterministically and preserves source casing', () => {
    const now = Date.parse('2026-09-21T11:30:00.000Z')
    const waipuLive = {
      airings: [
        {
          stationId: 'tntserie',
          programId: 'program-b',
          startTime: '2026-09-21T11:20:00.000Z',
          stopTime: '2026-09-21T12:10:00.000Z',
        },
        {
          stationId: 'KINOWELT',
          programId: 'program-a',
          startTime: '2026-09-21T11:20:00.000Z',
          stopTime: '2026-09-21T12:10:00.000Z',
        },
      ],
    }

    expect(selectWaipuAiring(waipuLive, { now })).toMatchObject({
      stationId: 'KINOWELT',
      programId: 'program-a',
    })
    expect(getWaipuEpgDestination(waipuLive, { now }))
      .toBe('https://app.waipu.tv/epgdetails/KINOWELT/program-a')
  })

  it('encodes Waipu source ids as individual URL path segments', () => {
    expect(getWaipuEpgDestination({
      nextAiring: {
        stationId: 'sender/test',
        programId: 'program id',
        startTime: '2026-09-24T12:00:00.000Z',
        stopTime: '2026-09-24T12:50:00.000Z',
      },
    }, {
      now: Date.parse('2026-09-21T12:00:00.000Z'),
    })).toBe('https://app.waipu.tv/epgdetails/sender%2Ftest/program%20id')
  })

  it('falls back to general Waipu live TV when the source ids are incomplete', () => {
    expect(getProviderDestination('waipu', 'Live TV', {
      waipuMode: 'live',
      waipuLive: {
        nextAiring: {
          stationId: 'zdfneo',
          programId: null,
          startTime: '2026-09-24T12:00:00.000Z',
          stopTime: '2026-09-24T12:50:00.000Z',
        },
      },
      now: Date.parse('2026-09-21T12:00:00.000Z'),
    })).toBe('https://www.waipu.tv/fernsehen/')
  })

  it('does not create a destination for unknown providers', () => {
    expect(getProviderDestination('unknown', 'Dune: Part Two')).toBeNull()
  })

  it('keeps every supported fallback on its expected HTTPS provider domain', () => {
    const expectedHosts = {
      netflix: 'www.netflix.com',
      prime: 'www.primevideo.com',
      disney: 'www.disneyplus.com',
      youtube: 'www.youtube.com',
      waipu: 'app.waipu.tv',
    }

    for (const [providerId, expectedHost] of Object.entries(expectedHosts)) {
      const destination = getProviderDestination(providerId, 'Dune: Part Two')
      const parsed = new URL(destination)
      expect(parsed.protocol).toBe('https:')
      expect(parsed.hostname).toBe(expectedHost)
    }
  })
})
