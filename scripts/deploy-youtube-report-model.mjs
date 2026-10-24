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
  status = null, routes = null, coverage = null,
  sourceStep = 'skipped', routeStep = 'skipped', coverageStep = 'skipped',
  reportedAt = new Date().toISOString(),
} = {}) {
  // TMDB-first approved videos are outside the two playlist inventories.
  // Check each source population independently before comparing their sum
  // to the canonical merged route index. Never classify valid extra routes
  // as invented playlist videos.
  const approvedTmdbFirst = status?.tmdbFirstApprovedInputRows
  const verifiedTmdbFirst = status?.tmdbFirstVerifiedVideoRoutes
  const blockedTmdbFirst = status?.tmdbFirstBlockedVideoRoutes
  const playlistApproved = status?.approvedDEOfferRoutes - verifiedTmdbFirst
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
    && validInt(approvedTmdbFirst) && validInt(verifiedTmdbFirst)
    && validInt(blockedTmdbFirst) && validInt(playlistApproved)
    && approvedTmdbFirst === verifiedTmdbFirst + blockedTmdbFirst
    && status.videoDetailsResolved <= status.inventoryVideoIds
    && playlistApproved <= status.inventoryVideoIds
    && status.reviewOnlyCandidates + playlistApproved === status.inventoryVideoIds
    && status.providerBadgeAuthority === 'tmdb-preserved'
    && status.unmatchedTitleBehavior === 'original-youtube-search-link'
  const routesValid = routes?.kind === 'moviehub-youtube-verified-title-routes'
    && routes?.schemaVersion === 1 && routes?.providerId === 'youtube'
    && iso(routes.generatedAt) && fresh(routes.generatedAt, reportedAt)
    && validInt(routes.count)
    && Array.isArray(routes.entries) && routes.entries.length === routes.count
    && routes.entries.every(e => e?.key && e?.verifiedVideoId && e?.target)
  const b=coverage?.tmdbFirst, p=coverage?.youtubeFirst
  const coverageValid = coverage?.kind === 'moviehub-youtube-g2-bidirectional-coverage-baseline'
    && coverage.schemaVersion === 1 && coverage.privateArtifact === true
    && coverage.publicationPermitted === false
    && coverage.status === 'read-only-coverage-no-offer-or-match-approval'
    && iso(coverage.generatedAt) && fresh(coverage.generatedAt, reportedAt)
    && coverage.catalogWrites === 0 && coverage.firestoreWrites === 0
    && coverage.providerWrites === 0 && coverage.badgeWrites === 0
    && coverage.nightlyWrites === 0 && coverage.publicRecordsExported === 0
    && validInt(p?.sourceVideos) && p.sourceVideos === status?.inventoryVideoIds
    && validInt(p.editorialDirectLinks) && validInt(p.reviewOnlyVideos)
    && p.editorialDirectLinks+p.reviewOnlyVideos === p.sourceVideos
    && validInt(b?.publicYoutubeBadgedMovies)
    && validInt(b?.publicYoutubeBadgedSeries)
    && validInt(b?.canonicalAndPublicMovieBadges)
    && validInt(b?.publicSearchOnlyMovieBadges)
    && validInt(b?.movieBadgesWithCuratedPlaylistLinks)
    && validInt(b?.movieBadgesWithIndependentlyVerifiedRoutes)
    && validInt(b?.movieBadgesWithAnyExactRoute)
    && validInt(b?.movieBadgesStillUsingSearchFallback)
    && validInt(b?.seriesBadgesRequiringEpisodeOrSeriesReview)
    && validInt(b?.seriesBadgesWithIndependentlyVerifiedRoutes)
    && b.canonicalAndPublicMovieBadges+b.publicSearchOnlyMovieBadges === b.publicYoutubeBadgedMovies
    && b.movieBadgesWithAnyExactRoute+b.movieBadgesStillUsingSearchFallback === b.publicYoutubeBadgedMovies
    && b.seriesBadgesRequiringEpisodeOrSeriesReview+b.seriesBadgesWithIndependentlyVerifiedRoutes === b.publicYoutubeBadgedSeries
    && b.movieBadgesWithCuratedPlaylistLinks <= p.editorialDirectLinks
    && b.movieBadgesWithAnyExactRoute >= b.movieBadgesWithCuratedPlaylistLinks
    && b.movieBadgesWithAnyExactRoute >= b.movieBadgesWithIndependentlyVerifiedRoutes
    && b.movieBadgesWithIndependentlyVerifiedRoutes <= verifiedTmdbFirst
    && b.movieBadgesWithAnyExactRoute <= b.movieBadgesWithCuratedPlaylistLinks
      + b.movieBadgesWithIndependentlyVerifiedRoutes
  const sourceMeasured = sourceStep === 'success' && sourceValid
  const routesMeasured = routeStep === 'success' && routesValid
  const coverageMeasured = sourceMeasured && coverageStep === 'success' && coverageValid
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
          : !sourceMeasured ? '⚠️ Quellenabgleich nicht bestätigt'
            : !consistent ? '⚠️ Zählabweichung zum Quellenlauf'
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
        ? fmt(status.reviewOnlyCandidates)+' Playlist-Videos ohne unabhängig bestätigte DE-Angebotsroute · '+fmt(playlistApproved)+' Playlist-Angebote bestätigt · Stand '+new Date(status.generatedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
        : 'TMDB-Badges und YouTube-Suchfallback bleiben maßgeblich; kein Datenverlust behauptet',
    },
    badges: {
      area: 'YouTube · TMDB-Badge-Abgleich',
      status: coverageStep === 'failure' ? '❌ fehlgeschlagen'
        : coverageStep === 'cancelled' ? '⛔ abgebrochen'
          : coverageStep !== 'success' ? '⏭️ nicht ausgeführt'
            : coverageMeasured ? '✅ erfolgreich' : '⚠️ vollständiger Badge-Abgleich fehlt',
      stock: coverageMeasured
        ? fmt(b.publicYoutubeBadgedMovies)+' öffentliche Filme · '+fmt(b.publicYoutubeBadgedSeries)+' Serien mit YouTube-Badge'
        : 'Aktueller TMDB-YouTube-Badge-Bestand nicht nachgewiesen',
      activity: coverageMeasured
        ? fmt(b.movieBadgesWithCuratedPlaylistLinks)+' Filme mit redaktioneller Playlist-Video-ID · '
          +fmt(b.movieBadgesWithIndependentlyVerifiedRoutes)+' mit unabhängig verifizierter DE-Route'
        : 'Öffentliche Badge-Zuordnungen ohne vollständigen Abgleich',
      open: coverageMeasured
        ? fmt(b.movieBadgesStillUsingSearchFallback)+' Filme weiterhin mit YouTube-Suchfallback · '
          +fmt(b.publicSearchOnlyMovieBadges)+' Badge-Filme nur im Suchindex · persönliche Inhalte nicht abgedeckt'
        : 'Ohne gültige aktuelle Bestandsprüfung keine erfundenen Nullwerte; Suchfallback bleibt',
    },
    tmdbFirst: {
      area: 'YouTube · TMDB-first-Verifikation', status: sourceState,
      stock: sourceMeasured
        ? fmt(approvedTmdbFirst)+' unabhängig geprüfte TMDB-first-Freigaben · '+fmt(verifiedTmdbFirst)+' aktuell verifizierte Filmrouten'
        : 'TMDB-first-Verifikationsstand nicht verfügbar',
      activity: sourceMeasured
        ? fmt(blockedTmdbFirst)+' nach aktuellem Video-/Quellenabgleich gesperrt · 0 zusätzliche Such-API-Aufrufe'
        : 'Keine belastbaren Zahlen aus dem gemeinsamen YouTube-Quellenlauf',
      open: sourceMeasured
        ? 'Nur unabhängig bestätigte deutsche Angebote erhalten einen Direktlink; TMDB-Badges ohne Nachweis behalten ihre YouTube-Suche'
        : 'TMDB-YouTube-Anbieterbadges sind keine einzeln bestätigten Video-IDs',
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
