import { useState } from 'react'

export function BellButton({ unreadCount, active, onClick }) {
  return (
    <button type="button" className={active ? 'icon-button notification-bell active' : 'icon-button notification-bell'}
      onClick={onClick} data-focusable="true" aria-label={`Mitteilungen, ${unreadCount} ungelesen`}>
      <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
      </svg>
      {unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
  )
}

export function AnnouncementsView({ items, readIds, ready, error, onRead }) {
  const [pending, setPending] = useState(null)
  const [readError, setReadError] = useState('')
  async function open(item) {
    if (readIds.has(item.id) || pending === item.id) return
    setPending(item.id)
    try { await onRead(item.id); setReadError('') }
    catch { setReadError('Lesestatus konnte nicht gespeichert werden. Bitte erneut versuchen.') }
    finally { setPending(null) }
  }
  return (
    <main className="notification-page">
      <h1>Mitteilungen</h1>
      {error && <p role="alert">{error}</p>}
      {readError && <p role="alert">{readError}</p>}
      {!ready && !error && <p>Mitteilungen werden geladen …</p>}
      {ready && items.length === 0 && <p>Du hast aktuell keine Mitteilungen.</p>}
      <div className="notification-list">
        {items.map((item) => (
          <button type="button" key={item.id} data-focusable="true" className={readIds.has(item.id) ? 'notification-item' : 'notification-item unread'} onClick={() => open(item)}>
            <span className="notification-item-heading">{item.title}{!readIds.has(item.id) && <span className="notification-dot" aria-label="Ungelesen" />}</span>
            <span className="notification-body">{item.body}</span>
            <span className="notification-date">{item.startsAt.toDate().toLocaleDateString('de-DE')}</span>
          </button>
        ))}
      </div>
    </main>
  )
}

export function StartupAnnouncement({ item, error, onConfirm, onDismiss }) {
  const [pending, setPending] = useState(false)
  async function confirm() {
    if (pending) return
    setPending(true)
    try { await onConfirm(item.id) } finally { setPending(false) }
  }
  return (
    <div className="notification-overlay" role="presentation">
      <section className="notification-dialog" data-announcement-id={item.id} role="dialog" aria-modal="true" aria-labelledby="startup-announcement-title">
        <h2 id="startup-announcement-title">{item.title}</h2>
        <p>{item.body}</p>
        {error && <p role="alert">{error}</p>}
        <div className="notification-dialog-actions">
          <button type="button" data-focusable="true" onClick={onDismiss}>Später</button>
          <button type="button" data-focusable="true" autoFocus disabled={pending} onClick={confirm}>OK, gelesen</button>
        </div>
      </section>
    </div>
  )
}
