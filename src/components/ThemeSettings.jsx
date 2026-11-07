import { useTheme } from '../theme/ThemeProvider.jsx'
import SettingsButton from './SettingsButton.jsx'
import { seasonalVisualAssets } from '../theme/seasonalPresentation.js'

const SEASON_DESIGN_DESCRIPTIONS = {
  classic: 'Dein gewohntes MovieHub-Design ohne saisonale Akzente.',
  halloween: 'Dezente violette und warme orangefarbene Gruselakzente.',
  christmas: 'Zurückhaltendes Tannengrün, warme Goldtöne und festliche Akzente.',
  easter: 'Sanfte Frühlingsfarben mit Lavendel- und Grüntönen.',
  pentecost: 'Helle, ruhige Akzente in Türkis und Frühlingsgrün.',
  newyear: 'Mitternachtsblau, goldene Lichtspuren und dezente Sternreflexe.',
  filmfestival: 'Bordeaux, Silber und feine Kino-Scheinwerfer.',
  hollywood: 'Dunkles Champagnergold und die Atmosphäre einer großen Filmpremiere.',
  'summer-cinema': 'Warme Abendsonne, tiefes Blau und ruhige Open-Air-Kinostimmung.',
}

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
    seasonalThemes,
    seasonalThemeSettings,
    activeVisualSeason,
    setSeasonalThemeEnabled,
    setSeasonalThemeAutoSwitch,
    selectSeasonalTheme,
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

      <section className="settings-panel seasonal-design-panel" aria-labelledby="seasonal-design-heading">
        <div className="settings-heading auto-switch-heading-row">
          <div>
            <p className="settings-kicker">Jahreszeiten</p>
            <h2 id="seasonal-design-heading">Saisonale Gestaltung</h2>
            <p className="settings-description">
              Dezente Hintergrundgrafiken, Akzente und Farbwelten für deine Saison.
              Unabhängig von den saisonalen Posterreihen und deinem Grunddesign.
            </p>
            <p className="settings-hint" role="status">
              Aktiv: {seasonalThemeSettings.enabled
                ? seasonalThemes.find(mode => mode.id === activeVisualSeason)?.label || 'Klassisch'
                : 'Aus (Klassisch)'}
            </p>
          </div>
          <SettingsButton
            type="button"
            className={seasonalThemeSettings.enabled ? 'switch-control active' : 'switch-control'}
            role="switch"
            aria-checked={seasonalThemeSettings.enabled}
            aria-label="Saisonale Gestaltung ein- oder ausschalten"
            data-focusable="true"
            onClick={() => setSeasonalThemeEnabled(!seasonalThemeSettings.enabled)}
          >
            <span className="switch-knob" />
            <span className="switch-label">{seasonalThemeSettings.enabled ? 'Ein' : 'Aus'}</span>
          </SettingsButton>
        </div>

        {seasonalThemeSettings.enabled && (
          <>
            <div className="content-sort-grid seasonal-design-choices" aria-label="Saisonales Design auswählen">
              {seasonalThemes.map(mode => {
                const selected = seasonalThemeSettings.seasonId === mode.id
                const effective = activeVisualSeason === mode.id
                return <SettingsButton
                  key={mode.id}
                  type="button"
                  className={selected ? 'content-sort-choice active' : 'content-sort-choice'}
                  aria-pressed={selected}
                  data-focusable="true"
                  onClick={() => selectSeasonalTheme(mode.id)}
                >
                  <span className="seasonal-theme-swatch" data-season-preview={mode.id} aria-hidden="true">
                    <i /><i /><i />
                  </span>
                  <span className="content-sort-choice-title">
                    <strong>{mode.label}</strong>
                    {effective && <span className="active-mark">Wirksam</span>}
                  </span>
                  <span>{SEASON_DESIGN_DESCRIPTIONS[mode.id]}</span>
                  <small>{selected ? 'Ausgewählt' : 'Auswählen'}</small>
                </SettingsButton>
              })}
            </div>

            <div className="settings-heading auto-switch-heading-row seasonal-design-automation">
              <div>
                <h3>Automatisch zur Jahreszeit wechseln</h3>
                <p className="settings-description">
                  Verwendet denselben Kalender wie die saisonalen Posterreihen.
                  Außerhalb der Saison bleibt dein normales Design erhalten.
                </p>
              </div>
              <SettingsButton
                type="button"
                className={seasonalThemeSettings.autoSwitch.enabled ? 'switch-control active' : 'switch-control'}
                role="switch"
                aria-checked={seasonalThemeSettings.autoSwitch.enabled}
                aria-label="Saisonales Design automatisch wechseln"
                data-focusable="true"
                onClick={() => setSeasonalThemeAutoSwitch(!seasonalThemeSettings.autoSwitch.enabled)}
              >
                <span className="switch-knob" />
                <span className="switch-label">{seasonalThemeSettings.autoSwitch.enabled ? 'Ein' : 'Aus'}</span>
              </SettingsButton>
            </div>
            <p className="settings-hint">
              Du kannst beispielsweise Weihnachten im Juni wählen. Ist die
              Automatik eingeschaltet, übernimmt sie erst beim nächsten Saisonwechsel.
              Ohne Automatik bleibt deine manuelle Auswahl erhalten.
            </p>
          </>
        )}
      </section>

  </>
}
