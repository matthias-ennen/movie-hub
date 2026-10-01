import { describe, expect, it } from 'vitest'
import {
  joynPlaybackRouteForChannel,
  joynPlaybackRouteForStation,
} from '../src/sources/joyn/joynPlaybackRoute.js'

describe('Joyn canonical live playback route', () => {
  it.each([
    ['ONE', 'one-de-hd'],
    ['ProSieben', 'prosieben-de'],
    ['Moviedome Family', 'moviedome-family-hd'],
    ['Tele 5', 'tele5-de'],
  ])('uses the observed Joyn livestream.id for %s', (_name, joynChannelId) => {
    expect(joynPlaybackRouteForChannel(joynChannelId)).toMatchObject({
      providerId: 'joyn',
      mode: 'WEB_LINK',
      scope: 'channel',
      target: `https://www.joyn.de/play/live-tv?channel_id=${joynChannelId}`,
    })
  })

  it('does not reinterpret a brand id as a channel id', () => {
    expect(joynPlaybackRouteForStation('einsfestival', { brandId: '168' })).toBeNull()
  })

  it('keeps the compatibility wrapper safe by requiring an explicit Joyn channel id', () => {
    expect(joynPlaybackRouteForStation('einsfestival', {
      joynChannelId: 'one-de-hd',
    })).toMatchObject({
      target: 'https://www.joyn.de/play/live-tv?channel_id=one-de-hd',
    })
  })

  it('rejects malformed channel ids instead of fabricating a target', () => {
    expect(joynPlaybackRouteForChannel('one de hd')).toBeNull()
    expect(joynPlaybackRouteForChannel('')).toBeNull()
  })
})
