/**
 * YouTube title reconciliation preview against the existing canonical TMDB
 * library: same (mediaType,tmdbId) means ENRICH, absent means ADD CANDIDATE.
 *
 * Pure read-only plan. No Firestore, catalog.json, offer or provider mutation.
 * Matcher-v1 output always remains a hypothesis, never authorizes publication.
 */
const VALID_REF = /^[1-9]\d*$/
const STRONG = new Set(['review-leading-film-hypothesis', 'review-leading-movie-with-TV-alternatives'])
const safe = s => String(s ?? '').replace(/[<>\r\n|]/g, ' ').trim().slice(0,140)
const validId = v => /^[A-Za-z0-9_-]{11}$/.test(String(v || ''))
function titleKey(ref) {
  const mediaType = ref?.mediaType === 'series' ? 'series' : ref?.mediaType === 'movie' ? 'movie' : null
  const id = String(ref?.tmdbId ?? '')
  return mediaType && VALID_REF.test(id) ? mediaType + ':' + id : null
}
export function buildYoutubeTitleImportPreview(rows = [], {
  knownTitleRefs = null,
  reportGeneratedAt = new Date().toISOString(),
} = {}) {
  const catalogKnown = Array.isArray(knownTitleRefs)
  const known = catalogKnown ? new Set(knownTitleRefs.map(titleKey).filter(Boolean)) : null
  const unique = new Set()
  const candidates = []
  const totals = { seen: 0, screenedOut: 0, review: 0,
    matchedExisting: 0, proposedNew: 0, catalogUnknown: 0, duplicateIds: 0, potentialTitles: 0 }
  for (const row of Array.isArray(rows) ? rows : []) {
    const v = row?.video
    if (!validId(v?.videoId)) continue
    totals.seen++
    if (unique.has(v.videoId)) { totals.duplicateIds++; continue }
    unique.add(v.videoId)
    const verdict = row?.verdict || {}
    const leading = verdict.topCandidates?.[0] || null
    const tmdbId = Number(leading?.tmdbId)
    const titleRef = Number.isInteger(tmdbId) && tmdbId > 0
      ? { mediaType: 'movie', tmdbId } : null
    const key = titleKey(titleRef)
    const hypothesis = v?.screening?.eligible === true
      && STRONG.has(verdict.status) && key && !verdict.confirmedFilm
    const disposition = v?.screening?.eligible !== true
      ? 'screened-out'
      : !hypothesis ? 'review'
      : !catalogKnown ? 'catalog-status-unknown'
      : known.has(key) ? 'preview-enrich-existing'
      : 'preview-new-title-candidate'
    if (disposition === 'screened-out') totals.screenedOut++
    else if (disposition === 'review') totals.review++
    else if (disposition === 'catalog-status-unknown') totals.catalogUnknown++
    else if (disposition === 'preview-enrich-existing') totals.matchedExisting++
    else totals.proposedNew++
    candidates.push({
      videoId: v.videoId,
      channelId: v.channelId,
      title: safe(v.title),
      youtubeWatchUrl: v.watchUrl,
      titleRef,
      matcherStatus: verdict.status || 'review-unknown',
      disposition,
      // No title or availability may be added by this preview.
      accepted: false, toPublish: false, offerType: null,
      independentlyVerifiedVideoContent: false,
      verifiedDEOffer: false,
    })
  }
  totals.potentialTitles = new Set(candidates.filter(c =>
    c.disposition === 'preview-enrich-existing'
    || c.disposition === 'preview-new-title-candidate'
  ).map(c => titleKey(c.titleRef))).size
  return {
    generatedAt: new Date(reportGeneratedAt).toISOString(),
    mode: 'READ_ONLY_YOUTUBE_MATCHER_PREFLIGHT',
    matcherFrozenVersion: 1, source: 'youtube',
    catalogStatus: catalogKnown ? 'known' : 'not-loaded',
    counts: totals, candidates,
    publicationPermitted: false, firestoreWrites: 0, catalogWrites: 0,
  }
}
