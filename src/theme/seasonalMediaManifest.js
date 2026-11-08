/**
 * Quality-controlled cinematic seasonal media, Issue #484.
 * All nine original WebP pairs were independently generated, user-approved,
 * imported byte-for-byte and validated with scripts/audit-seasonal-artwork.mjs.
 *
 * Disable any season here to fall back immediately to its published SVG pair.
 * This remains independent of the user's seasonal-content preferences.
 */
export const CINEMATIC_MEDIA_READY = Object.freeze([
  'classic',
  'filmfestival',
  'hollywood',
  'easter',
  'pentecost',
  'summer-cinema',
  'halloween',
  'christmas',
  'newyear',
])

export function isCinematicSeasonMediaReady(seasonId) {
  return CINEMATIC_MEDIA_READY.includes(seasonId)
}
