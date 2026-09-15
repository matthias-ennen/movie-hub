export const DATA_STATUS_URL = '/data-status.json'

function nonNegativeInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}

function normalizeMediaCounts(value) {
  return {
    total: nonNegativeInteger(value?.total),
    movies: nonNegativeInteger(value?.movies),
    series: nonNegativeInteger(value?.series),
  }
}

export function normalizeDataStatus(payload) {
  if (
    payload?.kind !== 'movie-hub-data-status'
    || Number(payload?.version) !== 1
    || !payload?.catalog
    || !payload?.searchIndex
    || !payload?.completeSearchDetails
    || !payload?.seriesSeasons
  ) {
    throw new Error('Datenstatus hat ein ungültiges Format.')
  }

  return {
    kind: 'movie-hub-data-status',
    version: 1,
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : null,
    catalog: normalizeMediaCounts(payload.catalog),
    searchIndex: normalizeMediaCounts(payload.searchIndex),
    completeSearchDetails: {
      ...normalizeMediaCounts(payload.completeSearchDetails),
      pending: nonNegativeInteger(payload.completeSearchDetails.pending),
    },
    seriesSeasons: {
      available: nonNegativeInteger(payload.seriesSeasons.available),
      requested: nonNegativeInteger(payload.seriesSeasons.requested),
      pending: nonNegativeInteger(payload.seriesSeasons.pending),
    },
  }
}

export async function loadDataStatus({
  fetchImpl = globalThis.fetch,
  url = DATA_STATUS_URL,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Datenstatus kann nicht geladen werden.')

  const response = await fetchImpl(url, { cache: 'no-store' })
  if (!response?.ok) {
    throw new Error(`Datenstatus konnte nicht geladen werden (${response?.status ?? 'unbekannt'}).`)
  }
  return normalizeDataStatus(await response.json())
}
