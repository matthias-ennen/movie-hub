import { loadSearchDetail } from '../search/lazySearchDetails.js'
import { loadNativeTmdbTitleMetadata } from '../tmdb/nativeTitleMetadata.js'
import { titleNeedsMetadataEnrichment } from './titleMetadata.js'

export async function loadCompleteTitleMetadata(item, {
  loadPublished = loadSearchDetail,
  loadNative = loadNativeTmdbTitleMetadata,
} = {}) {
  const published = await loadPublished(item)
  if (!titleNeedsMetadataEnrichment(published)) return published
  const native = await loadNative(item)
  return native && !titleNeedsMetadataEnrichment(native) ? native : published
}
