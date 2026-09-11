import { useEffect, useMemo, useState } from 'react'
import {
  SEARCH_MIN_QUERY_LENGTH,
  buildSearchIndexEntries,
  mergeSearchIndexEntries,
  searchIndex,
} from '../search/searchIndex.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import PosterCard from './PosterCard.jsx'

export default function SearchView({ publicTitles, personalTitles, fullTitles, onOpen }) {
  const [query, setQuery] = useState('')
  const [remoteEntries, setRemoteEntries] = useState(null)
  const [indexLoading, setIndexLoading] = useState(true)
  const [indexError, setIndexError] = useState(null)
  const { enabledProviderIds } = useProviderSelection()

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
  const entries = useMemo(
    () => mergeSearchIndexEntries(publicEntries, personalEntries),
    [publicEntries, personalEntries],
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

  function openEntry(entry) {
    onOpen(fullById.get(entry.id) || entry)
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
          {searchResult.results.map((item) => <PosterCard key={item.id} item={item} onOpen={openEntry} />)}
        </div>
      )}
    </main>
  )
}
