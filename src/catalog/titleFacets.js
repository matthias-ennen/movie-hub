// Shared, network-free facet contract. Display cast limits must never limit filters.
const list = (value) => Array.isArray(value) ? value : []
const positiveId = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null
const ids = (...values) => [...new Set(values.flatMap(list).map(positiveId).filter(Boolean))]

export function readTitleFacets(item) {
  const facets = item?.facets || {}
  const raw = item?.smartFacets || {}
  const year = positiveId(item?.year) || positiveId(String(item?.releaseDate || '').slice(0, 4))
  const collectionChecked = item?.collectionChecked === true
  return {
    castPersonIds: ids(facets.castPersonIds, list(raw.cast).map((person) => person?.id), list(item?.cast).map((person) => person?.id)),
    creatorPersonIds: ids(facets.creatorPersonIds, list(raw.creators).map((person) => person?.id)),
    keywordIds: ids(facets.keywordIds, list(raw.keywords).map((term) => term?.id)),
    collectionId: item?.type === 'series' || item?.mediaType === 'tv' ? null
      : collectionChecked ? positiveId(item?.collectionId)
        : positiveId(item?.collectionId ?? facets.collectionId ?? raw.collection?.id),
    decade: year ? Math.floor(year / 10) * 10 : positiveId(facets.decade),
  }
}

function compactTerms(values) {
  const byId = new Map()
  for (const value of list(values)) {
    const id = positiveId(value?.id)
    const name = String(value?.name || '').trim().slice(0, 160)
    if (id && name && !byId.has(id)) byId.set(id, { id, name })
  }
  return [...byId.values()]
}

// Preserve completeness: missing lists stay missing, rather than becoming an
// apparently checked empty cast/creator/keyword list in a legacy snapshot.
export function copyTitleFacetMetadata(item) {
  const raw = item?.smartFacets || {}
  const smartFacets = raw.version === 1 ? { version: 1 } : {}
  for (const key of ['cast', 'creators', 'keywords']) {
    const values = raw[key] ?? (key === 'cast' ? item?.cast : undefined)
    if (Array.isArray(values)) smartFacets[key] = compactTerms(values)
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'collection')) smartFacets.collection = compactTerms([raw.collection])[0] || null
  return {
    facets: item?.facets ? readTitleFacets(item) : null,
    smartFacets: Object.keys(smartFacets).length ? smartFacets : null,
  }
}

export function hasTitleFacetMetadata(item) {
  return ['castPersonIds', 'creatorPersonIds', 'keywordIds'].every((key) => Array.isArray(item?.facets?.[key]))
    || (item?.smartFacets?.version === 1
      && ['cast', 'creators', 'keywords'].every((key) => Array.isArray(item.smartFacets[key])))
}
