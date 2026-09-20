import { loadSearchDetail } from '../search/lazySearchDetails.js'
import { loadNativeTmdbTitleMetadata } from '../tmdb/nativeTitleMetadata.js'
import { mergeEnrichedTitle, titleNeedsMetadataEnrichment } from './titleMetadata.js'

export class IncompleteTitleMetadataError extends Error {
  constructor(message = 'Die vollständigen Titeldetails konnten nicht geladen werden.') {
    super(message)
    this.name = 'IncompleteTitleMetadataError'
  }
}

export async function loadCompleteTitleMetadata(item, {
  loadPublished = loadSearchDetail,
  loadNative = loadNativeTmdbTitleMetadata,
  requireContract = false,
  requireComplete = false,
} = {}) {
  const published = await loadPublished(item)
  const enrichmentOptions = { requireContract }
  if (!titleNeedsMetadataEnrichment(published, enrichmentOptions)) return published
  const native = await loadNative(item)
  const merged = native ? mergeEnrichedTitle(published, native) : published
  if (!titleNeedsMetadataEnrichment(merged, enrichmentOptions)) return merged
  if (requireComplete) throw new IncompleteTitleMetadataError()
  return merged
}
