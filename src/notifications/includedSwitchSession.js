/**
 * Detail-local presentation only. The server's completed watch remains
 * terminal; an accepted activation is visually retained until this detail
 * instance is unmounted. No clock, timeout or Firestore updates are involved.
 */
export function includedSwitchShownAsOn(persistedEnabled, acceptedKey, currentKey) {
  return Boolean(persistedEnabled || (currentKey && acceptedKey === currentKey))
}

/** Prevent a second click on an already fulfilled watch from reactivating it. */
export function ignoreCompletedIncludedClick(persistedEnabled, acceptedKey, currentKey) {
  return Boolean(!persistedEnabled && currentKey && acceptedKey === currentKey)
}
