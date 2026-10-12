import { ORDERED_PROVIDERS, compareProviderIds } from '../providers/providerOrder.js'
import { getActivePosterRowLimit } from '../profiles/profileExperienceRuntime.js'

export function buildProviderBrowseRows(providerCatalogs, titles, mediaType) {
  const catalogs = providerCatalogs && typeof providerCatalogs === 'object'
    ? Object.values(providerCatalogs).sort((a, b) => compareProviderIds(a.id, b.id))
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

export function buildProviderHomeRows(providerCatalogs, titles, limit = getActivePosterRowLimit()) {
  const catalogs = providerCatalogs && typeof providerCatalogs === 'object'
    ? Object.values(providerCatalogs).sort((a, b) => compareProviderIds(a.id, b.id))
    : []
  const byId = new Map((Array.isArray(titles) ? titles : []).map((title) => [title.id, title]))
  const safeLimit = Math.min(Math.max(0, Number(limit) || 0), getActivePosterRowLimit())

  return catalogs.map((catalog) => {
    const ids = [...(Array.isArray(catalog.homeIds) ? catalog.homeIds : []), ...(Array.isArray(catalog.movieIds) ? catalog.movieIds : []), ...(Array.isArray(catalog.seriesIds) ? catalog.seriesIds : [])]
    const seen = new Set()
    const items = ids
      .map((id) => byId.get(id))
      .filter((item) => item?.id && !seen.has(item.id) && seen.add(item.id))
    if (!items.length) return null
    return {
      id: `provider-${catalog.id}-home`,
      providerId: catalog.id,
      title: catalog.homeTitle || `${catalog.label || catalog.id} entdecken`,
      preserveOrder: false,
      displayLimit: safeLimit,
      items,
    }
  }).filter(Boolean)
}

// One candidate model shared by Home, browse and Top 10. Live memberships
// augment TMDB catalogs using already loaded title evidence (no I/O).
export function buildProviderCatalogModel(providerCatalogs = {}, titles = [], { now = Date.now(), acceptLiveProvider = () => true } = {}) {
  const byId = new Map(titles.map((title) => [title.id, title]))
  const result = {}
  const memberships = new Map()
  for (const provider of ORDERED_PROVIDERS) {
    if (provider.source === 'moviehub') continue
    const existing = providerCatalogs?.[provider.id]
    if (!existing && !provider.liveTvSource) continue
    const catalog = { ...existing, id: provider.id, label: provider.label,
      homeTitle: existing?.homeTitle || provider.homeTitle,
      movieTitle: existing?.movieTitle || provider.movieTitle,
      seriesTitle: existing?.seriesTitle || provider.seriesTitle,
      movieIds: new Set((existing?.movieIds || []).filter((id) => byId.get(id)?.type === 'movie')),
      seriesIds: new Set((existing?.seriesIds || []).filter((id) => byId.get(id)?.type === 'series')),
    }
    memberships.set(provider.id, catalog)
  }
  for (const title of titles) {
    for (const [providerId, availability] of Object.entries(title.liveAvailability || {})) {
      const catalog = memberships.get(providerId)
      if (!catalog) continue
      const airings = Array.isArray(availability?.airings) ? availability.airings : [availability?.nextAiring]
      if (!airings.some((airing) => Date.parse(airing?.stopTime) > now && acceptLiveProvider(providerId, airing))) continue
      if (title.type === 'movie') catalog.movieIds.add(title.id)
      if (title.type === 'series') catalog.seriesIds.add(title.id)
    }
  }
  for (const [id, catalog] of memberships) {
    const comparePopularity = (left, right) => (
      Number(byId.get(right)?.popularity || 0) - Number(byId.get(left)?.popularity || 0)
      || String(left).localeCompare(String(right))
    )
    const isLive = ORDERED_PROVIDERS.find((provider) => provider.id === id)?.liveTvSource
    const movieIds = isLive ? [...catalog.movieIds].sort(comparePopularity) : [...catalog.movieIds]
    const seriesIds = isLive ? [...catalog.seriesIds].sort(comparePopularity) : [...catalog.seriesIds]
    const ranked = [...movieIds, ...seriesIds].sort(comparePopularity)
    result[id] = { ...catalog, movieIds, seriesIds, homeIds: ranked }
  }
  return result
}
