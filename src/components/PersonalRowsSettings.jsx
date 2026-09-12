import { useEffect, useMemo, useState } from 'react'
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
  const [editingId, setEditingId] = useState(null)
  const [type, setType] = useState('cast')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
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
    resetForm()
    setEditingId('new')
  }

  function startEdit(row) {
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

  async function persist(rows, successMessage) {
    setBusy(true)
    setMessage('')
    try {
      await updateActiveProfileContentRowSettings({ rows })
      setMessage(successMessage)
      return true
    } catch {
      setMessage('Persönliche Reihen konnten nicht gespeichert werden.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveForm(event) {
    event.preventDefault()
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
    if (await persist(rows, 'Persönliche Reihe gespeichert.')) resetForm(false)
  }

  async function toggle(row) {
    await persist(settings.rows.map((entry) => (
      entry.id === row.id ? { ...entry, enabled: !entry.enabled } : entry
    )), row.enabled ? 'Reihe deaktiviert.' : 'Reihe aktiviert.')
  }

  async function move(row, direction) {
    const index = settings.rows.findIndex((entry) => entry.id === row.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= settings.rows.length) return
    const rows = [...settings.rows]
    ;[rows[index], rows[target]] = [rows[target], rows[index]]
    await persist(rows, 'Reihenfolge gespeichert.')
  }

  async function remove(row) {
    if (confirmDeleteId !== row.id) {
      setConfirmDeleteId(row.id)
      setMessage(`„${row.title}“ wirklich löschen? Noch einmal Löschen wählen.`)
      return
    }
    if (await persist(settings.rows.filter((entry) => entry.id !== row.id), 'Persönliche Reihe gelöscht.')) {
      setConfirmDeleteId(null)
      if (editingId === row.id) resetForm()
    }
  }

  return (
    <section className="settings-panel personal-rows-settings-panel" aria-labelledby="personal-rows-settings-heading">
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
              <article className={row.enabled ? 'personal-row-setting active' : 'personal-row-setting'} key={row.id}>
                <div className="personal-row-setting-copy">
                  <strong>{row.title}</strong>
                  <span>{PERSONAL_SMART_ROW_TYPES.find((entry) => entry.id === row.type)?.label} · {row.valueLabel}</span>
                  <small>{count} {count === 1 ? 'Treffer' : 'Treffer'}{count === 0 ? ' · derzeit ausgeblendet' : ''}</small>
                </div>
                <div className="personal-row-setting-actions">
                  <button type="button" onClick={() => toggle(row)} disabled={busy} data-focusable="true">{row.enabled ? 'Aus' : 'An'}</button>
                  <button type="button" onClick={() => startEdit(row)} disabled={busy} data-focusable="true">Bearbeiten</button>
                  <button type="button" onClick={() => move(row, -1)} disabled={busy || index === 0} aria-label={`${row.title} nach oben`} data-focusable="true">↑</button>
                  <button type="button" onClick={() => move(row, 1)} disabled={busy || index === settings.rows.length - 1} aria-label={`${row.title} nach unten`} data-focusable="true">↓</button>
                  <button type="button" className={deleting ? 'danger confirm' : 'danger'} onClick={() => remove(row)} disabled={busy} data-focusable="true">{deleting ? 'Löschen bestätigen' : 'Löschen'}</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editingId === null && settings.rows.length < MAX_PERSONAL_SMART_ROWS && (
        <button type="button" className="personal-row-add" onClick={startAdd} data-focusable="true">+ Persönliche Reihe hinzufügen</button>
      )}

      {editingId !== null && (
        <form className="personal-row-editor" onSubmit={saveForm}>
          <h3>{editingId === 'new' ? 'Persönliche Reihe hinzufügen' : 'Persönliche Reihe bearbeiten'}</h3>
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
            <button type="submit" disabled={busy || !selected || !title.trim()} data-focusable="true">{busy ? 'Speichert …' : 'Reihe speichern'}</button>
            <button type="button" onClick={resetForm} disabled={busy} data-focusable="true">Abbrechen</button>
          </div>
        </form>
      )}

      {message && <p className={message.includes('nicht') || message.includes('Bitte') || message.includes('bereits') ? 'error' : 'profile-message'} role="status">{message}</p>}
      <p className="settings-hint">Jede Reihe gehört nur zum aktuell aktiven Profil. Filme, Serien, Bewertungen und Listen werden beim Löschen einer Reihe nicht verändert.</p>
    </section>
  )
}
