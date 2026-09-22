import { loadCompleteTitleMetadata } from './loadCompleteTitleMetadata.js'
import { mergeEnrichedTitle, sameTmdbTitle, titleNeedsMetadataEnrichment } from './titleMetadata.js'

const runtimeDetails = new Map()
const runtimeRequests = new Map()

function runtimeTitleKey(item) {
  const tmdbId = Number(item?.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null
  const type = item?.type === 'series' || item?.mediaType === 'tv' ? 'series' : 'movie'
  return `${type}:${tmdbId}`
}

function mergeWithRuntimeDetail(item, detail) {
  if (!detail || !sameTmdbTitle(item, detail)) return item

  // The cached value contains the strongest metadata seen in this app session.
  // The current item is merged second so live availability and personal display
  // state remain current instead of being replaced by an older surface object.
  return mergeEnrichedTitle(detail, item)
}

export function readRuntimeTitleMetadata(item) {
  const key = runtimeTitleKey(item)
  return key ? mergeWithRuntimeDetail(item, runtimeDetails.get(key)) : item
}

export function rememberRuntimeTitleMetadata(detail) {
  const key = runtimeTitleKey(detail)
  if (!key) return detail

  const current = runtimeDetails.get(key)
  const next = current && sameTmdbTitle(current, detail)
    ? mergeEnrichedTitle(current, detail)
    : detail
  runtimeDetails.set(key, next)
  return next
}

export async function loadRuntimeTitleMetadata(item, {
  loadComplete = loadCompleteTitleMetadata,
  requireContract = false,
  requireComplete = false,
} = {}) {
  const key = runtimeTitleKey(item)
  const current = readRuntimeTitleMetadata(item)
  const enrichmentOptions = { requireContract }
  if (!titleNeedsMetadataEnrichment(current, enrichmentOptions)) return current

  if (!key) {
    return loadComplete(current, { requireContract, requireComplete })
  }

  const requestKey = `${key}:${requireContract ? 'contract' : 'legacy'}:${requireComplete ? 'strict' : 'fallback'}`
  if (!runtimeRequests.has(requestKey)) {
    runtimeRequests.set(requestKey, Promise.resolve(loadComplete(current, {
      requireContract,
      requireComplete,
    })).then((detail) => rememberRuntimeTitleMetadata(detail))
      .finally(() => runtimeRequests.delete(requestKey)))
  }

  const detail = await runtimeRequests.get(requestKey)
  return mergeWithRuntimeDetail(item, detail)
}

export function clearRuntimeTitleMetadata() {
  runtimeDetails.clear()
  runtimeRequests.clear()
}
