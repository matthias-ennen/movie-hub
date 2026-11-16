import { isSmbMediaUrl } from './sharedMediaModel.js'

export function launchMovieHubMedia(entry, {
  nativeBridge,
  markWatched,
  openUrl,
  playInline,
  reportUnavailable,
  playSmb,
} = {}) {
  if (!entry?.url || (entry.type !== 'video' && entry.type !== 'web')) return false

  if (entry.type === 'video' && isSmbMediaUrl(entry.url)) {
    if (typeof nativeBridge?.playSmbMedia !== 'function') {
      reportUnavailable?.('Netzwerkvideos können nur in der aktuellen Android-/Fire-TV-App abgespielt werden.')
      return false
    }
    markWatched?.()
    if (playSmb) playSmb(entry)
    else nativeBridge.playSmbMedia(entry.label, entry.url)
    return true
  }

  markWatched?.()
  if (entry.type === 'video') playInline?.(entry)
  else openUrl?.(entry.url)
  return true
}
