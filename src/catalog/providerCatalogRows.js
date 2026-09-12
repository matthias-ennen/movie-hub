export function buildProviderBrowseRows(providerCatalogs, titles, mediaType) {
  const catalogs = providerCatalogs && typeof providerCatalogs === 'object'
    ? Object.values(providerCatalogs)
    : []
  const byId = new Map((Array.isArray(titles) ? titles : []).map((title) => [title.id, title]))
  const membershipIds = new Set()

  const providerRows = catalogs
    .map((catalog) => {
      const ids = mediaType === 'series' ? catalog.seriesIds : catalog.movieIds
      const title = mediaType === 'series' ? catalog.seriesTitle : catalog.movieTitle
      const items = (Array.isArray(ids) ? ids : [])
        .map((id) => byId.get(id))
        .filter((item) => item?.type === mediaType)

      for (const item of items) membershipIds.add(item.id)
      if (!items.length) return null

      return {
        id: `provider-${catalog.id}-${mediaType}`,
        providerId: catalog.id,
        title: title || `${catalog.label || catalog.id} · ${mediaType === 'series' ? 'Serien' : 'Filme'}`,
        items,
      }
    })
    .filter(Boolean)

  const remaining = (Array.isArray(titles) ? titles : [])
    .filter((item) => item?.type === mediaType && !item.movieHubCatalog && !membershipIds.has(item.id))

  if (remaining.length) {
    providerRows.push({
      id: `provider-other-${mediaType}`,
      providerId: null,
      title: mediaType === 'series' ? 'Weitere Serien in Movie Hub' : 'Weitere Filme in Movie Hub',
      items: remaining,
    })
  }

  return providerRows
}

export function buildProviderHomeRows(providerCatalogs, titles, limit = 20) {
  const catalogs = providerCatalogs && typeof providerCatalogs === 'object'
    ? Object.values(providerCatalogs)
    : []
  const byId = new Map((Array.isArray(titles) ? titles : []).map((title) => [title.id, title]))

  return catalogs.map((catalog) => {
    const ids = [...(Array.isArray(catalog.movieIds) ? catalog.movieIds : []), ...(Array.isArray(catalog.seriesIds) ? catalog.seriesIds : [])]
    const seen = new Set()
    const items = ids
      .map((id) => byId.get(id))
      .filter((item) => item?.id && !seen.has(item.id) && seen.add(item.id))
    if (!items.length) return null
    return {
      id: `provider-${catalog.id}-home`,
      providerId: catalog.id,
      title: catalog.homeTitle || `${catalog.label || catalog.id} entdecken`,
      displayLimit: Math.max(0, Number(limit) || 0),
      items,
    }
  }).filter(Boolean)
}
