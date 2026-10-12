import { getTitleStateKey, hasPersonalTitleState } from '../library/libraryState.js'
import { collectSearchActors } from './searchActors.js'
import { buildSearchIndexEntries, mergeSearchIndexEntries } from './searchIndex.js'

export function buildSearchCatalog({ remoteIndex, metadataTitles = [], personalTitles = [], statesByKey = {}, actorNames = [] }) {
  const personalKeys = new Set(personalTitles.map(getTitleStateKey))
  for (const [key, state] of Object.entries(statesByKey)) {
    if (hasPersonalTitleState(state)) personalKeys.add(key)
  }
  const localEntries = buildSearchIndexEntries(metadataTitles)
  // The merge preserves published title fields, unions sources and cast, and
  // resolves aliases by canonical media type + TMDB ID. Scope is set afterwards.
  const entries = mergeSearchIndexEntries(remoteIndex?.entries, localEntries).map((entry) => ({
    ...entry,
    scope: personalKeys.has(getTitleStateKey(entry)) ? 'personal' : 'public',
  }))
  return { entries, actors: collectSearchActors(metadataTitles, [remoteIndex?.actors, actorNames]) }
}
