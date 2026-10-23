/**
 * Deployment report projection only. Missing/stale adapter evidence is UNKNOWN,
 * never 0 verified offers. TMDB badges are kept; source routes are additive.
 */
const validInt = value => Number.isInteger(value) && value >= 0
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const fmt = value => Number(value).toLocaleString('de-DE')
const fresh = (value, now) => {
  const ageMs = Date.parse(now) - Date.parse(value)
  return Number.isFinite(ageMs) && ageMs >= -60_000 && ageMs <= 12 * 3_600_000
}
export function summarizeYoutubeDeployment({
  status = null, routes = null, sourceStep = 'skipped', routeStep = 'skipped',
  reportedAt = new Date().toISOString(),
} = {}) {
  const sourceValid = status?.kind === 'moviehub-youtube-curated-source-status'
    && status.sourceId === 'youtube'
    && status.sourcePlaylistCount === 2
    && Array.isArray(status.playlistIds) && status.playlistIds.length === 2
    && new Set(status.playlistIds).size === 2
    && status.fullyScanned === true
    && iso(status.generatedAt) && fresh(status.generatedAt, reportedAt)
    && validInt(status.inventoryVideoIds)
    && validInt(status.videoDetailsResolved)
    && validInt(status.reviewOnlyCandidates)
    && validInt(status.approvedDEOfferRoutes)
    && validInt(status.playlistOverlapConflicts)
    && status.videoDetailsResolved <= status.inventoryVideoIds
    && status.approvedDEOfferRoutes <= status.inventoryVideoIds
    && status.reviewOnlyCandidates + status.approvedDEOfferRoutes === status.inventoryVideoIds
    && status.providerBadgeAuthority === 'tmdb-preserved'
    && status.unmatchedTitleBehavior === 'original-youtube-search-link'
  const routesValid = routes?.kind === 'moviehub-youtube-verified-title-routes'
    && routes?.schemaVersion === 1 && routes?.providerId === 'youtube'
    && iso(routes.generatedAt) && fresh(routes.generatedAt, reportedAt)
    && validInt(routes.count)
    && Array.isArray(routes.entries) && routes.entries.length === routes.count
    && routes.entries.every(e => e?.key && e?.verifiedVideoId && e?.target)
  const sourceMeasured = sourceStep === 'success' && sourceValid
  const routesMeasured = routeStep === 'success' && routesValid
  const consistent = sourceMeasured && routesMeasured
    && status.approvedDEOfferRoutes === routes.count
  const sourceState = sourceStep === 'failure' ? '❌ fehlgeschlagen'
    : sourceStep === 'cancelled' ? '⛔ abgebrochen'
      : sourceStep !== 'success' ? '⏭️ nicht ausgeführt'
        : sourceValid ? '✅ erfolgreich' : '⚠️ gültiger Live-Bericht fehlt'
  const routeState = routeStep === 'failure' ? '❌ fehlgeschlagen'
    : routeStep === 'cancelled' ? '⛔ abgebrochen'
      : routeStep !== 'success' ? '⏭️ nicht ausgeführt'
        : !routesValid ? '⚠️ gültiger Routenbericht fehlt'
          : sourceMeasured && !consistent ? '⚠️ Zählabweichung zum Quellenlauf'
            : '✅ erfolgreich'
  return {
    source: {
      area: 'YouTube · 2 Playlists', status: sourceState,
      stock: sourceMeasured
        ? fmt(status.inventoryVideoIds)+' Video-IDs · '+fmt(status.videoDetailsResolved)+' mit Metadaten · '+fmt(status.sourcePlaylistCount)+' Playlists'
        : 'Quellenbestand nicht verfügbar',
      activity: sourceMeasured
        ? fmt(status.inventoryVideoIds-status.videoDetailsResolved)+' ohne Videodetails · '+fmt(status.playlistOverlapConflicts)+' redaktionelle Überschneidungen'
        : 'kein aktueller vollständiger Zwei-Playlist-Nachweis',
      open: sourceMeasured
        ? fmt(status.reviewOnlyCandidates)+' ungeprüfte IDs · '+fmt(status.approvedDEOfferRoutes)+' unabhängig bestätigte DE-Angebote · Stand '+new Date(status.generatedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
        : 'TMDB-Badges und YouTube-Suchfallback bleiben maßgeblich; kein Datenverlust behauptet',
    },
    routes: {
      area: 'YouTube · Direktlink-Freigabe', status: routeState,
      stock: routesMeasured ? fmt(routes.count)+' verifizierte Filmrouten'
        : 'veröffentlichbare Filmrouten nicht verfügbar',
      activity: routesMeasured
        ? fmt(routes.count)+' Titelziele nach unabhängigem Werk-/DE-Angebots-Nachweis'
        : 'keine aktuelle verifizierte Routenmessung',
      open: !routesMeasured ? 'Suchfallback bleibt; kein positiver Nachweis ableitbar'
        : !consistent && sourceMeasured
          ? fmt(status.approvedDEOfferRoutes)+' bestätigte Angebote im Quelllauf, '+fmt(routes.count)+' Routen im Index – Abweichung prüfen'
          : routes.count === 0
            ? '0 bestätigt ist kein API-Fehler · TMDB-Anbieterbadges und Suchlinks unverändert'
            : 'nur gültige DE-PlaybackRoutes ergänzen TMDB-Badges · sonst ursprüngliche Suche',
    },
  }
}
