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
  if (seed?.mediaType !== 'movie' || !local) throw Error('MOVIEHUB_MOVIE_SEED_REQUIRED')
  // Canonical TMDB movie details are fetched by exact TMDB ID before discovery.
  // A stale public-index year must not poison a one-search budget (for example,
  // TMDB 15 Citizen Kane: public seed 1962 versus TMDB release year 1941).
  const release = String(tmdbFilm?.release_date ?? '')
  const tmdbYear = /^([12]\d{3})-\d{2}-\d{2}$/.test(release)
    ? Number(release.slice(0, 4)) : null
  const seedYear = Number(seed?.year)
  const validYear = n => Number.isInteger(n) && n >= 1888 && n <= 2100
  const effectiveYear = validYear(tmdbYear) ? tmdbYear
    : validYear(seedYear) ? seedYear : null
  const sourceYear = effectiveYear === null ? '' : String(effectiveYear)
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
