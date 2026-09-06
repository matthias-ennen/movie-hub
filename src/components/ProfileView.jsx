import { useTheme } from '../theme/ThemeProvider.jsx'

export default function ProfileView({ user, onSignOut }) {
  const {
    themeId,
    themes,
    autoSwitchEnabled,
    autoSwitchInterval,
    autoSwitchIntervals,
    selectTheme,
    setAutoSwitchEnabled,
    setAutoSwitchInterval,
  } = useTheme()

  return (
    <main className="browse-page profile-page">
      <div className="page-heading profile-heading">
        <p className="eyebrow">Dein Movie Hub</p>
        <h1>Profil & Design</h1>
        <p>Wähle den Look, der zu dir passt. Die fünf Designs bleiben unabhängig vom automatischen Wechsel jederzeit direkt auswählbar.</p>
      </div>

      <section className="settings-panel" aria-labelledby="theme-heading">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">Darstellung</p>
            <h2 id="theme-heading">Design auswählen</h2>
          </div>
          <span className="settings-status">Aktiv: {themes.find((theme) => theme.id === themeId)?.label}</span>
        </div>

        <div className="theme-choice-grid">
          {themes.map((theme) => {
            const active = theme.id === themeId
            return (
              <button
                type="button"
                key={theme.id}
                className={active ? 'theme-choice active' : 'theme-choice'}
                onClick={() => selectTheme(theme.id)}
                data-focusable="true"
                aria-pressed={active}
              >
                <span className={`theme-preview theme-preview-${theme.id}`} aria-hidden="true">
                  <span className="theme-preview-bar" />
                  <span className="theme-preview-hero" />
                  <span className="theme-preview-row">
                    <i /><i /><i /><i />
                  </span>
                </span>
                <span className="theme-choice-copy">
                  <span className="theme-choice-title">
                    <strong>{theme.label}</strong>
                    {active && <span className="active-mark">Aktiv</span>}
                  </span>
                  <span>{theme.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings-panel auto-switch-panel" aria-labelledby="auto-switch-heading">
        <div className="settings-heading auto-switch-heading-row">
          <div>
            <p className="settings-kicker">Abwechslung</p>
            <h2 id="auto-switch-heading">Automatischer Designwechsel</h2>
          </div>
          <button
            type="button"
            className={autoSwitchEnabled ? 'switch-control active' : 'switch-control'}
            role="switch"
            aria-checked={autoSwitchEnabled}
            aria-label="Automatischen Designwechsel ein- oder ausschalten"
            onClick={() => setAutoSwitchEnabled(!autoSwitchEnabled)}
            data-focusable="true"
          >
            <span className="switch-knob" />
            <span className="switch-label">{autoSwitchEnabled ? 'Ein' : 'Aus'}</span>
          </button>
        </div>

        <p className="settings-description">
          Wenn diese Funktion aktiv ist, wählt Movie Hub beim ersten Start einer neuen Wechselperiode zufällig eines der fünf Designs aus.
        </p>

        {autoSwitchEnabled && (
          <div className="interval-controls" aria-label="Intervall für automatischen Designwechsel">
            {autoSwitchIntervals.map((interval) => (
              <button
                type="button"
                key={interval.id}
                className={autoSwitchInterval === interval.id ? 'interval-button active' : 'interval-button'}
                onClick={() => setAutoSwitchInterval(interval.id)}
                data-focusable="true"
                aria-pressed={autoSwitchInterval === interval.id}
              >
                {interval.label}
              </button>
            ))}
          </div>
        )}

        <p className="settings-hint">
          Eine manuelle Designwahl schaltet die Automatik nicht aus. Das manuell gewählte Design bleibt bis zum nächsten planmäßigen Wechsel aktiv.
        </p>
      </section>

      <section className="settings-panel account-panel" aria-labelledby="account-heading">
        <div>
          <p className="settings-kicker">Konto</p>
          <h2 id="account-heading">Movie-Hub-Konto</h2>
          <p className="account-email">{user.email}</p>
        </div>
        <button type="button" className="account-signout" onClick={onSignOut} data-focusable="true">Abmelden</button>
      </section>
    </main>
  )
}
