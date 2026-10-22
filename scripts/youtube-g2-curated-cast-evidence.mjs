/**
 * Review-only corrective evidence for an explicit actor named in a source
 * YouTube video title. TMDB credits.cast is checked, but does NOT prove
 * the video contains that film or the source offers it in Germany.
 *
 * Keeps matcher v1.1 untouched. A same-named wrong movie must not win
 * solely because its short title is exact and runtime is similar.
 */
const normalize = s => String(s ?? '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim()

/** Strict two-token explicit billing, not arbitrary words from a description. */
export function explicitNamedActor(sourceTitle) {
  const text = String(sourceTitle ?? '')
  const match = text.match(/\b(?:mit|with|starring)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]{1,28}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]{1,32})(?=[\s,;.!?\-–—)]|$)/u)
  return match ? match[1].trim() : null
}
function hasActor(movie, actor) {
  if (!movie || !actor) return false
  const credited = movie?.credits?.cast
  return Array.isArray(credited) && credited.some(x =>
    normalize(x?.name) === normalize(actor) ||
    normalize(x?.original_name) === normalize(actor))
}

/**
 * Retain ALL candidate identities, only adjust relative RESEARCH scores.
 * If no TMDB candidate credits the quoted actor, do not fabricate evidence.
 */
export function applyExplicitCastGuard(sourceTitle, scores = [], tmdbFilms = []) {
  const actor = explicitNamedActor(sourceTitle)
  const byId = new Map((tmdbFilms || [])
    .filter(x => Number.isInteger(Number(x?.id)) && Number(x.id) > 0)
    .map(x => [Number(x.id), x]))
  const matching = actor ? scores.filter(s =>
    hasActor(byId.get(Number(s.tmdbId)), actor)).map(s => Number(s.tmdbId)) : []
  if (!actor || matching.length === 0) {
    return {
      scores: [...scores],
      evidence: {
        explicitActor: actor,
        actorCreditEvidence: actor ? 'not-corroborated-in-candidates' : 'none',
        creditedMovieIds: [],
        affectsRanking: false,
      },
    }
  }
  const credited = new Set(matching)
  return {
    scores: scores.map(s => ({
      ...s,
      // Scoring only within this isolated, review-only curated QA.
      // Explicit cast hit +12, unlike titled work -20. No verified ID.
      score: s.score + (credited.has(Number(s.tmdbId)) ? 12 : -20),
      quotedActorCreditMatches: credited.has(Number(s.tmdbId)),
    })),
    evidence: {
      explicitActor: actor,
      actorCreditEvidence: 'matched-a-tmdb-credit-list',
      creditedMovieIds: matching,
      affectsRanking: true,
    },
  }
}
