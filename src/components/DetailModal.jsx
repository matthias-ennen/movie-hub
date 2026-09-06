import { useEffect, useRef, useState } from 'react'
import { providers } from '../data/catalog.js'
import { ProviderBadge } from './ProviderBadges.jsx'

export default function DetailModal({ item, onClose }) {
  const [providerMessage, setProviderMessage] = useState('')
  const returnFocusRef = useRef(null)

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
        <div className="detail-art" style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
          <span className="detail-type">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
          <span className="detail-art-title">{item.title}</span>
        </div>
        <div className="detail-copy">
          <button className="icon-button detail-close" type="button" onClick={onClose} data-focusable="true" aria-label="Details schließen">×</button>
          <p className="eyebrow">Movie Hub · Testdaten</p>
          <h2>{item.title}</h2>
          <div className="meta-line"><strong>{item.score}</strong><span>{item.year}</span><span>{item.meta}</span></div>
          <p className="genre">{item.genre}</p>
          <p className="detail-description">{item.description}</p>
          <h3>Wo ansehen?</h3>
          <div className="provider-actions">
            {item.providerIds.map((providerId, index) => (
              <button
                type="button"
                key={providerId}
                className="action-button provider-action"
                data-focusable="true"
                data-detail-autofocus={index === 0 ? 'true' : undefined}
                onClick={() => setProviderMessage(`${providers[providerId].label}: direkter Start folgt in Phase 4.`)}
              >
                <ProviderBadge providerId={providerId} />
                {providers[providerId].label}
              </button>
            ))}
          </div>
          {providerMessage && <p className="prototype-note">{providerMessage}</p>}
        </div>
      </section>
    </div>
  )
}
