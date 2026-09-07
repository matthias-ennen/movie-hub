export function titleMediaKey(item) {
  const type = item?.type === 'series' ? 'series' : 'movie'
  return `${type}-${String(item?.tmdbId || item?.id || '').replace(/[^a-zA-Z0-9_-]/g, '')}`
}

export function normalizeMediaUrl(value) {
  const url = new URL(String(value || '').trim())
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Nur HTTP- und HTTPS-Adressen werden unterstützt.')
  }
  return url.toString()
}

export function normaliseMedia(entry) {
  const label = String(entry?.label || '').trim().slice(0, 80)
  if (!label) throw new Error('Bitte gib eine Bezeichnung ein.')
  return {
    id: entry?.id,
    label,
    url: normalizeMediaUrl(entry?.url),
    type: entry?.type === 'video' ? 'video' : 'web',
  }
}
