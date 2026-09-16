import { useSharedMediaCatalog } from './useSharedMediaCatalog.js'

/**
 * Compatibility hook for callers outside the poster pipeline.
 * Presence now comes exclusively from the central sharedMedia snapshot.
 * Legacy entry migration is handled administratively instead of per poster.
 */
export function useSharedMediaPresence(item, enabled = true) {
  const { hasTitle } = useSharedMediaCatalog()
  return Boolean(enabled && hasTitle(item))
}
