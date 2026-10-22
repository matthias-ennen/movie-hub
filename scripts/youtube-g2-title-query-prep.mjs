/**
 * YouTube publisher-title -> TMDB QUERY preparation only.
 * Source video title is preserved separately for provenance and display.
 * Frozen Matcher v1's scoreCandidate/classifyVideo are never modified.
 */
const strip = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0,240)
const marketing = /\b(?:ganzer film|ganze filme|full movie|full film|in voller länge|filme deutsch|deutsch komplett|neue filme|komödien filme|thriller filme|horrorfilme|liebesfilme|actionfilme|romantische komödie|action thriller|western actionfilm|oscar nominiert|oscar nominated|filme in deutsch|film deutsch|film in voller länge|komplett neu|schwarze horrorkomödie|ganzer spielfilm|video in voller länge)\b/i
const bracketed = /\s*\(([^()]*)\)/g
// CiNENET-like publisher format: "Actual film name (1981) [Horror] [Thriller] promo text".
// Only a standalone source year immediately followed by one or more GENRE tags
// qualifies. Never confuse a movie title such as "2010: ..." with a release year.
const sourceYearGenre = /^(.*?)\s+\(((?:19|20)\d{2})\)\s+((?:\[(?:action|sci-fi|science-fiction|komödie|horror|thriller|drama|mystery|krimi|abenteuer|adventure|romantik|eastern|kriegsfilm|fantasy|western|slasher|martial arts|krieg|klassiker|katastrophenfilm|biografie|satire|trash)\]\s*)+)(?:.*)$/iu

const actorPrefix = /^[A-ZÄÖÜ][A-ZÄÖÜ\s.'’&-]{4,42}\s+in\s+(?=[A-ZÄÖÜ0-9])/u
const promotionalTail = /\s+[–—]\s+(?:ein\s+etwas\s+anderer|[A-ZÄÖÜ\s&.'’]{4,}\s+(?:sind|ist)\s+)/u
const normalize = s => strip(s).replace(/\s+[–—-]\s*$/,'').trim()
const canonical = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[^a-z0-9]+/g,' ').trim()

export function prepareYouTubeMovieSearchTitle(rawTitle) {
  const original = strip(rawTitle)
  if (!original) return {rawTitle:original,matchingTitle:'',queries:[],removed:[]}
  const removed = []
  let yearHint = null
  let candidate = original
  const sourceFormat = original.match(sourceYearGenre)
  if (sourceFormat && sourceFormat[1].trim().length >= 3) {
    // Keep the reported year as an explicit v1 conflict-check hint, not as
    // a TMDB query term. A reported year is NOT independently verified.
    candidate = sourceFormat[1].trim()
    yearHint = Number(sourceFormat[2])
    removed.push('source-year-genre-promotion-tail')
  }
  candidate=candidate.replace(bracketed, (whole,inner)=>{
    // Parentheses are removed only when unmistakably promotional or SEO-related.
    if (!marketing.test(inner) && !/\b(?:genre|ganzer|komplett|filme|full)\b/i.test(inner)) return whole
    removed.push('promotional-parenthetical')
    return ''
  })
  candidate=normalize(candidate)
  if (actorPrefix.test(candidate)) {
    candidate=candidate.replace(actorPrefix,'')
    removed.push('actor-prefix')
  }
  const promoAt=candidate.search(promotionalTail)
  if (promoAt>=0){
    candidate=candidate.slice(0,promoAt)
    removed.push('promotional-tail')
  }
  candidate=normalize(candidate)
  // A query is not an offer, and a year-looking marketing suffix must not
  // become a publication year. Do not remove numerals in real film titles.
  const alternatives=[]
  const dashParts=candidate.split(/\s+[–—-]\s+/)
  if(dashParts.length>1){
    const head=normalize(dashParts[0])
    if(head.length>=4)alternatives.push(head)
  }
  const queries=[candidate,...alternatives]
  const seen=new Set()
  const cleanQueries=queries.filter(q=>{
    const n=canonical(q)
    if(n.length<3||seen.has(n))return false
    seen.add(n);return true
  }).slice(0,2)
  return {
    rawTitle:original,
    // v1 expects a year inside its input title. The raw source text stays
    // unchanged; the search queries exclude the year and genre/promo tail.
    matchingTitle:(cleanQueries[0]||candidate)+(yearHint ? ' ('+yearHint+')' : ''),
    queries:cleanQueries,
    yearHint,
    removed:[...new Set(removed)],
  }
}
