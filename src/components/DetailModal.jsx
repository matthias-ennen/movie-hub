import { useEffect, useRef, useState } from 'react'
import { providers } from '../data/catalog.js'
import { ProviderBadge } from './ProviderBadges.jsx'

export default function DetailModal({ item, onClose }) {
  const [providerMessage, setProviderMessage] = useState('')
  const returnFocusRef = useRef(null)
  const providerIds = Array.isArray(item.providerIds) ? item.providerIds : []
  const hasProviders = providerIds.length > 0
  const cast = Array.isArray(item.cast) ? item.cast.slice(0, 5) : []

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

  if (!item) return null

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
            data-detail-autofocus={!hasProviders ? 'true' : undefined}
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
          <h3>Wo ansehen?</h3>
          {hasProviders ? (
            <div className="provider-actions">
              {providerIds.map((providerId, index) => {
                const provider = providers[providerId]
                if (!provider) return null
                return (
                  <button
                    type="button"
                    key={providerId}
                    className="action-button provider-action"
                    data-focusable="true"
                    data-detail-autofocus={index === 0 ? 'true' : undefined}
                    onClick={() => setProviderMessage(`${provider.label}: direkter Start folgt in Phase 4.`)}
                  >
                    <ProviderBadge providerId={providerId} />
                    {provider.label}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="prototype-note">Streaming-Verfügbarkeit und direkter Start werden in einer späteren Phase an echte Provider-Daten angebunden.</p>
          )}
          {providerMessage && <p className="prototype-note">{providerMessage}</p>}
          {item.tmdbId && <p className="tmdb-credit">Datenquelle: TMDB · ID {item.tmdbId}</p>}
        </div>
      </section>
    </div>
  )
}
