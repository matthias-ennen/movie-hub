import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export default function TitleWatchSettingsView({ profileName, items, ready, error, onDisable }) {
  const panel = useRef(null)
  const heading = useRef(null)
  const focused = useRef(null)
  const pending = useRef(false)
  const [saving, setSaving] = useState(null)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    const trackOutsideFocus = (event) => {
      if (event.target !== document.body && !panel.current?.contains(event.target)) focused.current = null
    }
    document.addEventListener('focusin', trackOutsideFocus)
    return () => document.removeEventListener('focusin', trackOutsideFocus)
  }, [])

  useLayoutEffect(() => {
    const previous = focused.current
    if (!previous || previous.element.isConnected) return
    // A local cancellation or completion on another device removed this row.
    // Keep D-pad users in the list without taking focus from another control.
    if (document.activeElement !== document.body && !panel.current?.contains(document.activeElement)) return
    const buttons = panel.current?.querySelectorAll('[data-watch-action]') || []
    const target = buttons[Math.min(previous.index, buttons.length - 1)] || heading.current
    focused.current = null
    target?.focus({ preventScroll: true })
  }, [items])

  async function disable(watch) {
    if (pending.current) return
    pending.current = true
    setSaving(watch.id)
    setSaveError('')
    try { await onDisable(watch) }
    catch (cause) {
      setSaveError(cause?.message?.startsWith('Die Beobachtung wurde')
        ? cause.message : 'Beobachtung konnte nicht ausgeschaltet werden. Bitte versuche es erneut.')
    } finally {
      pending.current = false
      setSaving(null)
    }
  }

  return (
    <section ref={panel} className="settings-panel title-watch-panel" aria-labelledby="title-watch-heading">
      <div className="settings-heading">
        <div>
          <p className="settings-kicker">Aktives Profil · {profileName || 'Mein Profil'}</p>
          <h2 id="title-watch-heading" ref={heading} tabIndex={-1}>Mitteilungen</h2>
        </div>
        <span className="settings-status">{!ready ? 'Wird geladen …' : error ? 'Nicht verfügbar' : `${items.length} aktiv`}</span>
      </div>
      <p className="settings-description">Hier verwaltest du deine aktiven Beobachtungen. Neue Erinnerungen aktivierst du direkt beim Film oder bei der Serie unter „Benachrichtigen“.</p>
      {!ready && <p className="settings-hint" role="status">Beobachtungen werden geladen …</p>}
      {error && <p className="error" role="status">{error}</p>}
      {ready && !error && items.length === 0 && <p className="settings-hint" role="status">Du hast aktuell keine aktiven Beobachtungen.</p>}
      {ready && !error && items.length > 0 && (
        <div className="personal-row-settings-list title-watch-list" aria-label="Aktive Beobachtungen">
          {items.map((watch, index) => {
            const kind = watch.kind === 'tv' ? 'Wenn im TV' : watch.kind === 'available' ? 'Wenn verfügbar' : 'Wenn inklusive'
            return (
              <article key={`${watch.id}:${watch.activationId}`} className="personal-row-setting title-watch-row">
                <div className="personal-row-setting-copy">
                  <strong>{watch.title}</strong>
                  <span>{watch.type === 'series' ? 'Serie' : 'Film'} · {kind}</span>
                  <span className="title-watch-schedule">{watch.statusText}</span>
                </div>
                <div className="personal-row-setting-actions">
                  <button type="button" className="personal-row-toggle active" role="switch"
                    aria-checked="true" aria-label={`${watch.title}: ${kind} ausschalten`}
                    aria-disabled={Boolean(saving)} aria-busy={saving === watch.id}
                    data-watch-action="disable" data-focusable="true"
                    onFocus={(event) => { focused.current = { index, element: event.currentTarget } }}
                    onClick={() => disable(watch)}>
                    <span>{saving === watch.id ? 'Speichert …' : 'An'}</span>
                    <span className="category-choice-switch active" aria-hidden="true"><span /></span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {saveError && <p className="error" role="status">{saveError}</p>}
    </section>
  )
}
