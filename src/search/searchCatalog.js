import { getTitleStateKey, hasPersonalTitleState } from '../library/libraryState.js'
import { collectSearchActors } from './searchActors.js'
import { buildSearchIndexEntries, mergeSearchIndexEntries } from './searchIndex.js'
import { validateYoutubeNewFilmFeed } from '../catalog/youtubeCuratedNewFilms.js'
import { validateYoutubeCuratedSearchTitleFeed } from '../catalog/youtubeCuratedSearchTitles.js'

// Newly published YouTube/TMDB movies can arrive after the main catalog or
// search-index generation. Keep the normal TMDB media identity and ensure the
// user's Search view sees them even without a personal TMDB sync.
export function mergeYoutubeCuratedSearchTitles(titles, feed, { now = Date.now() } = {}) {
  const originals = Array.isArray(titles) ? titles : []
  if (!validateYoutubeNewFilmFeed(feed, { now })
    && !validateYoutubeCuratedSearchTitleFeed(feed, { now })) return originals
  const present = new Set(originals.map(getTitleStateKey))
  const additions = []
  for (const entry of feed.entries) {
    const film = entry.film
    const key = getTitleStateKey(film)
    if (!key || present.has(key)) continue
    present.add(key)
    additions.push(film)
  }
  return additions.length ? [...originals, ...additions] : originals
}

export function buildSearchCatalog({
  remoteIndex, metadataTitles = [], personalTitles = [], statesByKey = {},
  actorNames = [], curatedYoutubeFeed = null, curatedYoutubeSearchTitleFeed = null, now = Date.now(),
}) {
  const searchableTitles = mergeYoutubeCuratedSearchTitles(
    mergeYoutubeCuratedSearchTitles(metadataTitles, curatedYoutubeFeed, { now }),
    curatedYoutubeSearchTitleFeed, { now })
  const personalKeys = new Set(personalTitles.map(getTitleStateKey))
  for (const [key, state] of Object.entries(statesByKey)) {
    if (hasPersonalTitleState(state)) personalKeys.add(key)
  }
  const localEntries = buildSearchIndexEntries(searchableTitles)
  // The merge preserves published title fields, unions sources and cast, and
  // resolves aliases by canonical media type + TMDB ID. Scope is set afterwards.
  const entries = mergeSearchIndexEntries(remoteIndex?.entries, localEntries).map((entry) => ({
    ...entry,
    scope: personalKeys.has(getTitleStateKey(entry)) ? 'personal' : 'public',
  }))
  return { entries, actors: collectSearchActors(searchableTitles, [remoteIndex?.actors, actorNames]) }
}
