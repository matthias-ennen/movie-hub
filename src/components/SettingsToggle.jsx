import SettingsButton from './SettingsButton.jsx'

export default function SettingsToggle({ label, description, badge, enabled, busy, saving, onToggle, ...props }) {
  return (
    <SettingsButton
      {...props}
      className={`provider-selection-row settings-toggle${badge ? ' has-badge' : ''}${enabled ? ' active' : ''}`}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      aria-busy={saving || undefined}
      disabled={busy}
      onClick={onToggle}
    >
      {badge && <span className="settings-toggle-badge">{badge}</span>}
      <span className="provider-selection-copy"><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <span className={enabled ? 'provider-selection-switch active' : 'provider-selection-switch'} aria-hidden="true"><span className="provider-selection-knob" /></span>
      <span className="provider-selection-state">{saving ? 'Speichert …' : enabled ? 'An' : 'Aus'}</span>
    </SettingsButton>
  )
}
