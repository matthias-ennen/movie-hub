import { useLayoutEffect, useRef } from 'react'
import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { SETTINGS_PAGES, settingsChildren, settingsParent } from '../settings/settingsNavigation.js'
import SettingsButton from './SettingsButton.jsx'
import DisplaySettings from './DisplaySettings.jsx'
import ThemeSettings from './ThemeSettings.jsx'
import CategorySettings from './CategorySettings.jsx'
import PersonalRowsSettings from './PersonalRowsSettings.jsx'
import ContentDisplaySettings from './ContentDisplaySettings.jsx'
import ProviderSettings from './ProviderSettings.jsx'
import { WaipuStationSettings, JoynStationSettings } from './StationSettings.jsx'
import ConnectionSettings from './ConnectionSettings.jsx'
import TitleWatchSettings from './TitleWatchSettings.jsx'

export default function SettingsView({
  userId,
  page = 'overview',
  onNavigate,
  availableTmdbProviderIds = null,
  waipuStations = [],
  waipuStationStatus = 'loading',
  joynStations = [],
  joynStationStatus = 'loading',
  personalRowTitles = [],
  smartFilterOptions = {},
}) {
  const { activeProfile } = useProfiles()
  const mainRef = useRef(null)
  const previousPage = useRef(null)
  const current = SETTINGS_PAGES[page] || SETTINGS_PAGES.overview
  const children = settingsChildren(page)

  useLayoutEffect(() => {
    const previous = previousPage.current
    previousPage.current = page
    const frame = window.requestAnimationFrame(() => {
      const main = mainRef.current
      const returnTarget = settingsParent(previous) === page
        ? main?.querySelector(`[data-settings-entry="${previous}"]`)
        : null
      const target = returnTarget || main?.querySelector('[data-settings-content] [data-focusable="true"]')
        || main?.querySelector('[data-settings-back]')
      target?.focus({ preventScroll: true })
      if (returnTarget) returnTarget.scrollIntoView({ block: 'nearest' })
      else window.scrollTo({ top: 0, behavior: 'instant' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [page])

  return <main ref={mainRef} className="browse-page profile-page app-settings-page">
    <div className="page-heading profile-heading">
      <p className="eyebrow">Dein Movie Hub</p>
      <h1>{current.title}</h1>
      {current.parent && <SettingsButton className="settings-back" data-settings-back="true"
        onClick={() => onNavigate(current.parent)}>← {SETTINGS_PAGES[current.parent].title}</SettingsButton>}
    </div>
    <div data-settings-content key={`${page}:${activeProfile?.id || ''}`}>
      {children.length > 0 && <nav className="settings-navigation" aria-label={current.title}>
        {children.map(([id, entry]) => <SettingsButton key={id} className="settings-navigation-entry"
          data-settings-entry={id} onClick={() => onNavigate(id)}>
          <span><strong>{entry.title}</strong><small>{entry.description}</small></span><span aria-hidden="true">›</span>
        </SettingsButton>)}
      </nav>}
      {page === 'display' && <p className="settings-hint">Für das aktive Profil: {activeProfile?.displayName ?? '–'}</p>}
      {page === 'appearance' && <DisplaySettings />}
      {page === 'design' && <ThemeSettings />}
      {page === 'categories' && <CategorySettings />}
      {page === 'personal' && <PersonalRowsSettings titles={personalRowTitles} filterOptions={smartFilterOptions} />}
      {page === 'sorting' && <ContentDisplaySettings />}
      {page === 'providers' && <ProviderSettings availableTmdbProviderIds={availableTmdbProviderIds} />}
      {page === 'waipu' && <WaipuStationSettings stations={waipuStations} canonicalStations={waipuStations} status={waipuStationStatus} />}
      {page === 'joyn' && <JoynStationSettings stations={joynStations} canonicalStations={waipuStations} status={joynStationStatus} />}
      {page === 'notifications' && <TitleWatchSettings userId={userId} profileId={activeProfile?.id} profileName={activeProfile?.displayName} />}
      {page === 'connections' && <ConnectionSettings />}
    </div>
  </main>
}
