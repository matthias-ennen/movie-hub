import { useProfiles } from '../profiles/ProfileProvider.jsx'
import { SETTINGS_PAGES, SETTINGS_GROUPS, settingsScopeLabel } from '../settings/settingsNavigation.js'
import { useSettingsNavigation } from '../settings/useSettingsNavigation.js'
import SettingsButton from './SettingsButton.jsx'
import DisplaySettings from './DisplaySettings.jsx'
import ThemeSettings from './ThemeSettings.jsx'
import CategorySettings from './CategorySettings.jsx'
import PersonalRowsSettings from './PersonalRowsSettings.jsx'
import ContentDisplaySettings from './ContentDisplaySettings.jsx'
import ProviderSettings from './ProviderSettings.jsx'
import { WaipuStationSettings, JoynStationSettings } from './StationSettings.jsx'
import { NetworkSettings, TmdbConnectionSettings } from './ConnectionSettings.jsx'
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
  smartFilterStatus = 'ready',
  onRetrySmartFilters,
}) {
  const { activeProfile } = useProfiles()
  const current = SETTINGS_PAGES[page] || SETTINGS_PAGES.overview
  const { mainRef, headerRef, navigate } = useSettingsNavigation(page, onNavigate, activeProfile?.id)

  return <main ref={mainRef} className="browse-page profile-page app-settings-page">
    <header ref={headerRef} className="settings-page-header settings-page-heading">
      {current.parent ? <nav className="settings-breadcrumbs eyebrow" aria-label="Einstellungspfad">
        <ol>
          <li><SettingsButton data-settings-back="true" onClick={() => navigate(current.parent)}>
            {SETTINGS_PAGES[current.parent].title}
          </SettingsButton></li>
          <li className="settings-current-page" aria-current="page"><span aria-hidden="true">›</span><h1>{current.title}</h1></li>
        </ol>
      </nav> : <h1 className="eyebrow">{current.title}</h1>}
    </header>
    <div data-settings-content key={`${page}:${activeProfile?.id || ''}`}>
      {page === 'overview' && SETTINGS_GROUPS.map((group) => <section className="settings-panel settings-overview-group" key={group.id}
        aria-labelledby={`settings-group-${group.id}`}>
        <h2 className="settings-kicker" id={`settings-group-${group.id}`}>{settingsScopeLabel(group.id, activeProfile?.displayName)}</h2>
        <nav className="settings-navigation" aria-labelledby={`settings-group-${group.id}`}>
          {group.pages.map(([id, entry]) => <SettingsButton key={id} className="settings-navigation-entry"
            data-settings-entry={id} onClick={() => navigate(id)}>
            <span><strong>{entry.title}</strong><small>{entry.description}</small></span><span aria-hidden="true">›</span>
          </SettingsButton>)}
        </nav>
      </section>)}
      {page === 'appearance' && <DisplaySettings />}
      {page === 'design' && <ThemeSettings />}
      {page === 'categories' && <CategorySettings />}
      {page === 'personal' && (smartFilterStatus === 'ready'
        ? <PersonalRowsSettings titles={personalRowTitles} filterOptions={smartFilterOptions} />
        : <section className="settings-panel"><p role="status">{smartFilterStatus === 'error' ? 'Die Filterauswahl konnte nicht geladen werden.' : 'Filterauswahl wird geladen …'}</p>
          {smartFilterStatus === 'error' && <SettingsButton onClick={onRetrySmartFilters}>Erneut versuchen</SettingsButton>}
        </section>)}
      {page === 'sorting' && <ContentDisplaySettings />}
      {page === 'providers' && <ProviderSettings availableTmdbProviderIds={availableTmdbProviderIds} />}
      {page === 'waipu' && <WaipuStationSettings stations={waipuStations} canonicalStations={waipuStations} status={waipuStationStatus} />}
      {page === 'joyn' && <JoynStationSettings stations={joynStations} canonicalStations={waipuStations} status={joynStationStatus} />}
      {page === 'notifications' && <TitleWatchSettings userId={userId} profileId={activeProfile?.id} profileName={activeProfile?.displayName} />}
      {page === 'network' && <NetworkSettings />}
      {page === 'tmdb' && <TmdbConnectionSettings />}
    </div>
  </main>
}
