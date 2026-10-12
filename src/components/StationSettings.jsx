import { useMemo, useState } from 'react'
import { orderTvStations } from '../settings/stationOrder.js'
import { useWaipuStationSelection } from '../settings/useWaipuStationSelection.js'
import { useJoynStationSelection } from '../settings/useJoynStationSelection.js'
import { useProviderSelection } from '../settings/useProviderSelection.js'
import SettingsToggle from './SettingsToggle.jsx'

function StationSettings({ providerId, title, stations, canonicalStations, status, selection }) {
  const [query, setQuery] = useState('')
  const { isProviderEnabled } = useProviderSelection()
  const { disabledStationIds, loading, savingStationId, error, setStationEnabled } = selection
  const disabled = useMemo(() => new Set(disabledStationIds), [disabledStationIds])
  const ordered = useMemo(() => orderTvStations(stations, canonicalStations), [stations, canonicalStations])
  const matching = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('de')
    return term ? ordered.filter((station) => station.name.toLocaleLowerCase('de').includes(term)) : ordered
  }, [ordered, query])
  const busy = loading || Boolean(savingStationId)
  return <section className="settings-panel">
    <div className="settings-heading"><h2>{title}</h2><span className="settings-status">Konto · {ordered.filter(({ id }) => !disabled.has(id)).length} von {ordered.length} aktiv</span></div>
    <p className="settings-description">Wähle die Sender dieses Anbieters. Die Auswahl gilt auf allen Geräten für TV-Angebote. Neue Sender sind automatisch eingeschaltet.</p>
    {!isProviderEnabled(providerId) && <p className="settings-hint">Der Anbieter ist ausgeschaltet. Deine Senderauswahl bleibt für das nächste Einschalten erhalten.</p>}
    {status === 'ready' ? <>
      <label className="settings-search">Sender suchen<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} data-focusable="true" /></label>
      <div className="provider-selection-list">
        {matching.map((station) => <SettingsToggle key={station.id} label={station.name}
          enabled={!disabled.has(station.id)} busy={busy} saving={savingStationId === station.id}
          onToggle={() => setStationEnabled(station.id, disabled.has(station.id)).catch(() => {})} />)}
      </div>
      {!matching.length && <p role="status">Keine passenden Sender.</p>}
    </> : <p role="status">{status === 'loading' ? 'Sender werden geladen …' : 'Die Senderliste ist momentan nicht verfügbar.'}</p>}
    {error && <p className="error" role="status">Senderauswahl konnte nicht gespeichert werden: {error.message}</p>}
  </section>
}

export function WaipuStationSettings(props) {
  const selection = useWaipuStationSelection()
  return <StationSettings {...props} providerId="waipu" title="Waipu-Sender" selection={selection} />
}

export function JoynStationSettings(props) {
  const selection = useJoynStationSelection()
  return <StationSettings {...props} providerId="joyn" title="Joyn-Sender" selection={selection} />
}
