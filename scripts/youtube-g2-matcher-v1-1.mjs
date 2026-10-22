/**
 * G2 research-only Matcher v1.1: disentangle a terminal publisher release-year
 * from film-title comparison, and refuse leading status for remaining partial
 * title evidence. Legacy Matcher v1 stays unchanged for controlled A/B replay.
 * All identifiers and offers remain UNCONFIRMED / review only.
 */
import { scoreCandidate, classifyVideo } from './youtube-g1-matcher-v1.mjs'
import { titleQuality } from './youtube-movies-top-three-qa-g1.mjs'

const terminalYear = /^(.*?)\s+\(((?:19|20)\d{2})\)\s*$/u

export function scoreCandidateV11(video, film, asOfYear = 2026) {
  const original = scoreCandidate(video, film, asOfYear)
  const sourceTitle = String(video?.title ?? '')
  const parts = sourceTitle.match(terminalYear)
  if (!parts || parts[1].trim().length < 3) return original
  // A film named "2010: ..." is not a year hint; a year must have been
  // independently recognized by the legacy explicit-year guard.
  if (original.yearHint !== Number(parts[2])) return original

  const title = titleQuality(parts[1].trim(), film)
  if (title.level <= original.titleLevel) return original

  return {
    ...original,
    titleLevel: title.level,
    titleReason: title.source,
    // Legacy scoring is linear in titleLevel (8 points per level).
    // All year, sequel, runtime, content-type and release safeguards remain.
    score: original.score + (title.level - original.titleLevel) * 8,
    titleComparisonMode: 'terminal-release-year-separated',
  }
}

export function classifyVideoV11(video, scored, tvIds = [], options = {}) {
  const result = classifyVideo(video, scored, tvIds, options)
  if (!result.status.startsWith('review-leading-')) return result
  if (result.topCandidates[0]?.titleLevel !== 2) return result
  return {
    ...result,
    status: 'review-partial-title-identity',
    confidence: 'unresolved',
    reasons: [...result.reasons, 'partial-title-requires-independent-work-evidence'],
  }
}
