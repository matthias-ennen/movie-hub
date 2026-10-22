/**
 * MovieHub TMDB-first YouTube discovery: two complementary searches per work.
 * A broader second query increases discovery only; it NEVER weakens the
 * canonical video/film identity matcher or verifies a DE offering.
 */
function normal(v) {
  return String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase()
}
const clean = v => String(v ?? '').replace(/[\r\n<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
const params = (q, type) => ({
  part: 'snippet', type: 'video', regionCode: 'DE',
  maxResults: 10, order: 'relevance', q,
  ...(type === 'movie' ? { videoType: 'movie' } : { videoDuration: 'long' }),
})

/** Two searches, not 2 + more implicit fallbacks. Cost stays 2 search calls/title. */
export function planTmdbFirstYoutubeQueries(seed, tmdbFilm) {
  const local = clean(seed?.title)
  const year = Number(seed?.year)
  if (seed?.mediaType !== 'movie' || !local) throw Error('MOVIEHUB_MOVIE_SEED_REQUIRED')
  const sourceYear = Number.isInteger(year) && year >= 1888 && year <= 2100
    ? String(year) : ''
  // Use TMDB original title to catch translated DE title, otherwise search
  // the same title without year to catch YouTube shop titles that omit it.
  const original = clean(tmdbFilm?.original_title)
    || clean(seed?.originalTitle)
    || local
  const alternate = original && normal(original) !== normal(local) ? original : local
  const initial = [local, sourceYear].filter(Boolean).join(' ')
  return Object.freeze([
    Object.freeze(params(initial, 'movie')),
    Object.freeze(params(alternate, 'long')),
  ])
}
