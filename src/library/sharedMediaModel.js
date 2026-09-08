export function titleMediaKey(item) {
  const type = item?.type === 'series' ? 'series' : 'movie'
  return `${type}-${String(item?.tmdbId || item?.id || '').replace(/[^a-zA-Z0-9_-]/g, '')}`
}

const PROVIDER_LINK_DOMAINS = Object.freeze({
  netflix: ['netflix.com'],
  prime: ['primevideo.com', 'amazon.de'],
  disney: ['disneyplus.com'],
  youtube: ['youtube.com', 'youtu.be'],
  waipu: ['waipu.tv'],
})

export function getProviderAllowedDomains(providerId) {
  return PROVIDER_LINK_DOMAINS[String(providerId || '')] || []
}

function isDomainOrSubdomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

export function normalizeProviderUrl(value, providerId) {
  const domains = getProviderAllowedDomains(providerId)
  if (domains.length === 0) {
    throw new Error('Bitte wähle einen unterstützten Anbieter aus.')
  }

  const url = new URL(String(value || '').trim())
  if (url.protocol !== 'https:') {
    throw new Error('Anbieter-Links müssen eine HTTPS-Adresse verwenden.')
  }
  if (url.username || url.password) {
    throw new Error('Zugangsdaten dürfen nicht in der Adresse stehen.')
  }

  const hostname = url.hostname.toLowerCase()
  if (!domains.some((domain) => isDomainOrSubdomain(hostname, domain))) {
    throw new Error(`Die Adresse passt nicht zum gewählten Anbieter. Erlaubt: ${domains.join(', ')}.`)
  }
  return url.toString()
}

function normalizeUncPath(value) {
  const parts = value.replace(/^\\\\+/, '').split(/\\+/).filter(Boolean)
  if (parts.length < 3) {
    throw new Error('Der Netzwerkpfad braucht Server, Freigabe und Dateiname.')
  }
  return `smb://${parts.map((part) => encodeURIComponent(part)).join('/')}`
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

export function normalizeMediaUrl(value, type = 'web') {
  if (type === 'smb') return normalizeSmbUrl(value)
  const url = new URL(String(value || '').trim())
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Nur HTTP- und HTTPS-Adressen werden unterstützt.')
  }
  if (url.username || url.password) {
    throw new Error('Zugangsdaten dürfen nicht in der Adresse stehen.')
  }
  return url.toString()
}

export function normaliseMedia(entry) {
  const label = String(entry?.label || '').trim().slice(0, 80)
  if (!label) throw new Error('Bitte gib eine Bezeichnung ein.')
  const type = ['video', 'smb', 'provider'].includes(entry?.type) ? entry.type : 'web'
  const providerId = type === 'provider' ? String(entry?.providerId || '') : null
  const normalized = {
    id: entry?.id,
    label,
    url: type === 'provider'
      ? normalizeProviderUrl(entry?.url, providerId)
      : normalizeMediaUrl(entry?.url, type),
    type,
  }
  if (providerId) normalized.providerId = providerId
  return normalized
}
