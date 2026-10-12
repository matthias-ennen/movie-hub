import { useTheme } from '../theme/ThemeProvider.jsx'
import SettingsButton from './SettingsButton.jsx'

export default function ThemeSettings() {
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
  return <>
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
              <SettingsButton
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
              </SettingsButton>
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
          <SettingsButton
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
          </SettingsButton>
        </div>

        <p className="settings-description">
          Wenn diese Funktion aktiv ist, wählt Movie Hub beim ersten Start einer neuen Wechselperiode zufällig eines der fünf Designs aus – nur für das aktuell aktive Profil.
        </p>

        {autoSwitchEnabled && (
          <div className="interval-controls" aria-label="Intervall für automatischen Designwechsel">
            {autoSwitchIntervals.map((interval) => (
              <SettingsButton
                type="button"
                key={interval.id}
                className={autoSwitchInterval === interval.id ? 'interval-button active' : 'interval-button'}
                onClick={() => setAutoSwitchInterval(interval.id)}
                data-focusable="true"
                aria-pressed={autoSwitchInterval === interval.id}
              >
                {interval.label}
              </SettingsButton>
            ))}
          </div>
        )}

        <p className="settings-hint">
          Eine manuelle Designwahl schaltet die Automatik nicht aus. Das manuell gewählte Design bleibt bis zum nächsten planmäßigen Wechsel aktiv.
        </p>
      </section>

  </>
}
