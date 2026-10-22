/**
 * Provider-neutral YouTube live research source selection.
 *
 * A channel is a discovery unit, not a separate movie catalog or provider.
 * Preserve source IDs on every candidate and match all works by TMDB titleRef.
 */
import { SOURCES } from './youtube-api-smoke.mjs'

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/
export const MAX_RESEARCH_CHANNELS = 4

export function resolveYouTubeResearchSources({
  mode = 'all',
  channelIds = '',
  registry = SOURCES,
} = {}) {
  const registered = Array.isArray(registry) ? registry : []
  const normalizedMode = String(mode ?? 'all').trim().toLowerCase()
  let requested
  if (normalizedMode === 'all') requested = registered
  else if (normalizedMode === 'netzkino') requested = registered.filter(s => s.name === 'Netzkino')
  else if (normalizedMode === 'cinenet') requested = registered.filter(s => s.name === 'CiNENET Deutschland')
  else if (normalizedMode === 'custom') {
    requested = String(channelIds || '').split(',').map(s => s.trim())
      .filter(Boolean).map(channelId => ({ name: channelId, channelId }))
  } else throw new Error('Unsupported YouTube channel selection')
  if (!requested.length || requested.length > MAX_RESEARCH_CHANNELS)
    throw new Error('YouTube research needs 1..4 source channels')
  if (requested.some(s => !CHANNEL_ID.test(s?.channelId || '')))
    throw new Error('Invalid source channel ID')
  const ids = requested.map(s => s.channelId)
  if (new Set(ids).size !== ids.length)
    throw new Error('Duplicate source channel ID')
  return requested.map(s => ({
    name: String(s.name || s.channelId).slice(0,100),
    channelId: s.channelId,
  }))
}
