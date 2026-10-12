import { readTitleFacets } from './titleFacets.js'
import { getTitleStateKey } from '../library/libraryState.js'
import { getActivePosterRowLimit } from '../profiles/profileExperienceRuntime.js'

export const MAX_PERSONAL_SMART_ROWS = 10
export const PERSONAL_SMART_ROW_LIMIT = 50

export const PERSONAL_SMART_ROW_TYPES = Object.freeze([
  { id: 'cast', label: 'Schauspieler/in', searchLabel: 'Schauspieler/in suchen' },
  { id: 'creator', label: 'Regie / Serienschöpfer', searchLabel: 'Person suchen' },
  { id: 'keyword', label: 'Thema', searchLabel: 'Thema suchen' },
  { id: 'collection', label: 'Filmreihe', searchLabel: 'Filmreihe suchen' },
  { id: 'decade', label: 'Jahrzehnt', searchLabel: 'Jahrzehnt auswählen' },
])

const KNOWN_TYPES = new Set(PERSONAL_SMART_ROW_TYPES.map((type) => type.id))

function finiteNumber(value, fallback = Number.NEGATIVE_INFINITY) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function byCatalogRank(a, b) {
  return finiteNumber(b.popularity) - finiteNumber(a.popularity)
    || finiteNumber(b.voteCount) - finiteNumber(a.voteCount)
    || finiteNumber(b.voteAverage) - finiteNumber(a.voteAverage)
    || finiteNumber(b.year) - finiteNumber(a.year)
    || String(a.title || '').localeCompare(String(b.title || ''), 'de')
}

function normalizeRow(raw, index) {
  if (!raw || typeof raw !== 'object' || !KNOWN_TYPES.has(raw.type)) return null
  const valueId = Number(raw.valueId)
  const valueLabel = String(raw.valueLabel || '').trim().slice(0, 80)
  if (!Number.isInteger(valueId) || valueId <= 0 || !valueLabel) return null

  const fallbackId = `${raw.type}-${valueId}`
  const id = String(raw.id || fallbackId).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
  if (!id) return null

  const requestedTitle = String(raw.title || '').trim()
  return {
    id,
    type: raw.type,
    valueId,
    valueLabel,
    title: (requestedTitle || defaultPersonalSmartRowTitle(raw.type, valueLabel, valueId)).slice(0, 60),
    enabled: raw.enabled !== false,
    order: index,
  }
}

export function normalizePersonalSmartRowSettings(value) {
  const source = Array.isArray(value?.rows) ? value.rows : []
  const seenIds = new Set()
  const seenFilters = new Set()
  const rows = []

  for (const raw of source) {
    const row = normalizeRow(raw, rows.length)
    if (!row) continue
    const filterKey = `${row.type}:${row.valueId}`
    if (seenIds.has(row.id) || seenFilters.has(filterKey)) continue
    seenIds.add(row.id)
    seenFilters.add(filterKey)
    rows.push(row)
    if (rows.length >= MAX_PERSONAL_SMART_ROWS) break
  }

  return { rows: rows.map((row, index) => ({ ...row, order: index })) }
}

export function defaultPersonalSmartRowTitle(type, label, valueId) {
  switch (type) {
    case 'cast': return `Mit ${label}`
    case 'creator': return `Von ${label}`
    case 'keyword': return `Thema: ${label}`
    case 'collection': return label
    case 'decade': return `Die ${Number(valueId)}er`
    default: return label
  }
}

function matchesPersonalSmartRow(item, row) {
  const facets = item?.facets || {}
  switch (row.type) {
    case 'cast': return facets.castPersonIds?.includes(row.valueId)
    case 'creator': return facets.creatorPersonIds?.includes(row.valueId)
    case 'keyword': return facets.keywordIds?.includes(row.valueId)
    case 'collection': return Number(facets.collectionId) === row.valueId
    case 'decade': return Number(facets.decade) === row.valueId
    default: return false
  }
}

export function getPersonalSmartRowMatchCount(titles, row) {
  const unique = new Set()
  for (const item of Array.isArray(titles) ? titles : []) {
    if (item?.id && matchesPersonalSmartRow(item, row)) unique.add(getTitleStateKey(item))
  }
  return unique.size
}

export function buildPersonalSmartRows(titles, settings, limit = getActivePosterRowLimit(), sortItems = null) {
  const normalized = normalizePersonalSmartRowSettings(settings)
  const safeLimit = Math.min(Math.max(0, Number(limit) || 0), getActivePosterRowLimit())
  return normalized.rows
    .filter((row) => row.enabled)
    .map((row) => {
      const unique = new Map()
      for (const item of Array.isArray(titles) ? titles : []) {
        if (item?.id && matchesPersonalSmartRow(item, row) && !unique.has(getTitleStateKey(item))) unique.set(getTitleStateKey(item), item)
      }
      const items = [...unique.values()]
      const ranked = typeof sortItems === 'function' ? sortItems(items, row) : items.sort(byCatalogRank)
      return {
        id: `personal-smart-${row.id}`,
        title: row.title,
        items: ranked.slice(0, safeLimit),
      }
    })
    .filter((row) => row.items.length > 0)
}

function normalizeDirectoryEntry(raw) {
  const id = Number(raw?.id)
  const label = String(raw?.label || raw?.name || '').trim()
  if (!Number.isFinite(id) || !label) return null
  return {
    id,
    label,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : null,
    count: Math.max(0, Number(raw.count) || 0),
    knownFor: Array.isArray(raw.knownFor) ? raw.knownFor.filter(Boolean).slice(0, 2) : [],
  }
}

