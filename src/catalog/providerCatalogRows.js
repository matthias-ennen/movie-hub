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
    .filter((item) => item?.type === mediaType && !membershipIds.has(item.id))

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
