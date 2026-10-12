import { useManagedTitleAlerts } from '../notifications/useManagedTitleAlerts.js'
import TitleWatchSettingsView from './TitleWatchSettingsView.jsx'

export default function TitleWatchSettings({ userId, profileId, profileName }) {
  const { items, ready, error, disable } = useManagedTitleAlerts(userId, profileId)
  return <TitleWatchSettingsView profileName={profileName} items={items} ready={ready} error={error} onDisable={disable} />
}
