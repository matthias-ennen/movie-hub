/**
 * Quality-controlled seasonal media upgrade.
 *
 * Never add a season here until BOTH original production files have been
 * committed, alpha / file-size / readability checks have passed and the
 * user-approved previews show the intended cinematic composition.
 *
 * Each season not listed here continues to load the published SVGs.
 * This is intentionally independent from the seasonal content setting.
 */
export const CINEMATIC_MEDIA_READY = Object.freeze([
  // e.g. 'christmas' — enable after both audited WebPs are in public/
])

export function isCinematicSeasonMediaReady(seasonId) {
  return CINEMATIC_MEDIA_READY.includes(seasonId)
}
