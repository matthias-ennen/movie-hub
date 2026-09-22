import { loadRuntimeTitleMetadata } from '../catalog/runtimeTitleMetadata.js'
import { titleNeedsMetadataEnrichment } from '../catalog/titleMetadata.js'

export function heroNeedsCanonicalMetadata(item) {
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
