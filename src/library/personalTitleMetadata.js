import { titleNeedsMetadataEnrichment } from '../catalog/titleMetadata.js'
import { loadSearchDetail } from '../search/lazySearchDetails.js'
import { getPublicCatalogTitle } from '../performance/publicCatalog.js'
import { throwIfAborted, yieldToMain } from '../performance/cooperativeWork.js'
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

export function bootstrapPersonalTitleState(rawState) {
  return normalizeTitleState({ ...rawState, titleSnapshot: rawState?.bootstrapSnapshot ?? rawState?.titleSnapshot ?? null })
}

// Publish the small personal flags first. Hydration is a cancellable second
// phase, and never creates one Promise/fetch per title at once.
export async function hydratePersonalStates(states, {
  signal, onBatch, getListing = getPublicCatalogTitle, loadDetail = loadSearchDetail,
} = {}) {
  const entries = Object.entries(states).sort((a, b) => (Number(a[1].titleRef?.tmdbId) % 64) - (Number(b[1].titleRef?.tmdbId) % 64))
  let index = 0, batch = []
  const flush = () => { if (batch.length) { const next = batch; batch = []; onBatch(next) } }
  async function worker() {
    while (index < entries.length) {
      throwIfAborted(signal)
      const [key, state] = entries[index++]
      if (!hasPersonalTitleState(state) || !state.titleRef) continue
      const listing = getListing(state.titleRef)
      const next = listing
        ? normalizeTitleState({ ...state, titleSnapshot: createTitleSnapshot(listing) })
        : await hydratePersonalTitleState(state, { loadDetail: item => loadDetail(item, { signal, priority: 0 }) })
      throwIfAborted(signal)
      batch.push([key, state, next])
      if (batch.length >= 8) flush()
      await yieldToMain(signal)
    }
  }
  await Promise.all([worker(), worker()])
  flush()
}
