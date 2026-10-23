/**
 * Conservative search-query corrections for the TWO curated playlist sources.
 *
 * Source titles and video IDs are never overwritten. Only TMDB query terms
 * are altered, and all results still require research matcher review.
 */
import { prepareYouTubeMovieSearchTitle } from './youtube-g2-title-query-prep.mjs'

const oldGermanMovies = /^Alte\s+Deutsche\s+Spielfilme\s*~\s*(.{4,110}?)\s*~\s*((?:19|20)\d{2})\s*$/iu
const promotionalFullMovieInHd = /\(\s*ganzer\s+Film\s+auf\s+Deutsch\s*\)\s+in\s+HD\s*$/iu
const hdSuffix = /\s+in\s+HD\s*$/iu
const tidy = v => String(v ?? '').replace(/[<>\r\n|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)

// Exact observed publisher promo tails. Leave genuine film-title words intact.
const englishFullMovie = /^(.{5,120}?)\s+(?:(?:(?:fantasy|horror|action|thriller|drama|mystery|sci-fi)\s*,\s*)+(?:fantasy|horror|action|thriller|drama|mystery|sci-fi)\s+)?full\s+movie\s+in\s+english\s*$/iu
const germanYearAndCast = /^(.{4,100}?)\s*\[((?:19|20)\d{2})\]\s+ganzer\s+film\s+mit\s+.{8,}$/iu
const imdbDescriptionTail = /^(.{4,110}?)\s+\([^()]*\bIMDb[- ]Bewertung\)\s*$/iu
const actorAndFullFilmTail = /^(.{4,100}?)\s+(?:thriller|horror|drama|actionfilm|krimi)\s+mit\s+[A-ZÄÖÜ][\p{L}.'-]{1,35}\s+[A-ZÄÖÜ][\p{L}.'-]{1,35}\s+ganzer\s+film\s*$/iu
// German theatrical release year (2026) is not necessarily production year (2025).
const germanNuremberg = /^Nürnberg\s+\(((?:19|20)\d{2})\)\s*$/iu

// Live source QA #39928710237: explicit non-title promotional wrappers.
const completeFilmDeutsch = /^(.{4,100}?)\s+kompletter\s+film\s+deutsch\s*$/iu
const promotedSurvivalThriller = /^grandioser\s+survival[-\s]thriller\s+mit\s+starbesetzung:\s*(.{4,90}?)\s+\(((?:19|20)\d{2})\)\s+\(\s*HD\s*\)\s*$/iu

function researchQueries(legacy, title, firstQuery, reason, fallback = true) {
  const clean = tidy(firstQuery)
  if (clean.length < 4) return {...legacy, curatedQueryReason: null}
  const queries = [...new Set([clean, ...(fallback ? legacy.queries : [])]
    .map(tidy).filter(Boolean))].slice(0, 2)
  return {...legacy, matchingTitle: title, queries, curatedQueryReason: reason}
}


export function planCuratedTmdbQueries(sourceTitle) {
  const raw = tidy(sourceTitle)
  const legacy = prepareYouTubeMovieSearchTitle(raw)
  // Observed 23.10.2026 YouTube video headings: query-only changes.
  const completeMovie = raw.match(completeFilmDeutsch)
  if (completeMovie) {
    const film = tidy(completeMovie[1])
    return researchQueries(legacy, film, film,
      'complete-film-deutsch-ad-tail', false)
  }
  const survival = raw.match(promotedSurvivalThriller)
  if (survival) {
    const film = tidy(survival[1])
    // The published source year is a search/mismatch clue, not verified identity.
    return researchQueries(legacy, film + ' (' + survival[2] + ')',
      film, 'survival-starbesetzung-year-hd-wrapper', false)
  }
  const yearCast = raw.match(germanYearAndCast)
  if (yearCast) {
    const film = tidy(yearCast[1])
    return researchQueries(legacy, film + ' (' + yearCast[2] + ')',
      film, 'explicit-source-year-and-cast-tail', false)
  }
  const englishMovie = raw.match(englishFullMovie)
  if (englishMovie) {
    const film = tidy(englishMovie[1])
    return researchQueries(legacy, film, film,
      'english-genre-and-full-movie-tail')
  }
  const imdbTail = raw.match(imdbDescriptionTail)
  if (imdbTail) {
    const film = tidy(imdbTail[1])
    return researchQueries(legacy, film, film, 'imdb-description-tail')
  }
  const actorTail = raw.match(actorAndFullFilmTail)
  if (actorTail) {
    const film = tidy(actorTail[1])
    return researchQueries(legacy, film, film,
      'genre-actor-and-full-film-tail')
  }
  const germanAlias = raw.match(germanNuremberg)
  if (germanAlias) {
    // Keep the video source title intact. 2026 may mean DE cinema release,
    // not the source film production date: do not invent a year match.
    return {...legacy, matchingTitle:'Nuremberg',
      queries:['Nuremberg', 'Nürnberg'],
      curatedQueryReason:'official-original-title-alias-release-year-review',
      reportedYear:Number(germanAlias[1])}
  }
  const collection = raw.match(oldGermanMovies)
  if (collection) {
    const title = tidy(collection[1])
    const year = Number(collection[2])
    if (title.length >= 4 && year >= 1888 && year <= 2100) {
      return {
        ...legacy, matchingTitle: title + ' (' + year + ')',
        queries: [title],
        curatedQueryReason: 'explicit-german-movie-collection-label-with-year',
      }
    }
  }
  if (promotionalFullMovieInHd.test(raw)) {
    const cleaned = tidy(legacy.matchingTitle.replace(hdSuffix, ''))
    if (cleaned.length >= 4 && cleaned !== legacy.matchingTitle) {
      return {
        ...legacy, matchingTitle: cleaned,
        // Check the cleaned film-title query first, fallback to the original
        // promotional search only once. Maximum remains 2 queries per video.
        queries: [cleaned, ...legacy.queries.filter(x => tidy(x) !== cleaned)].slice(0, 2),
        curatedQueryReason: 'remove-promotional-hd-suffix',
      }
    }
  }
  return {...legacy, curatedQueryReason: null}
}
