/**
 * Refresh exact YouTube link projections when the app returns to foreground.
 * No background polling: revoked or replaced links fall back to title search.
 */
export function createYoutubeLinkRefreshController({
  loadVerified, loadCurated, loadBestEffort,
  setVerified, setCurated, setBestEffort,
  now = Date.now,
}) {
  let active = true
  let generation = 0
  let lastRefresh = null
  const loaders = [
    [loadVerified, setVerified],
    [loadCurated, setCurated],
    [loadBestEffort, setBestEffort],
  ]
  function refresh() {
    if (!active) return
    const time = now()
    // Fire TV often delivers focus + visibilitychange at the same moment.
    if (lastRefresh !== null && time >= lastRefresh && time - lastRefresh < 1000) return
    lastRefresh = time
    const request = ++generation
    // Never keep an old exact target clickable while checking Hosting.
    for (const [, set] of loaders) set(null)
    for (const [load, set] of loaders) {
      Promise.resolve().then(load).then(value => {
        if (active && generation === request) set(value ?? null)
      }).catch(() => {
        if (active && generation === request) set(null)
      })
    }
  }
  function stop() {
    active = false
    generation++
  }
  return {refresh, stop}
}
