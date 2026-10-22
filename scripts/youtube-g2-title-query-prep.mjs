/**
 * YouTube publisher-title -> TMDB QUERY preparation only.
 * Source video title is preserved separately for provenance and display.
 * Frozen Matcher v1's scoreCandidate/classifyVideo are never modified.
 */
const strip = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0,240)
const marketing = /\b(?:ganzer film|ganze filme|full movie|full film|in voller länge|filme deutsch|deutsch komplett|neue filme|komödien filme|thriller filme|horrorfilme|liebesfilme|actionfilme|romantische komödie|action thriller|western actionfilm|oscar nominiert|oscar nominated|filme in deutsch|film deutsch|film in voller länge|komplett neu|schwarze horrorkomödie|ganzer spielfilm|video in voller länge)\b/i
const bracketed = /\s*\(([^()]*)\)/g
// Strong, known publisher syntax: "Film Name (1984) [Horror] [Thriller] SEO...".
// Only strip from a clearly identified genre tag onward, never arbitrary
// square-bracket subtitle/version text like "[OV]" or "[Director's Cut]".
const GENRES = new Set([
 'action','sci-fi','science fiction','horror','thriller','komödie','komoedie',
 'comedy','romantik','romance','drama','eastern','western','mystery',
 'abenteuer','adventure','krimi','crime','fantasy','dokumentation',
 'documentary','animation','familie','family','slasher','kriegsfilm',
 'war','biografie','biography','historie','history','musik','musical',
])
function publisherGenreSuffixAt(title) {
 const tags=/\s+\[([^\]\r\n]{2,30})\]/g
 for(const match of title.matchAll(tags)) {
  const label=match[1].trim().toLocaleLowerCase('de-DE')
  if(GENRES.has(label))return match.index
 }
 return -1
}
function filmSearchVariants(title, { removedPublisherGenre = false } = {}) {
 // A parenthesized release year should remain available to frozen matcher v1,
 // but TMDB.search/movie query should primarily use just the film name.
 let searchTitle=title
 const yearAtEnd=/(?:^|\s)\((?:19|20)\d{2}\)$/.test(searchTitle)
 if(removedPublisherGenre && yearAtEnd &&
   !/^\d{4}\s*[:\-–]/.test(searchTitle)) {
  searchTitle=normalize(searchTitle.replace(/\s+\((?:19|20)\d{2}\)$/,''))
 }
 const alternates=[]
 const dashParts=searchTitle.split(/\s+[–—-]\s+/)
 if(dashParts.length>1){
  const head=normalize(dashParts[0])
  if(head.length>=4)alternates.push(head)
 }
 return [searchTitle,...alternates]
}

const actorPrefix = /^[A-ZÄÖÜ][A-ZÄÖÜ\s.'’&-]{4,42}\s+in\s+(?=[A-ZÄÖÜ0-9])/u
const promotionalTail = /\s+[–—]\s+(?:ein\s+etwas\s+anderer|[A-ZÄÖÜ\s&.'’]{4,}\s+(?:sind|ist)\s+)/u
const normalize = s => strip(s).replace(/\s+[–—-]\s*$/,'').trim()
const canonical = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[^a-z0-9]+/g,' ').trim()

export function prepareYouTubeMovieSearchTitle(rawTitle) {
  const original = strip(rawTitle)
  if (!original) return {rawTitle:original,matchingTitle:'',queries:[],removed:[]}
  const removed = []
  let candidate=original.replace(bracketed, (whole,inner)=>{
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
  const genreSuffixAt=publisherGenreSuffixAt(candidate)
  const removedPublisherGenre=genreSuffixAt>=0
  if(removedPublisherGenre){
    candidate=normalize(candidate.slice(0,genreSuffixAt))
    removed.push('publisher-bracketed-genre-and-marketing-suffix')
  }
  // Keep original release year in matchingTitle for the frozen matcher v1.
  // Only the TMDB search expression drops an unmistakable parenthesized year.
  const queries=filmSearchVariants(candidate,{removedPublisherGenre})
  const seen=new Set()
  const cleanQueries=queries.filter(q=>{
    const n=canonical(q)
    if(n.length<3||seen.has(n))return false
    seen.add(n);return true
  }).slice(0,2)
  return {
    rawTitle:original,
    matchingTitle:removedPublisherGenre ? candidate : cleanQueries[0]||candidate,
    queries:cleanQueries,
    removed:[...new Set(removed)],
  }
}