export function normalizeSmartFilterOptions(value) {
  const source = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(PERSONAL_SMART_ROW_TYPES.map(({ id }) => {
    const seen = new Set()
    const options = []
    for (const raw of Array.isArray(source[id]) ? source[id] : []) {
      const option = normalizeDirectoryEntry(raw)
      if (!option || seen.has(option.id) || option.count < 1) continue
      seen.add(option.id)
      options.push(option)
    }
    return [id, options.sort((a, b) => a.label.localeCompare(b.label, 'de'))]
  }))
}

function facetPeople(rawPeople) {
  const seen = new Set()
  return (Array.isArray(rawPeople) ? rawPeople : [])
    .map((person) => ({
      id: Number(person?.id),
      label: String(person?.name || '').trim(),
      imageUrl: typeof person?.profileUrl === 'string' ? person.profileUrl : null,
    }))
    .filter((person) => Number.isFinite(person.id) && person.label && !seen.has(person.id) && seen.add(person.id))
}

function facetTerms(rawTerms) {
  const seen = new Set()
  return (Array.isArray(rawTerms) ? rawTerms : [])
    .map((term) => ({ id: Number(term?.id), label: String(term?.name || '').trim() }))
    .filter((term) => Number.isFinite(term.id) && term.label && !seen.has(term.id) && seen.add(term.id))
}

export function preparePersonalSmartTitles(titles) {
  return (Array.isArray(titles) ? titles : []).map((item) => ({ ...item, facets: readTitleFacets(item) }))
}

function facetIdsByType(facets = {}) {
  return {
    cast: facets.castPersonIds || [], creator: facets.creatorPersonIds || [], keyword: facets.keywordIds || [],
    collection: facets.collectionId ? [facets.collectionId] : [],
    decade: facets.decade ? [facets.decade] : [],
  }
}

// Reuse the generated directory, adjusting only differences from its public
// title basis. Without a baseline this same function builds a fresh directory.
export function buildPersonalSmartFilterOptions(titles, publicOptions = {}, publicTitles = []) {
  const useBaseline = publicTitles.length > 0
  const directories = Object.fromEntries(PERSONAL_SMART_ROW_TYPES.map(({ id }) => [id,
    new Map((publicOptions[id] || []).map((entry) => [Number(entry.id),
      useBaseline ? entry : { ...entry, count: 0, knownFor: [] },
    ])),
  ]))
  const remaining = new Map(publicTitles.map((item) => [getTitleStateKey(item), item]))
  const seen = new Set()
  function adjust(type, id, delta, title) {
    const current = directories[type].get(id) || { id, label: '', count: 0, knownFor: [] }
    const knownFor = delta > 0
      ? [...new Set([...current.knownFor, title].filter(Boolean))].slice(0, 2)
      : current.knownFor.filter((name) => name !== title)
    directories[type].set(id, { ...current, count: current.count + delta, knownFor })
  }
  for (const item of Array.isArray(titles) ? titles : []) {
    const key = getTitleStateKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const base = remaining.get(key)
    remaining.delete(key)
    const previous = facetIdsByType(base?.facets || (base ? readTitleFacets(base) : {}))
    const facets = item.facets || readTitleFacets(item)
    const next = facetIdsByType(facets)
    let changed = !base
    for (const { id: type } of PERSONAL_SMART_ROW_TYPES) {
      const before = previous[type]
      const after = next[type]
      if (before.length === after.length && before.every((id, index) => id === after[index])) continue
      changed = true
      const beforeIds = new Set(before)
      const afterIds = new Set(after)
      for (const id of beforeIds) if (!afterIds.has(id)) adjust(type, id, -1, base?.title)
      for (const id of afterIds) if (!beforeIds.has(id)) adjust(type, id, 1, item.title)
    }
    if (!changed) continue
    const raw = item.smartFacets || {}
    const values = {
      cast: facetPeople([...(Array.isArray(raw.cast) ? raw.cast : []), ...(Array.isArray(item.cast) ? item.cast : [])]),
      creator: facetPeople(raw.creators), keyword: facetTerms(raw.keywords),
      collection: facetTerms([{ id: facets.collectionId, name: item.collectionName || raw.collection?.name }]),
      decade: facets.decade ? [{ id: facets.decade, label: `${facets.decade}er` }] : [],
    }
    for (const { id: type } of PERSONAL_SMART_ROW_TYPES) {
      for (const value of values[type]) {
        const current = directories[type].get(value.id)
        if (current && !current.label) directories[type].set(value.id, { ...current, ...value })
      }
    }
  }
  for (const base of remaining.values()) {
    for (const [type, ids] of Object.entries(facetIdsByType(base.facets || readTitleFacets(base)))) {
      for (const id of ids) adjust(type, id, -1, base.title)
    }
  }
  return normalizeSmartFilterOptions(Object.fromEntries(Object.entries(directories).map(([type, directory]) => [type,
    [...directory.values()],
  ])))
}

export function finalizePersonalSmartCatalog(titles) {
  const prepared = preparePersonalSmartTitles(titles)
  const smartFilterOptions = buildPersonalSmartFilterOptions(prepared)
  return {
    titles: prepared.map(({ smartFacets: _removed, ...item }) => item),
    smartFilterOptions,
  }
}
