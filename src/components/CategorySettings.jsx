import { useState } from 'react'
import {
  MOVIE_CATEGORY_OPTIONS,
  SERIES_CATEGORY_OPTIONS,
  moveCategoryOrder,
  normalizeCategorySettings,
  orderCategoryOptions,
} from '../catalog/categoryRows.js'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import SettingsButton from './SettingsButton.jsx'

export default function CategorySettings() {
  const { activeProfile, updateActiveProfileCategorySettings } = useProfiles()
  const [categorySavingId, setCategorySavingId] = useState(null)
  const [categoryMessage, setCategoryMessage] = useState('')
  const categorySettings = normalizeCategorySettings(activeProfile?.categorySettings)
  const categoryGroups = [
    {
      id: 'movie',
      title: 'Filmkategorien',
      options: orderCategoryOptions(MOVIE_CATEGORY_OPTIONS, categorySettings.movieCategoryOrder),
      enabledIds: categorySettings.enabledMovieCategoryIds,
    },
    {
      id: 'series',
      title: 'Serienkategorien',
      options: orderCategoryOptions(SERIES_CATEGORY_OPTIONS, categorySettings.seriesCategoryOrder),
      enabledIds: categorySettings.enabledSeriesCategoryIds,
    },
  ]

  async function toggleCategory(mediaType, categoryId) {
    if (!activeProfile || categorySavingId) return
    const current = normalizeCategorySettings(activeProfile.categorySettings)
    const key = mediaType === 'series' ? 'enabledSeriesCategoryIds' : 'enabledMovieCategoryIds'
    const enabled = current[key].includes(categoryId)
    const next = {
      ...current,
      [key]: enabled
        ? current[key].filter((id) => id !== categoryId)
        : [...current[key], categoryId],
    }

    setCategorySavingId(`${mediaType}:${categoryId}`)
    setCategoryMessage('')
    try {
      await updateActiveProfileCategorySettings(next)
    } catch (error) {
      console.error(error)
      setCategoryMessage('Kategorien konnten nicht gespeichert werden.')
    } finally {
      setCategorySavingId(null)
    }
  }

  async function moveCategory(mediaType, categoryId, direction) {
    if (!activeProfile || categorySavingId) return
    const current = normalizeCategorySettings(activeProfile.categorySettings)
    const series = mediaType === 'series'
    const orderKey = series ? 'seriesCategoryOrder' : 'movieCategoryOrder'
    const options = series ? SERIES_CATEGORY_OPTIONS : MOVIE_CATEGORY_OPTIONS
    const currentOrder = current[orderKey]
    const nextOrder = moveCategoryOrder(currentOrder, categoryId, direction, options)
    if (nextOrder.every((id, index) => id === currentOrder[index])) return

    setCategorySavingId(`${mediaType}:${categoryId}`)
    setCategoryMessage('')
    try {
      await updateActiveProfileCategorySettings({
        ...current,
        [orderKey]: nextOrder,
      })
    } catch (error) {
      console.error(error)
      setCategoryMessage('Kategorien konnten nicht sortiert werden.')
    } finally {
      setCategorySavingId(null)
    }
  }

  return (
      <section className="settings-panel category-settings-panel" aria-labelledby="category-settings-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Persönliche Auswahl</p>
            <h2 id="category-settings-heading">Meine Kategorien</h2>
          </div>
          <span className="settings-status">Profil: {activeProfile?.displayName ?? '–'}</span>
        </div>

        <p className="settings-description">
          Deine Auswahl erscheint auf Filme und Serien direkt vor den Anbieterreihen. Mit den Pfeilen legst du zusätzlich die Reihenfolge fest. Home und Meine Inhalte bleiben unverändert.
        </p>

        {activeProfile && categoryGroups.map((group) => (
          <div className="category-settings-group" key={group.id}>
            <div className="category-settings-group-heading">
              <h3>{group.title}</h3>
              <span>{group.enabledIds.length} von {group.options.length} aktiv</span>
            </div>
            <div className="category-choice-grid" aria-label={`${group.title} auswählen`}>
              {group.options.map((category, index) => {
                const enabled = group.enabledIds.includes(category.id)
                const saving = categorySavingId === `${group.id}:${category.id}`
                return (
                  <div className={enabled ? 'category-choice-item active' : 'category-choice-item'} key={category.id}>
                    <SettingsButton
                      type="button"
                      className={enabled ? 'category-choice active' : 'category-choice'}
                      onClick={() => toggleCategory(group.id, category.id)}
                      role="switch"
                      aria-checked={enabled}
                      aria-busy={saving}
                      data-focusable="true"
                    >
                      <span>{category.title}</span>
                      <span className={enabled ? 'category-choice-switch active' : 'category-choice-switch'} aria-hidden="true">
                        <span />
                      </span>
                      <small>{saving ? 'Speichert …' : enabled ? 'An' : 'Aus'}</small>
                    </SettingsButton>
                    <div className="category-order-actions" aria-label={`${category.title} sortieren`}>
                      <SettingsButton
                        type="button"
                        onClick={() => moveCategory(group.id, category.id, -1)}
                        disabled={Boolean(categorySavingId) || index === 0}
                        data-focusable="true"
                        aria-label={`${category.title} nach oben verschieben`}
                      >
                        ↑
                      </SettingsButton>
                      <SettingsButton
                        type="button"
                        onClick={() => moveCategory(group.id, category.id, 1)}
                        disabled={Boolean(categorySavingId) || index === group.options.length - 1}
                        data-focusable="true"
                        aria-label={`${category.title} nach unten verschieben`}
                      >
                        ↓
                      </SettingsButton>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {categoryMessage && <p className="error" role="status">{categoryMessage}</p>}
        <p className="settings-hint">
          Klassiker umfasst in dieser Version Filme mit Erscheinungsjahr vor 2000. Jede Änderung gilt nur für das aktuell aktive Profil.
        </p>
      </section>

  )
}
