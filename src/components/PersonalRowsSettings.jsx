import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_PERSONAL_SMART_ROWS,
  PERSONAL_SMART_ROW_TYPES,
  defaultPersonalSmartRowTitle,
  getPersonalSmartRowMatchCount,
  normalizePersonalSmartRowSettings,
  normalizeSmartFilterOptions,
} from '../catalog/personalSmartRows.js'
import { useProfiles } from '../profiles/ProfileProvider.jsx'

function newRowId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function PersonalRowsSettings({ titles = [], filterOptions = {} }) {
  const { activeProfile, updateActiveProfileContentRowSettings } = useProfiles()
  const settings = normalizePersonalSmartRowSettings(activeProfile?.contentRowSettings)
  const options = useMemo(() => normalizeSmartFilterOptions(filterOptions), [filterOptions])
  const panelRef = useRef(null)
  const busyRef = useRef(false)
  const [editingId, setEditingId] = useState(null)
  const [type, setType] = useState('cast')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState(null)
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => {
    setEditingId(null)
    setType('cast')
    setQuery('')
    setSelected(null)
    setTitle('')
    setMessage('')
    setConfirmDeleteId(null)
  }, [activeProfile?.id])

  const focusTarget = useCallback((target) => {
    const focus = () => {
      const panel = panelRef.current
      if (!panel) return

      function findTarget(entry) {
        if (entry?.kind === 'editor') {
          return panel.querySelector('[data-personal-row-editor-autofocus="true"]')
        }
        if (entry?.kind === 'add') {
          return panel.querySelector('[data-personal-row-add="true"]')
        }
        if (entry?.rowId) {
          const row = [...panel.querySelectorAll('[data-personal-row-id]')]
            .find((element) => element.dataset.personalRowId === entry.rowId)
          const actions = Array.isArray(entry.actions) ? entry.actions : [entry.action]
          return actions
            .map((action) => row?.querySelector(`[data-personal-row-action="${action}"]`))
            .find((element) => element && !element.disabled)
        }
        return null
      }

      const targets = Array.isArray(target) ? target : [target]
      const candidate = targets.map(findTarget).find((element) => element && !element.disabled)
      if (!candidate || candidate.disabled) return
      candidate.focus({ preventScroll: true })
      candidate.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }

    window.requestAnimationFrame(() => window.requestAnimationFrame(focus))
  }, [])

  useEffect(() => {
    if (editingId !== null) focusTarget({ kind: 'editor' })
  }, [editingId, focusTarget])

  const typeDefinition = PERSONAL_SMART_ROW_TYPES.find((entry) => entry.id === type)
  const visibleOptions = useMemo(() => {
    const available = options[type] || []
    if (type === 'decade') return available
    const normalizedQuery = query.trim().toLocaleLowerCase('de')
    if (normalizedQuery.length < 2) return []
    return available.filter((option) => option.label.toLocaleLowerCase('de').includes(normalizedQuery)).slice(0, 12)
  }, [options, query, type])

  function resetForm(clearMessage = true) {
    setEditingId(null)
    setType('cast')
    setQuery('')
    setSelected(null)
    setTitle('')
    if (clearMessage) setMessage('')
  }

  function startAdd() {
    if (busyRef.current) return
    resetForm()
    setEditingId('new')
  }

  function cancelForm() {
    if (busyRef.current) return
    const returnTarget = editingId === 'new'
      ? { kind: 'add' }
      : { rowId: editingId, actions: ['edit', 'toggle'] }
    resetForm()
    focusTarget(returnTarget)
  }

  function startEdit(row) {
    if (busyRef.current) return
    setEditingId(row.id)
    setType(row.type)
    setQuery(row.valueLabel)
    setSelected({ id: row.valueId, label: row.valueLabel })
    setTitle(row.title)
    setMessage('')
  }

  function selectOption(option) {
    setSelected(option)
    setQuery(option.label)
    setTitle(defaultPersonalSmartRowTitle(type, option.label, option.id))
  }

  async function persist(rows, successMessage, returnTarget, actionKey) {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setBusyAction(actionKey)
    setMessage('')
    try {
      await updateActiveProfileContentRowSettings({ rows })
      setMessage(successMessage)
      return true
    } catch {
      setMessage('Persönliche Reihen konnten nicht gespeichert werden.')
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
      setBusyAction(null)
      focusTarget(returnTarget)
    }
  }

  async function saveForm(event) {
    event.preventDefault()
    if (busyRef.current) return
    if (!selected) {
      setMessage('Bitte zuerst einen Vorschlag auswählen.')
      return
    }

    const duplicate = settings.rows.some((row) => (
      row.id !== editingId && row.type === type && row.valueId === Number(selected.id)
    ))
    if (duplicate) {
      setMessage('Diese persönliche Reihe ist bereits vorhanden.')
      return
    }

    const row = {
      id: editingId === 'new' ? newRowId() : editingId,
      type,
      valueId: Number(selected.id),
      valueLabel: selected.label,
      title: String(title || defaultPersonalSmartRowTitle(type, selected.label, selected.id)).trim().slice(0, 60),
      enabled: editingId === 'new'
        ? true
        : settings.rows.find((entry) => entry.id === editingId)?.enabled !== false,
    }
    const rows = editingId === 'new'
      ? [...settings.rows, row]
      : settings.rows.map((entry) => entry.id === editingId ? row : entry)
    if (await persist(
      rows,
      'Persönliche Reihe gespeichert.',
      { rowId: row.id, actions: ['toggle', 'edit'] },
      `save:${row.id}`,
    )) resetForm(false)
  }

  async function toggle(row) {
    if (busyRef.current) return
    await persist(settings.rows.map((entry) => (
      entry.id === row.id ? { ...entry, enabled: !entry.enabled } : entry
    )), row.enabled ? 'Reihe deaktiviert.' : 'Reihe aktiviert.', {
      rowId: row.id,
      actions: ['toggle', 'edit'],
    }, `toggle:${row.id}`)
  }

  async function move(row, direction) {
    if (busyRef.current) return
    const index = settings.rows.findIndex((entry) => entry.id === row.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= settings.rows.length) return
    const rows = [...settings.rows]
    ;[rows[index], rows[target]] = [rows[target], rows[index]]
    const action = direction < 0 ? 'up' : 'down'
    await persist(rows, 'Reihenfolge gespeichert.', {
      rowId: row.id,
      actions: [action, 'edit', 'toggle'],
    }, `${action}:${row.id}`)
  }

  async function remove(row) {
    if (busyRef.current) return
    if (confirmDeleteId !== row.id) {
      setConfirmDeleteId(row.id)
      setMessage(`„${row.title}“ wirklich löschen? Noch einmal Löschen wählen.`)
      return
    }
    const index = settings.rows.findIndex((entry) => entry.id === row.id)
    const remainingRows = settings.rows.filter((entry) => entry.id !== row.id)
    const neighbour = remainingRows[Math.min(index, remainingRows.length - 1)]
    const neighbourTarget = neighbour
      ? { rowId: neighbour.id, actions: ['delete', 'edit', 'toggle'] }
      : { kind: 'add' }
    const returnTargets = [
      { rowId: row.id, actions: ['delete', 'edit', 'toggle'] },
      neighbourTarget,
    ]
    if (await persist(remainingRows, 'Persönliche Reihe gelöscht.', returnTargets, `delete:${row.id}`)) {
      setConfirmDeleteId(null)
      if (editingId === row.id) resetForm()
    }
  }

  return (
    <section ref={panelRef} className="settings-panel personal-rows-settings-panel" aria-labelledby="personal-rows-settings-heading" aria-busy={busy}>
      <div className="settings-heading">
        <div>
          <p className="settings-kicker">Meine Inhalte</p>
          <h2 id="personal-rows-settings-heading">Persönliche Reihen</h2>
        </div>
        <span className="settings-status">{settings.rows.length} von {MAX_PERSONAL_SMART_ROWS} angelegt</span>
      </div>

      <p className="settings-description">
        Erstelle eigene Posterreihen aus dem aktuellen Movie-Hub-Katalog. Sie erscheinen ausschließlich unter Meine Inhalte und aktualisieren sich automatisch.
      </p>

      {settings.rows.length > 0 && (
        <div className="personal-row-settings-list">
          {settings.rows.map((row, index) => {
            const count = getPersonalSmartRowMatchCount(titles, row)
            const deleting = confirmDeleteId === row.id
            return (
              <article
                className={row.enabled ? 'personal-row-setting active' : 'personal-row-setting'}
                key={row.id}
                data-personal-row-id={row.id}
              >
                <div className="personal-row-setting-copy">
                  <strong>{row.title}</strong>
                  <span>{PERSONAL_SMART_ROW_TYPES.find((entry) => entry.id === row.type)?.label} · {row.valueLabel}</span>
                  <small>{count} {count === 1 ? 'Treffer' : 'Treffer'}{count === 0 ? ' · derzeit ausgeblendet' : ''}</small>
                </div>
                <div className="personal-row-setting-actions">
                  <button
                    type="button"
                    className={row.enabled ? 'personal-row-toggle active' : 'personal-row-toggle'}
                    onClick={() => toggle(row)}
                    role="switch"
                    aria-checked={row.enabled}
                    aria-label={`${row.title}: ${row.enabled ? 'An' : 'Aus'}`}
                    aria-disabled={busy}
                    aria-busy={busyAction === `toggle:${row.id}`}
                    data-personal-row-action="toggle"
                    data-focusable="true"
                  >
                    <span>{row.enabled ? 'An' : 'Aus'}</span>
                    <span className={row.enabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true"><span /></span>
                  </button>
                  <button type="button" onClick={() => startEdit(row)} aria-disabled={busy} data-personal-row-action="edit" data-focusable="true">Bearbeiten</button>
                  <button type="button" onClick={() => move(row, -1)} disabled={index === 0} aria-disabled={busy || index === 0} aria-busy={busyAction === `up:${row.id}`} aria-label={`${row.title} nach oben`} data-personal-row-action="up" data-focusable="true">↑</button>
                  <button type="button" onClick={() => move(row, 1)} disabled={index === settings.rows.length - 1} aria-disabled={busy || index === settings.rows.length - 1} aria-busy={busyAction === `down:${row.id}`} aria-label={`${row.title} nach unten`} data-personal-row-action="down" data-focusable="true">↓</button>
                  <button type="button" className={deleting ? 'danger confirm' : 'danger'} onClick={() => remove(row)} aria-disabled={busy} aria-busy={busyAction === `delete:${row.id}`} data-personal-row-action="delete" data-focusable="true">{deleting ? 'Löschen bestätigen' : 'Löschen'}</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editingId === null && settings.rows.length < MAX_PERSONAL_SMART_ROWS && (
        <button type="button" className="personal-row-add" onClick={startAdd} data-personal-row-add="true" data-focusable="true">+ Persönliche Reihe hinzufügen</button>
      )}

      {editingId !== null && (
        <form className="personal-row-editor" onSubmit={saveForm} data-dpad-focus-scope="true" aria-labelledby="personal-row-editor-heading">
          <h3 id="personal-row-editor-heading">{editingId === 'new' ? 'Persönliche Reihe hinzufügen' : 'Persönliche Reihe bearbeiten'}</h3>
          <label>
            Kategorie
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value)
                setQuery('')
                setSelected(null)
                setTitle('')
              }}
              data-personal-row-editor-autofocus="true"
              data-focusable="true"
            >
              {PERSONAL_SMART_ROW_TYPES.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
            </select>
          </label>

          {type !== 'decade' && (
            <label>
              {typeDefinition?.searchLabel}
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelected(null)
                }}
                placeholder="Mindestens zwei Zeichen"
                autoComplete="off"
                data-focusable="true"
              />
            </label>
          )}

          <div className="personal-row-suggestions" aria-label="Vorschläge">
            {visibleOptions.map((option) => (
              <button
                type="button"
                className={selected?.id === option.id ? 'personal-row-suggestion active' : 'personal-row-suggestion'}
                key={option.id}
                onClick={() => selectOption(option)}
                data-focusable="true"
              >
                {option.imageUrl && <img src={option.imageUrl} alt="" />}
                <span><strong>{option.label}</strong><small>{option.count} Treffer{option.knownFor.length ? ` · ${option.knownFor.join(', ')}` : ''}</small></span>
              </button>
            ))}
          </div>
          {type !== 'decade' && query.trim().length >= 2 && visibleOptions.length === 0 && (
            <p className="personal-row-preview">Kein passender Vorschlag im aktuellen Movie-Hub-Katalog.</p>
          )}
          {type === 'decade' && visibleOptions.length === 0 && (
            <p className="personal-row-preview">Im aktuellen Katalog ist noch kein Jahrzehnt verfügbar.</p>
          )}

          {selected && (
            <>
              <label>
                Name der Posterreihe
                <input type="text" value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} data-focusable="true" />
              </label>
              <p className="personal-row-preview">Vorschau: {getPersonalSmartRowMatchCount(titles, { type, valueId: Number(selected.id) })} Treffer</p>
            </>
          )}

          <div className="personal-row-editor-actions">
            <button type="submit" disabled={!selected || !title.trim()} aria-disabled={busy || !selected || !title.trim()} aria-busy={busyAction?.startsWith('save:')} data-focusable="true">{busy ? 'Speichert …' : 'Reihe speichern'}</button>
            <button type="button" onClick={cancelForm} aria-disabled={busy} data-focusable="true">Abbrechen</button>
          </div>
        </form>
      )}

      {message && <p className={message.includes('nicht') || message.includes('Bitte') || message.includes('bereits') ? 'error' : 'profile-message'} role="status">{message}</p>}
      <p className="settings-hint">Jede Reihe gehört nur zum aktuell aktiven Profil. Filme, Serien, Bewertungen und Listen werden beim Löschen einer Reihe nicht verändert.</p>
    </section>
  )
}
