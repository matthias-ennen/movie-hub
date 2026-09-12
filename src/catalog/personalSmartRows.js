export const MAX_PERSONAL_SMART_ROWS = 10
export const PERSONAL_SMART_ROW_LIMIT = 40

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
    if (item?.id && matchesPersonalSmartRow(item, row)) unique.add(item.id)
  }
  return unique.size
}

export function buildPersonalSmartRows(titles, settings, limit = PERSONAL_SMART_ROW_LIMIT) {
  const normalized = normalizePersonalSmartRowSettings(settings)
  return normalized.rows
    .filter((row) => row.enabled)
    .map((row) => {
      const unique = new Map()
      for (const item of Array.isArray(titles) ? titles : []) {
        if (item?.id && matchesPersonalSmartRow(item, row) && !unique.has(item.id)) unique.set(item.id, item)
      }
      return {
        id: `personal-smart-${row.id}`,
        title: row.title,
        items: [...unique.values()].sort(byCatalogRank).slice(0, Math.max(0, Number(limit) || 0)),
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

function addDirectoryValue(directory, value, title) {
  if (!value) return
  const current = directory.get(value.id) || { ...value, count: 0, knownFor: [] }
  current.count += 1
  if (title && current.knownFor.length < 2 && !current.knownFor.includes(title)) current.knownFor.push(title)
  if (!current.imageUrl && value.imageUrl) current.imageUrl = value.imageUrl
  directory.set(value.id, current)
}

export function finalizePersonalSmartCatalog(titles) {
  const directories = {
    cast: new Map(),
    creator: new Map(),
    keyword: new Map(),
    collection: new Map(),
    decade: new Map(),
  }

  const finalizedTitles = (Array.isArray(titles) ? titles : []).map((item) => {
    const raw = item?.smartFacets || {}
    const cast = facetPeople(raw.cast)
    const creators = facetPeople(raw.creators)
    const keywords = facetTerms(raw.keywords)
    const collection = facetTerms(raw.collection ? [raw.collection] : [])[0] || null
    const year = Number(item?.year)
    const decade = Number.isFinite(year) ? Math.floor(year / 10) * 10 : null

    cast.forEach((value) => addDirectoryValue(directories.cast, value, item.title))
    creators.forEach((value) => addDirectoryValue(directories.creator, value, item.title))
    keywords.forEach((value) => addDirectoryValue(directories.keyword, value, item.title))
    addDirectoryValue(directories.collection, collection, item.title)
    if (decade !== null) addDirectoryValue(directories.decade, { id: decade, label: `${decade}er` }, item.title)

    const { smartFacets: _removed, ...publicItem } = item
    return {
      ...publicItem,
      facets: {
        castPersonIds: cast.map((value) => value.id),
        creatorPersonIds: creators.map((value) => value.id),
        keywordIds: keywords.map((value) => value.id),
        collectionId: collection?.id ?? null,
        decade,
      },
    }
  })

  return {
    titles: finalizedTitles,
    smartFilterOptions: normalizeSmartFilterOptions(Object.fromEntries(
      Object.entries(directories).map(([key, directory]) => [key, [...directory.values()]]),
    )),
  }
}
