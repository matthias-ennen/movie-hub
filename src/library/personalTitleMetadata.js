import { titleNeedsMetadataEnrichment } from '../catalog/titleMetadata.js'
import { loadSearchDetail } from '../search/lazySearchDetails.js'
import {
  createTitleSnapshot,
  hasPersonalTitleState,
  normalizeTitleRef,
  normalizeTitleState,
} from './libraryState.js'

function titleEntry(titleRef, snapshot) {
  if (!titleRef) return null
  return {
    ...(snapshot || {}),
    id: titleRef.catalogId || snapshot?.id || `tmdb-${titleRef.type}-${titleRef.tmdbId}`,
    tmdbId: titleRef.tmdbId,
    type: titleRef.type,
    title: snapshot?.title || `TMDB #${titleRef.tmdbId}`,
  }
}

export async function hydratePersonalTitleState(rawState, {
  loadDetail = loadSearchDetail,
} = {}) {
  const bootstrapSnapshot = rawState?.bootstrapSnapshot ?? rawState?.titleSnapshot ?? null
  const titleRef = normalizeTitleRef(rawState?.titleRef, bootstrapSnapshot)
  const state = normalizeTitleState({
    ...rawState,
    titleRef,
    titleSnapshot: bootstrapSnapshot,
  })
  if (!hasPersonalTitleState(state) || !titleRef || typeof loadDetail !== 'function') return state

  try {
    const detail = await loadDetail(titleEntry(titleRef, state.titleSnapshot))
    if (detail?.canonicalPublished !== true
      || titleNeedsMetadataEnrichment(detail, { requireContract: true })) return state
    return normalizeTitleState({
      ...state,
      titleRef,
      titleSnapshot: createTitleSnapshot(detail),
      canonicalReady: true,
      canonicalMetadataVersion: detail.metadataVersion,
      canonicalMetadataUpdatedAt: detail.metadataUpdatedAt,
    })
  } catch {
    return state
  }
}
