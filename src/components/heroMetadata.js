import { loadRuntimeTitleMetadata } from '../catalog/runtimeTitleMetadata.js'
import { titleNeedsMetadataEnrichment, metadataChecksComplete, isUsableTitle } from '../catalog/titleMetadata.js'

export function heroNeedsCanonicalMetadata(item) {
  // A validated listing retains videos/artwork/provider and descriptive fields.
  // Missing cast, seasons and collection details do not require a Hero fetch.
  if (item?.detailDeferred && metadataChecksComplete(item) && isUsableTitle(item.title)) return false
  return Boolean(item?.tmdbId)
    && titleNeedsMetadataEnrichment(item, { requireContract: true })
}

export async function resolveHeroMetadata(item, {
  loadTitle = loadRuntimeTitleMetadata,
} = {}) {
  if (!heroNeedsCanonicalMetadata(item)) return item
  return loadTitle(item, {
    requireContract: true,
    requireComplete: false,
  })
}
