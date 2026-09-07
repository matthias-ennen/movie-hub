import { useEffect, useRef, useState } from 'react'
import { getProviderDestination, providers } from '../data/catalog.js'
import { useLibrary } from '../library/LibraryProvider.jsx'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { ProviderBadge } from './ProviderBadges.jsx'

export default function DetailModal({ item, onClose }) {
  const { activeProfile } = useProfiles()
  const { getTitleState, updateTitleState, loading: libraryLoading } = useLibrary()
  const [personalMessage, setPersonalMessage] = useState('')
  const [personalBusy, setPersonalBusy] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const returnFocusRef = useRef(null)
  const providerIds = Array.isArray(item.providerIds) ? item.providerIds : []
  const hasProviders = providerIds.length > 0
  const cast = Array.isArray(item.cast) ? item.cast.slice(0, 5) : []
  const personalState = getTitleState(item)

  useEffect(() => {
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement ? active : null

    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector('[data-detail-autofocus="true"]')
      target?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      const returnTarget = returnFocusRef.current
      if (returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }))
      }
    }
  }, [item.id])

  useEffect(() => {
    setNoteDraft(personalState.note)
    setPersonalMessage('')
  }, [activeProfile?.id, item.id, personalState.note])

  if (!item) return null

  async function savePersonalPatch(patch, message) {
    setPersonalBusy(true)
    setPersonalMessage('')
    try {
      await updateTitleState(item, patch)
      setPersonalMessage(message)
    } catch (error) {
      console.error(error)
      setPersonalMessage('Persönliche Einstellung konnte nicht gespeichert werden.')
    } finally {
      setPersonalBusy(false)
    }
  }

  async function handleSaveNote(event) {
    event.preventDefault()
    await savePersonalPatch({ note: noteDraft }, 'Notiz gespeichert.')
  }

  function openProvider(providerId) {
    const destination = getProviderDestination(providerId, item.title)
    if (!destination) return

    // The Android shell exposes only a host-whitelisted external browser
    // fallback here. Provider-specific app deep links are a later step.
    if (window.MovieHubNative?.openExternalUrl) {
      window.MovieHubNative.openExternalUrl(destination)
      return
    }

    window.open(destination, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label={`Details zu ${item.title}`}>
        <div className={item.posterUrl ? 'detail-art has-image' : 'detail-art'} style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
          {item.posterUrl && <img className="detail-art-image" src={item.posterUrl} alt="" />}
          <span className="detail-type">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
          <span className="detail-art-title">{item.title}</span>
        </div>
        <div className="detail-copy">
          <button
            className="icon-button detail-close"
            type="button"
            onClick={onClose}
            data-focusable="true"
            aria-label="Details schließen"
          >×</button>
          <p className="eyebrow">Movie Hub · {item.source === 'tmdb' ? 'TMDB' : 'Testdaten'}</p>
          <h2>{item.title}</h2>
          <div className="meta-line"><strong>{item.score}</strong><span>{item.year || '–'}</span><span>{item.meta}</span></div>
          <p className="genre">{item.genre}</p>
          <p className="detail-description">{item.description || 'Für diesen Titel liegt noch keine deutsche Beschreibung vor.'}</p>
          {cast.length > 0 && (
            <div className="cast-block">
              <h3>Besetzung</h3>
              <p>{cast.map((person) => person.name).join(' · ')}</p>
            </div>
          )}

          <section className="personal-title-state" aria-labelledby="personal-title-state-heading">
            <div className="personal-title-state-heading">
              <div>
                <p className="settings-kicker">{activeProfile?.displayName ?? 'Profil'}</p>
                <h3 id="personal-title-state-heading">Meine Einstellungen</h3>
              </div>
              {personalState.rating && <span className="personal-rating-summary">{personalState.rating}/10</span>}
            </div>

            <div className="personal-action-grid">
              <button
                type="button"
                className={personalState.favorite ? 'personal-action active' : 'personal-action'}
                aria-pressed={personalState.favorite}
                onClick={() => savePersonalPatch(
                  { favorite: !personalState.favorite },
                  personalState.favorite ? 'Aus Favoriten entfernt.' : 'Zu Favoriten hinzugefügt.',
                )}
                disabled={personalBusy || libraryLoading}
                data-focusable="true"
                data-detail-autofocus="true"
              >
                <span aria-hidden="true">♥</span>
                <span>{personalState.favorite ? 'Favorit' : 'Als Favorit'}</span>
              </button>
              <button
                type="button"
                className={personalState.watchlist ? 'personal-action active' : 'personal-action'}
                aria-pressed={personalState.watchlist}
                onClick={() => savePersonalPatch(
                  { watchlist: !personalState.watchlist },
                  personalState.watchlist ? 'Aus der Watchlist entfernt.' : 'Für später gemerkt.',
                )}
                disabled={personalBusy || libraryLoading}
                data-focusable="true"
              >
                <span aria-hidden="true">＋</span>
                <span>{personalState.watchlist ? 'Watchlist' : 'Später ansehen'}</span>
              </button>
              <button
                type="button"
                className={personalState.watched ? 'personal-action active' : 'personal-action'}
                aria-pressed={personalState.watched}
                onClick={() => savePersonalPatch(
                  { watched: !personalState.watched },
                  personalState.watched ? 'Als ungesehen markiert.' : 'Als gesehen markiert.',
                )}
                disabled={personalBusy || libraryLoading}
                data-focusable="true"
              >
                <span aria-hidden="true">✓</span>
                <span>{personalState.watched ? 'Gesehen' : 'Als gesehen'}</span>
              </button>
            </div>

            <div className="personal-rating-block">
              <span>Meine Bewertung</span>
              <div className="personal-rating-buttons" aria-label="Persönliche Bewertung von 1 bis 10">
                {Array.from({ length: 10 }, (_, index) => index + 1).map((rating) => (
                  <button
                    type="button"
                    key={rating}
                    className={personalState.rating === rating ? 'rating-button active' : 'rating-button'}
                    aria-pressed={personalState.rating === rating}
                    onClick={() => savePersonalPatch(
                      { rating: personalState.rating === rating ? null : rating },
                      personalState.rating === rating ? 'Bewertung entfernt.' : `Mit ${rating}/10 bewertet.`,
                    )}
                    disabled={personalBusy || libraryLoading}
                    data-focusable="true"
                  >{rating}</button>
                ))}
              </div>
            </div>

            {personalState.watched && (
              <label className="watched-date-control">
                Gesehen am
                <input
                  type="date"
                  value={personalState.watchedAt ?? ''}
                  onChange={(event) => savePersonalPatch({ watched: true, watchedAt: event.target.value || null }, 'Gesehen-Datum gespeichert.')}
                  disabled={personalBusy || libraryLoading}
                  data-focusable="true"
                />
              </label>
            )}

            <form className="personal-note-form" onSubmit={handleSaveNote}>
              <label>
                Persönliche Notiz
                <textarea
                  value={noteDraft}
                  maxLength={500}
                  rows={3}
                  placeholder="Optional – nur in diesem Movie-Hub-Profil"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  data-focusable="true"
                />
              </label>
              <button type="submit" disabled={personalBusy || libraryLoading || noteDraft === personalState.note} data-focusable="true">Notiz speichern</button>
            </form>

            {personalMessage && <p className="personal-state-message" role="status">{personalMessage}</p>}
          </section>

          <h3>Wo ansehen?</h3>
          {hasProviders ? (
            <div className="provider-actions">
              {providerIds.map((providerId) => {
                const provider = providers[providerId]
                if (!provider) return null
                return (
                  <button
                    type="button"
                    key={providerId}
                    className="action-button provider-action"
                    data-focusable="true"
                    onClick={() => openProvider(providerId)}
                    aria-label={`${provider.label} öffnen`}
                  >
                    <ProviderBadge providerId={providerId} />
                    {provider.label}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="prototype-note">Für diesen Titel ist derzeit kein unterstützter Anbieter in Deutschland hinterlegt.</p>
          )}
          {hasProviders && <p className="prototype-note">Der gewählte Anbieter wird außerhalb von Movie Hub geöffnet.</p>}
          {item.tmdbId && <p className="tmdb-credit">Datenquelle: TMDB · ID {item.tmdbId}</p>}
        </div>
      </section>
    </div>
  )
}
