function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

export function launchProviderPlaybackRoute({
  providerId,
  title,
  route,
  fallbackUrl = null,
  nativeBridge = typeof window !== 'undefined' ? window.MovieHubNative : null,
} = {}) {
  const id = text(providerId)
  const target = text(route?.target)
  const mode = text(route?.mode)
  const scope = text(route?.scope)
  const fallback = text(fallbackUrl) || target
  if (!id || !target || !mode) return false

  if (nativeBridge?.openProviderRoute) {
    nativeBridge.openProviderRoute(
      id,
      text(title) || '',
      mode,
      scope || '',
      target,
      fallback,
    )
    return true
  }

  // Backward compatibility for installed APKs that predate openProviderRoute.
  if (mode === 'APP_DEEP_LINK' && nativeBridge?.openProviderExact) {
    nativeBridge.openProviderExact(id, text(title) || '', target, fallback)
    return true
  }

  if (mode === 'WEB_LINK' && nativeBridge?.openExternalUrl) {
    nativeBridge.openExternalUrl(target)
    return true
  }

  return false
}
