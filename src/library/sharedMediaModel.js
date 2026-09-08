export function titleMediaKey(item) {
  const type = item?.type === 'series' ? 'series' : 'movie'
  return `${type}-${String(item?.tmdbId || item?.id || '').replace(/[^a-zA-Z0-9_-]/g, '')}`
}

function normalizeUncPath(value) {
  const parts = value.replace(/^\\\\+/, '').split(/\\+/).filter(Boolean)
  if (parts.length < 3) {
    throw new Error('Der Netzwerkpfad braucht Server, Freigabe und Dateiname.')
  }
  return `smb://${parts.map((part) => encodeURIComponent(part)).join('/')}`
}

export function isSmbMediaUrl(value) {
  const input = String(value || '').trim()
  return input.startsWith('\\\\') || input.toLowerCase().startsWith('smb://')
}

export function normalizeSmbUrl(value) {
  const input = String(value || '').trim()
  const candidate = input.startsWith('\\\\') ? normalizeUncPath(input) : input
  const url = new URL(candidate)
  if (url.protocol !== 'smb:') {
    throw new Error('Bitte gib einen SMB- oder UNC-Netzwerkpfad ein.')
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error('Benutzername und Kennwort gehören nicht in den SMB-Pfad.')
  }
  if (url.search || url.hash) {
    throw new Error('SMB-Pfade dürfen keine Abfrage oder Sprungmarke enthalten.')
  }
  const pathParts = url.pathname.split('/').filter(Boolean)
  if (pathParts.length < 2 || pathParts.some((part) => part === '.' || part === '..')) {
    throw new Error('Der SMB-Pfad braucht mindestens Freigabe und Dateiname.')
  }
  return url.toString()
}

export function normalizeMediaUrl(value) {
  const url = new URL(String(value || '').trim())
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Nur HTTP- und HTTPS-Adressen werden unterstützt.')
  }
  if (url.username || url.password) {
    throw new Error('Zugangsdaten dürfen nicht in der Adresse stehen.')
  }
  return url.toString()
}

export function normalizeVideoUrl(value) {
  return isSmbMediaUrl(value) ? normalizeSmbUrl(value) : normalizeMediaUrl(value)
}

export function normaliseMedia(entry) {
  const label = String(entry?.label || '').trim().slice(0, 80)
  if (!label) throw new Error('Bitte gib eine Bezeichnung ein.')

  // The public model only knows links and videos. Legacy provider overrides
  // become ordinary links; legacy SMB entries become videos whose source is
  // detected from the URL when they are launched.
  const legacyType = String(entry?.type || '')
  const type = legacyType === 'video' || legacyType === 'smb' ? 'video' : 'web'

  return {
    id: entry?.id,
    label,
    url: type === 'video' ? normalizeVideoUrl(entry?.url) : normalizeMediaUrl(entry?.url),
    type,
  }
}
