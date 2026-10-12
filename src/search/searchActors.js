import { readTitleFacets } from '../catalog/titleFacets.js'
import { getTitleStateKey } from '../library/libraryState.js'

const list = (value) => Array.isArray(value) ? value : []

export function normalizeSearchText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de').trim().replace(/\s+/g, ' ')
}

export function collectSearchActors(titles, directories = []) {
  const actors = new Map()
  const add = (person) => {
    const id = Number(person?.id)
    const name = String(person?.name || person?.label || '').trim()
    if (Number.isInteger(id) && id > 0 && name && !actors.has(id)) actors.set(id, { id, name })
  }
  for (const directory of directories) list(directory).forEach(add)
  for (const title of list(titles)) {
    list(title?.smartFacets?.cast).forEach(add)
    list(title?.cast).forEach(add)
  }
  return [...actors.values()]
}

// Build-time projection only: no detail payloads or repeated actor names per title.
export function projectSearchActors(index, titles, actorNames = []) {
  const titlesByKey = new Map(list(titles).map((title) => [getTitleStateKey(title), title]))
  const usedIds = new Set()
  const entries = list(index?.entries).map((entry) => {
    const title = titlesByKey.get(getTitleStateKey(entry))
    const hasCast = title && [title.facets?.castPersonIds, title.smartFacets?.cast, title.cast].some(Array.isArray)
    const castPersonIds = hasCast ? readTitleFacets(title).castPersonIds : list(entry.castPersonIds)
    castPersonIds.forEach((id) => usedIds.add(id))
    return { ...entry, castPersonIds }
  })
  const currentActors = collectSearchActors(titles, [actorNames])
  const actors = collectSearchActors([], [currentActors, index?.actors]).filter((actor) => usedIds.has(actor.id))
  const namedIds = new Set(actors.map((actor) => actor.id))
  return {
    ...index,
    entries,
    actors,
    actorCoverage: { titles: entries.filter((entry) => entry.castPersonIds.some((id) => namedIds.has(id))).length, total: entries.length },
  }
}

// Created once when metadata changes, never once per keystroke or live-clock tick.
export function buildActorSearchIndex(entries, actors) {
  const titlesByActor = new Map()
  for (const entry of list(entries)) {
    for (const id of list(entry.castPersonIds)) {
      if (!titlesByActor.has(id)) titlesByActor.set(id, [])
      titlesByActor.get(id).push(entry.id)
    }
  }
  return list(actors).flatMap((actor) => {
    const titleIds = titlesByActor.get(Number(actor.id))
    return titleIds ? [{ name: normalizeSearchText(actor.name), titleIds }] : []
  })
}

export function findActorTitleIds(actorIndex, normalizedQuery) {
  const matches = new Set()
  for (const actor of list(actorIndex)) {
    if (actor.name.includes(normalizedQuery)) {
      for (const id of actor.titleIds) matches.add(id)
    }
  }
  return matches
}
