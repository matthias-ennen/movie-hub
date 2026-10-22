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

export function planCuratedTmdbQueries(sourceTitle) {
  const raw = tidy(sourceTitle)
  const legacy = prepareYouTubeMovieSearchTitle(raw)
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
