import { useEffect, useMemo, useState } from 'react'
import { useSharedMediaCatalog } from '../library/useSharedMediaCatalog.js'
import {
  SEARCH_MIN_QUERY_LENGTH,
  buildSearchIndexEntries,
  mergeSearchIndexEntries,
  searchIndex,
} from '../search/searchIndex.js'
import { loadCompleteTitleMetadata } from '../catalog/loadCompleteTitleMetadata.js'
import { mergeLiveAiringStatus } from '../search/searchLiveAiringStatus.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import PosterCard from './PosterCard.jsx'

function mergePublicEntries(...sources) {
  const entries = new Map()
  for (const source of sources) {
    for (const item of Array.isArray(source) ? source : []) {
      if (!item?.id) continue
      const current = entries.get(item.id)
      entries.set(item.id, current
        ? {
            ...current,
            ...item,
            scope: 'public',
            providerIds: [...new Set([...(current.providerIds || []), ...(item.providerIds || [])])],
            providerOffers: [...(current.providerOffers || []), ...(item.providerOffers || [])],
          }
        : { ...item, scope: 'public' })
    }
  }
  return [...entries.values()]
}

export default function SearchView({ publicTitles, personalTitles, movieHubTitles = [], fullTitles, onOpen }) {
  const [query, setQuery] = useState('')
  const [remoteEntries, setRemoteEntries] = useState(null)
  const [indexLoading, setIndexLoading] = useState(true)
  const [indexError, setIndexError] = useState(null)
  const [detailLoadingId, setDetailLoadingId] = useState(null)
  const [detailError, setDetailError] = useState(null)
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
        setRemoteEntries(payload.entries)
        setIndexError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setRemoteEntries(null)
        setIndexError(error)
      })
      .finally(() => {
        if (!cancelled) setIndexLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const publicEntries = useMemo(
    () => remoteEntries ?? buildSearchIndexEntries(publicTitles, { scope: 'public' }),
    [remoteEntries, publicTitles],
  )
  const personalEntries = useMemo(
    () => buildSearchIndexEntries(personalTitles, { scope: 'personal' }),
    [personalTitles],
  )
  const movieHubEntries = useMemo(
    () => buildSearchIndexEntries(movieHubTitles, { scope: 'public' }),
    [movieHubTitles],
  )
  const entries = useMemo(
    () => mergeLiveAiringStatus(mergeSearchIndexEntries(
      mergePublicEntries(publicEntries, movieHubEntries),
      personalEntries,
    ), fullTitles),
    [publicEntries, movieHubEntries, personalEntries, fullTitles],
  )
  const fullById = useMemo(
    () => new Map((Array.isArray(fullTitles) ? fullTitles : []).map((title) => [title.id, title])),
    [fullTitles],
  )
  const searchResult = useMemo(
    () => searchIndex(entries, query, { enabledProviderIds }),
    [entries, query, enabledProviderIds],
  )
  const normalizedLength = query.trim().length

  async function openEntry(entry, displayedPosterUrl = null) {
    const fullTitle = fullById.get(entry.id)
    if (fullTitle) {
      onOpen(fullTitle, displayedPosterUrl)
      return
    }

    setDetailLoadingId(entry.id)
    setDetailError(null)
    try {
      const detail = await loadCompleteTitleMetadata(entry, {
        requireContract: true,
        requireComplete: true,
      })
      onOpen(detail, displayedPosterUrl)
    } catch (error) {
      console.warn('Movie Hub konnte die vollständigen Suchdetails nicht laden.', error)
      setDetailError({ entry, displayedPosterUrl })
    } finally {
      setDetailLoadingId(null)
    }
  }

  if (detailLoadingId) {
    return (
      <main className="browse-page search-page search-detail-state" aria-live="polite">
        <p className="loading-copy">Details werden geladen …</p>
      </main>
    )
  }

  if (detailError) {
    return (
      <main className="browse-page search-page search-detail-state" role="alert">
        <section className="library-empty-state">
          <p className="settings-kicker">Details nicht erreichbar</p>
          <h2>Die vollständigen Titeldetails konnten nicht geladen werden.</h2>
          <p>Prüfe deine Verbindung und den TMDB API Read Access Token in den Einstellungen.</p>
          <button
            type="button"
            className="action-button action-button-primary"
            data-focusable="true"
            onClick={() => openEntry(detailError.entry, detailError.displayedPosterUrl)}
          >
            Erneut versuchen
          </button>
          <button
            type="button"
            className="action-button action-button-secondary"
            data-focusable="true"
            onClick={() => setDetailError(null)}
          >
            Zurück zur Suche
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="browse-page search-page">
      <div className="page-heading">
        <p className="eyebrow">Schnell finden</p>
        <h1>Suche</h1>
        <p>Durchsuche den separaten Movie-Hub-Suchindex. Angezeigt werden nur Anbieter, die du in den Einstellungen aktiviert hast; persönliche TMDB-Titel bleiben unabhängig davon auffindbar.</p>
      </div>
      <label className="search-box">
        <span>⌕</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Film oder Serie suchen …"
          aria-label="Filme und Serien suchen"
          data-focusable="true"
        />
      </label>

      {normalizedLength < SEARCH_MIN_QUERY_LENGTH ? (
        <p className="result-count">Mindestens {SEARCH_MIN_QUERY_LENGTH} Zeichen eingeben.</p>
      ) : (
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
          <p>Prüfe den Titel oder aktiviere weitere Streaminganbieter in den Einstellungen.</p>
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
