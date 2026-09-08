export default function SettingsView() {
  const nativeNetworkSettings = typeof window.MovieHubNative?.openNetworkSettings === 'function'

  function openNetworkSettings() {
    if (nativeNetworkSettings) window.MovieHubNative.openNetworkSettings()
  }

  return (
    <main className="browse-page profile-page app-settings-page">
      <div className="page-heading profile-heading">
        <p className="eyebrow">Movie Hub</p>
        <h1>Einstellungen</h1>
        <p>Geräteweite Einstellungen für Movie Hub auf diesem Smartphone, Tablet oder Fire TV.</p>
      </div>

      <section className="settings-panel network-settings-panel" aria-labelledby="network-settings-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Heimnetz</p>
            <h2 id="network-settings-heading">Netzlaufwerke</h2>
          </div>
          <span className="settings-status">Nur dieses Gerät</span>
        </div>

        <p className="settings-description">
          Richte SMB-Freigaben ein, prüfe ihre Erreichbarkeit und entscheide, ob Movie Hub die Zugangsdaten geschützt auf diesem Gerät speichern darf.
        </p>

        {nativeNetworkSettings ? (
          <button type="button" className="network-settings-open" onClick={openNetworkSettings} data-focusable="true">
            <span aria-hidden="true">⌁</span>
            <span><strong>Netzlaufwerke verwalten</strong><small>Anlegen, verbinden, prüfen, trennen oder bearbeiten</small></span>
          </button>
        ) : (
          <p className="settings-hint">
            Netzlaufwerke werden ausschließlich in der aktuellen Android-/Fire-TV-App verwaltet. Im Browser bleiben SMB-Zugangsdaten aus Sicherheitsgründen nicht verfügbar.
          </p>
        )}
      </section>
    </main>
  )
}
