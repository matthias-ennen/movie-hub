import { useEffect, useMemo, useState } from 'react'
import { getTitleStateKey } from '../library/libraryState.js'
import {
  SEARCH_MIN_QUERY_LENGTH,
  searchIndex,
} from '../search/searchIndex.js'
import { buildSearchCatalog, mergeYoutubeCuratedSearchTitles } from '../search/searchCatalog.js'
import { YOUTUBE_NEW_FILMS_PUBLIC_URL } from '../catalog/youtubeCuratedNewFilms.js'
import { YOUTUBE_SEARCH_TITLES_PUBLIC_URL } from '../catalog/youtubeCuratedSearchTitles.js'
import { buildActorSearchIndex } from '../search/searchActors.js'
import { mergeLiveAiringStatus } from '../search/searchLiveAiringStatus.js'
import { enrichSearchPosterEntries } from '../search/searchPosterEvidence.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import { ProgressivePosterGrid } from './ProgressiveContent.jsx'

export default function SearchView({ metadataTitles, personalTitles, statesByKey, actorNames, fullTitles, onOpen }) {
  const [query, setQuery] = useState('')
  const [remoteIndex, setRemoteIndex] = useState(null)
  const [curatedYoutubeFeed, setCuratedYoutubeFeed] = useState(null)
  const [curatedYoutubeSearchTitleFeed, setCuratedYoutubeSearchTitleFeed] = useState(null)
  const [indexLoading, setIndexLoading] = useState(true)
  const [indexError, setIndexError] = useState(null)
  const { enabledProviderIds } = useProviderSelection()

  useEffect(() => {
    let cancelled = false

    // The public search index is generated before some YouTube metadata
    // companions. Refresh the companion here independently from the App's
    // initial catalog load, including on an already-running Android/Fire TV app.
    fetch(YOUTUBE_NEW_FILMS_PUBLIC_URL, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((feed) => { if (!cancelled) setCuratedYoutubeFeed(feed) })
      .catch(() => { if (!cancelled) setCuratedYoutubeFeed(null) })

    // Durable search coverage: a previously new film must not vanish when
    // a profile later syncs the same canonical movie from TMDB.
    fetch(YOUTUBE_SEARCH_TITLES_PUBLIC_URL, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((feed) => { if (!cancelled) setCuratedYoutubeSearchTitleFeed(feed) })
      .catch(() => { if (!cancelled) setCuratedYoutubeSearchTitleFeed(null) })

    fetch('/search-index.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Suchindex konnte nicht geladen werden (${response.status})`)
        return response.json()
      })
      .then((payload) => {
        if (cancelled) return
        if (!Array.isArray(payload?.entries)) throw new Error('Suchindex hat ein ungültiges Format.')
        setRemoteIndex(payload)
        setIndexError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setRemoteIndex(null)
        setIndexError(error)
      })
      .finally(() => {
        if (!cancelled) setIndexLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const searchCatalog = useMemo(
    () => buildSearchCatalog({
      remoteIndex, metadataTitles, personalTitles, statesByKey, actorNames,
      curatedYoutubeFeed, curatedYoutubeSearchTitleFeed,
    }),
    [remoteIndex, metadataTitles, personalTitles, statesByKey, actorNames,
      curatedYoutubeFeed, curatedYoutubeSearchTitleFeed],
  )
  const actorIndex = useMemo(
    () => buildActorSearchIndex(searchCatalog.entries, searchCatalog.actors),
    [searchCatalog],
  )
  const entries = useMemo(
    () => enrichSearchPosterEntries(mergeLiveAiringStatus(searchCatalog.entries, fullTitles), fullTitles),
    [searchCatalog, fullTitles],
  )
  const fullByKey = useMemo(
    () => new Map(mergeYoutubeCuratedSearchTitles(
      mergeYoutubeCuratedSearchTitles(fullTitles, curatedYoutubeFeed),
      curatedYoutubeSearchTitleFeed,
    ).map((title) => [getTitleStateKey(title), title])),
    [fullTitles, curatedYoutubeFeed, curatedYoutubeSearchTitleFeed],
  )
  const searchResult = useMemo(
    () => searchIndex(entries, query, { enabledProviderIds, actorIndex }),
    [entries, query, enabledProviderIds, actorIndex],
  )
  const normalizedLength = query.trim().length

  function openEntry(entry, displayedPosterUrl = null) {
    const fullTitle = fullByKey.get(getTitleStateKey(entry))
    if (fullTitle) {
      onOpen(fullTitle, displayedPosterUrl)
      return
    }

    onOpen(entry, displayedPosterUrl, { requireComplete: true })
  }

  return (
    <main className="browse-page search-page">
      <h1 className="eyebrow page-section-heading">Suchen</h1>
      <label className="search-box">
        <span>⌕</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Titel oder Schauspieler suchen …"
          aria-label="Filme, Serien oder Schauspieler suchen"
          data-focusable="true"
        />
      </label>

      {normalizedLength >= SEARCH_MIN_QUERY_LENGTH && (
        <p className="result-count">
          {searchResult.hasMore ? `${searchResult.results.length} von ${searchResult.total} Treffern` : `${searchResult.total} Treffer`}
        </p>
      )}

      {indexLoading && <p className="loading-copy">Suchindex wird geladen …</p>}
      {indexError && <p className="settings-hint">Der separate Suchindex ist momentan nicht erreichbar. Movie Hub verwendet vorübergehend den geladenen Katalog als Suchfallback.</p>}

      {normalizedLength >= SEARCH_MIN_QUERY_LENGTH && searchResult.results.length === 0 && !indexLoading && (
        <section className="library-empty-state">
          <p className="settings-kicker">Keine Treffer</p>
          <h2>Für diese Suche wurde nichts gefunden.</h2>
          <p>Prüfe den Titel oder Schauspielernamen oder aktiviere weitere Streaminganbieter in den Einstellungen.</p>
        </section>
      )}

      {searchResult.results.length > 0 && (
        <ProgressivePosterGrid key={query.trim().toLowerCase()} items={searchResult.results} heroReady onOpen={openEntry} />
      )}
    </main>
  )
}
