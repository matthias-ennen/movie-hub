import { visibleProviderOptions } from '../settings/providerSelectionModel.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import { ProviderBadge } from './ProviderBadges.jsx'
import SettingsToggle from './SettingsToggle.jsx'

export default function ProviderSettings({ availableTmdbProviderIds }) {
  const { enabledProviderIds, loading, savingProviderId, error, setProviderEnabled } = useProviderSelection()
  const options = visibleProviderOptions(availableTmdbProviderIds)
  const busy = loading || Boolean(savingProviderId)
  return <section className="settings-panel">
    <div className="settings-heading"><h2>Streaminganbieter</h2><span className="settings-status">Konto · {options.filter(({ id }) => enabledProviderIds.includes(id)).length} von {options.length} aktiv</span></div>
    <p className="settings-description">Diese Auswahl gilt für alle Profile und Geräte: Anbieterreihen, Verfügbarkeiten und TV-Angebote. Deine eigenen Inhalte und persönlichen Listen bleiben gespeichert.</p>
    <div className="provider-selection-list">
      {options.map((provider) => {
        const enabled = enabledProviderIds.includes(provider.id)
        return <SettingsToggle key={provider.id} label={provider.label} badge={<ProviderBadge providerId={provider.id} />}
          enabled={enabled} busy={busy} saving={savingProviderId === provider.id}
          onToggle={() => setProviderEnabled(provider.id, !enabled).catch(() => {})} />
      })}
    </div>
    {error && <p className="error" role="status">Anbieterauswahl konnte nicht gespeichert werden: {error.message}</p>}
  </section>
}
