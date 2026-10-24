/**
 * G2 research-only Matcher v1.1: disentangle a terminal publisher release-year
 * from film-title comparison, and refuse leading status for remaining partial
 * title evidence. Legacy Matcher v1 stays unchanged for controlled A/B replay.
 * All identifiers and offers remain UNCONFIRMED / review only.
 */
import { scoreCandidate, classifyVideo } from './youtube-g1-matcher-v1.mjs'
import { titleQuality } from './youtube-movies-top-three-qa-g1.mjs'

const terminalYear = /^(.*?)\s+\(((?:19|20)\d{2})\)\s*$/u

// Some studio storefront titles omit the leading English article in TMDB's
// original title: "The Godfather Part II" => "Godfather Part II". Require
// >=2 complete words after the article so a one-word title like "The Thing"
// cannot acquire broad/unsafe aliases.
function cautiousLeadingTheAliases(film){
  const raw=[film?.title,film?.original_title]
  const aliases=[]
  for(const v of raw){
    const match=String(v??'').trim().match(/^the\s+(.+)$/iu)
    if(!match)continue
    const without=match[1].trim()
    const words=without.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/gu,' ').trim().split(/\s+/u)
      .filter(Boolean)
    if(words.length<2||words.every(w=>w.length<4)||without.length<8)continue
    aliases.push(without)
  }
  return [...new Set(aliases)]
}

export function scoreCandidateV11(video, film, asOfYear = 2026) {
  const original = scoreCandidate(video, film, asOfYear)
  const sourceTitle = String(video?.title ?? '')
  const parts = sourceTitle.match(terminalYear)
  let current = original
  let matchTitle = sourceTitle
  if (parts && parts[1].trim().length >= 3
    // Only strip an actual independently recognized terminal year. Preserve
    // the original conflict flag if that year mismatches the TMDB work.
    && original.yearHint === Number(parts[2])) {
    matchTitle = parts[1].trim()
    const title = titleQuality(matchTitle, film)
    if (title.level > current.titleLevel) {
      current = {
        ...current,
        titleLevel: title.level,
        titleReason: title.source,
        // v1 title score remains strictly linear: 8 points per level.
        score: current.score + (title.level - current.titleLevel) * 8,
        titleComparisonMode: 'terminal-release-year-separated',
      }
    }
  }

  const aliases = cautiousLeadingTheAliases(film)
  // A publisher subtitle separated by a dash/colon may be a *different*
  // work or series, even if joining all tokens resembles a TMDB alias.
  // Preserve the pre-existing Red Phone - Manhunt partial-title safety gate.
  // Only a plain complete film title without a subtitle delimiter qualifies.
  if (!aliases.length || current.titleLevel === 4
    || /[–—:]/u.test(matchTitle) || /\s-\s/u.test(matchTitle)) return current
  const enhanced = titleQuality(matchTitle, {
    ...film,
    alternative_titles: {
      ...(film?.alternative_titles ?? {}),
      titles: [
        ...(Array.isArray(film?.alternative_titles?.titles)
          ? film.alternative_titles.titles : []),
        ...aliases.map(title=>({title})),
      ],
    },
  })
  // A partial overlap, matching sequel stem or shared franchise word is NOT
  // an article-only equivalence. The full articleless title must match.
  if (enhanced.level !== 4 || enhanced.level <= current.titleLevel) return current
  return {
    ...current,titleLevel:4,titleReason:'exact-title-omitting-leading-the',
    score:current.score+(4-current.titleLevel)*8,
    titleComparisonMode:'cautious-omitted-leading-the',
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
