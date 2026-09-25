export const TV_REMINDER_WINDOW_MS = 36 * 60 * 60 * 1000
export const TV_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

export function alertTitleKey(item) {
  const type = item?.type === 'series' || item?.mediaType === 'tv' ? 'series' : item?.type === 'movie' || item?.mediaType === 'movie' ? 'movie' : null
  const tmdbId = Number(item?.tmdbId)
  return type && Number.isSafeInteger(tmdbId) && tmdbId > 0 ? `${type}-${tmdbId}` : null
}

export function watchId(item, kind) {
  const key = alertTitleKey(item)
  return key && ['included', 'tv'].includes(kind) ? `${key}-${kind}` : null
}

export function includedProviderIds(offers, enabledProviderIds) {
  const enabled = new Set(enabledProviderIds || [])
  return [...new Set((Array.isArray(offers) ? offers : [])
    .filter((offer) => enabled.has(offer?.id)
      && (offer.offerTypes || []).some((type) => ['flatrate', 'free', 'ads'].includes(type)))
    .map((offer) => offer.id))]
}

export function dueTvAiring(airings, disabledStationIds = [], now = Date.now()) {
  const disabled = new Set(disabledStationIds || [])
  return (Array.isArray(airings) ? airings : [])
    .filter((airing) => airing?.stationId && !disabled.has(airing.stationId))
    .filter((airing) => {
      const start = Date.parse(airing.startTime)
      return Number.isFinite(start) && start > now && start <= now + TV_REMINDER_WINDOW_MS
    })
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0] || null
}

export function alertNotificationId(watch, suffix = 'initial') {
  const key = watchId(watch, watch.kind)
  if (!key || !/^[a-zA-Z0-9-]{1,80}$/.test(watch.activationId || '')) return null
  return `${key}-${watch.activationId}-${suffix}`
}

export function tvAiringId(watch, airing) {
  const stamp = Date.parse(airing?.startTime)
  return Number.isFinite(stamp) ? alertNotificationId(watch, `airing-${stamp}`) : null
}

export function tvMessage(airing, title) {
  const date = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(airing.startTime))
  const episode = [
    Number.isInteger(airing.seasonNumber) ? `S${airing.seasonNumber}` : null,
    Number.isInteger(airing.episodeNumber) ? `E${airing.episodeNumber}` : null,
  ].filter(Boolean).join(' ')
  return `${title}${episode ? ` (${episode})` : ''} läuft am ${date} Uhr auf ${airing.stationName}.`
}

export function includedTransition(previous, activationId, available, providerFingerprint) {
  if (!previous || previous.activationId !== activationId) {
    return { activationId, available, providerFingerprint, cycle: 0, send: available }
  }
  if (previous.providerFingerprint !== providerFingerprint) {
    return { activationId, available, providerFingerprint, cycle: previous.cycle || 0, send: false }
  }
  const send = available && !previous.available
  return { activationId, available, providerFingerprint, cycle: (previous.cycle || 0) + Number(send), send }
}

export function tvTransition(previous, activationId, airing, now) {
  if (!airing) return { send: false }
  const previousTime = previous?.lastNotifiedAt?.toMillis?.() ?? Date.parse(previous?.lastNotifiedAt || '')
  const sameSession = previous?.activationId === activationId
  const tooSoon = sameSession && Number.isFinite(previousTime) && now - previousTime < TV_REMINDER_COOLDOWN_MS
  const alreadySent = sameSession && previous?.lastAiringStart === airing.startTime
  return { send: !tooSoon && !alreadySent, lastAiringStart: airing.startTime }
}
