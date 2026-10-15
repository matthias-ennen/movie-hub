import { useEffect, useMemo, useState } from 'react'
import { useSharedMediaCatalog } from '../library/useSharedMediaCatalog.js'
import { getTitleStateKey } from '../library/libraryState.js'
import {
  SEARCH_MIN_QUERY_LENGTH,
  searchIndex,
} from '../search/searchIndex.js'
import { buildSearchCatalog } from '../search/searchCatalog.js'
import { buildActorSearchIndex } from '../search/searchActors.js'
import { mergeLiveAiringStatus } from '../search/searchLiveAiringStatus.js'
import { enrichSearchPosterEntries } from '../search/searchPosterEvidence.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import PosterCard from './PosterCard.jsx'

export default function SearchView({ metadataTitles, personalTitles, statesByKey, actorNames, fullTitles, onOpen }) {
  const [query, setQuery] = useState('')
  const [remoteIndex, setRemoteIndex] = useState(null)
  const [indexLoading, setIndexLoading] = useState(true)
  const [indexError, setIndexError] = useState(null)
  const { enabledProviderIds, isProviderEnabled } = useProviderSelection()
  const { hasTitle: hasMovieHubTitle } = useSharedMediaCatalog()
  const movieHubEnabled = isProviderEnabled('moviehub')

  useEffect(() => {
    let cancelled = false

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
    () => buildSearchCatalog({ remoteIndex, metadataTitles, personalTitles, statesByKey, actorNames }),
    [remoteIndex, metadataTitles, personalTitles, statesByKey, actorNames],
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
    () => new Map((Array.isArray(fullTitles) ? fullTitles : []).map((title) => [getTitleStateKey(title), title])),
    [fullTitles],
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
        <div className="poster-grid">
          {searchResult.results.map((item) => (
            <PosterCard
              key={item.id}
              item={item}
              onOpen={openEntry}
              hasMovieHub={movieHubEnabled && hasMovieHubTitle(item)}
            />
          ))}
        </div>
      )}
    </main>
  )
}
