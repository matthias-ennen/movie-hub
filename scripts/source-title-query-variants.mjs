// Source-neutral, purely diagnostic text-cleaning candidates for provider movie headlines.
// No identities, TMDB scores, media years, rights, or provider offers are assigned here.
import { normalizeWaipuText } from './waipu-program-classifier.mjs'

export const MAX_EXTRA_SOURCE_QUERIES = 2

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}
function noPromotion(value) {
  return compact(value)
    .replace(/\s*\((?:(?:ganzer|kompletter)\s+film|full\s+movie|(?:action|horror|science[\s-]?fiction|komödie|thriller|drama)\s+(?:ganzer\s+film|in\s+voller\s+länge)|oscarnominierter\s+film)\b.*$/i, '')
    .replace(/\s+[|]\s*(?:ganzer\s+film|full\s+movie|kompletter\s+film|filme?\s+deutsch)\b.*$/i, '')
    .replace(/\s*[:|–-]\s*(?:ganzer\s+film|full\s+movie|kompletter\s+film|(?:hd|uhd)(?:\s+1080p)?)\b.*$/i, '')
    .replace(/\s*[|]\s*$/, '')
    .trim()
}
const CAST_PREFIX = /^([A-ZÄÖÜ]{3,}(?:\s+(?:[A-ZÄÖÜ]{2,}|DE)){1,3})\s+(?:in|ist)\s+(.+)$/u
const CAST_PAIR = /^(?:[A-ZÄÖÜ]{3,}\s+[A-ZÄÖÜ]{3,})\s*&\s*(?:[A-ZÄÖÜ]{3,}\s+[A-ZÄÖÜ]{3,})\s+haben\s+(.+)$/u
const CAST_TAIL = /^(.+?)\s+[–-]\s+(?:[A-ZÄÖÜ]{3,}\s+[A-ZÄÖÜ]{3,}\s*&\s*[A-ZÄÖÜ]{3,}\s+[A-ZÄÖÜ]{3,}\s+(?:sind|ist)\s+zurück[!.]?)$/u
const GENRE_FOOTER = /\s+(?:Drama\s+Thriller|Thriller\s+Drama|Action\s+Thriller|Abenteuer\s+Drama|Drama\s+Biografie)\s+(?=(?:Starring|Tick-Tack|Eine|Bereit)\b|[^\p{L}\p{N}\s])/iu

export function sourceTitleQueryCandidates(rawTitle, parsedTitle, max = MAX_EXTRA_SOURCE_QUERIES) {
  const original = compact(rawTitle)
  const baseline = compact(parsedTitle)
  const choices = []
  const names = new Set([normalizeWaipuText(baseline)])
  const cap = Math.max(0, Math.min(MAX_EXTRA_SOURCE_QUERIES, Number.isInteger(max) ? max : MAX_EXTRA_SOURCE_QUERIES))

  function offer(input, reason) {
    const title = noPromotion(input).replace(/^[\s'"«»]+|[\s'"«»]+$/g, '').trim()
    const normalized = normalizeWaipuText(title)
    if (title.length < 4 || title.length > 110 || !normalized || names.has(normalized)) return
    if (/^(?:ganzer\s+film|full\s+movie|kompletter\s+film|netzkino|drama\s+thriller)$/i.test(title)) return
    names.add(normalized)
    choices.push({ title, reason })
  }

  // These source-neutral patterns only propose search inputs, never change source identity.
  for (const input of [baseline, original]) {
    const headline = noPromotion(input)
    const castPrefix = headline.match(CAST_PREFIX)
    if (castPrefix) offer(castPrefix[2], 'cast-prefix')
    const castPair = headline.match(CAST_PAIR)
    if (castPair) offer(castPair[1], 'cast-pair-prefix')
    const castTail = headline.match(CAST_TAIL)
    if (castTail) offer(castTail[1], 'cast-promo-tail')

    const genre = GENRE_FOOTER.exec(headline)
    if (genre) offer(headline.slice(0, genre.index), 'recognised-genre-footer')
    if (/^(?:netzkino|ganzer\s+film|full\s+movie)\s*[:|–-]\s*/i.test(headline)) {
      offer(headline.replace(/^(?:netzkino|ganzer\s+film|full\s+movie)\s*[:|–-]\s*/i, ''), 'explicit-publisher-prefix')
    }
    const segments = headline.split(/\s+\|\s+/)
    if (segments.length > 1 && /^(?:ganzer\s+film|full\s+movie|kompletter\s+film)\b/i.test(segments[1])) {
      offer(segments[0], 'explicit-promo-pipe')
    }
  }
  return choices.slice(0, cap)
}
