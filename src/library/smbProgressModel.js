const ID_PATTERN = /^[a-f0-9]{64}$/
const MAX_DURATION_MS = 604_800_000

export function validSmbProgressId(id) { return typeof id === 'string' && ID_PATTERN.test(id) }

export function normalizeSmbProgress(value) {
  if (!value || !Number.isSafeInteger(value.positionMs) || !Number.isSafeInteger(value.durationMs)
    || !Number.isSafeInteger(value.updatedAtMs) || value.updatedAtMs <= 0
    || value.durationMs <= 0 || value.durationMs > MAX_DURATION_MS
    || value.positionMs < 0 || value.positionMs > value.durationMs) return null
  return { positionMs: value.positionMs, durationMs: value.durationMs, updatedAtMs: value.updatedAtMs }
}

export function shouldSyncSmbProgress(local, remote) {
  return Boolean(local && (!remote || local.updatedAtMs > remote.updatedAtMs))
}

export function movieHubPlayerPalette(style) {
  const mapping = { surface: '--color-surface', text: '--color-text', muted: '--color-text-soft',
    control: '--color-surface-control', accent: '--color-brand-accent', focus: '--color-focus' }
  return Object.fromEntries(Object.entries(mapping).map(([key, css]) => [key, style?.getPropertyValue(css)?.trim() || '']))
}
