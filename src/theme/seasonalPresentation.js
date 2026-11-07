import { isCinematicSeasonMediaReady } from './seasonalMediaManifest.js'
/**
 * Copy and asset contracts for the visual season. This MUST use the visual
 * season, not seasonalContent (provider/poster selection); both controls
 * deliberately remain independent. No TMDB or client data fetches.
 */
const CONTENT = Object.freeze({
  classic: {
    home:'Deine nächste Entdeckung', movies:'Filme', series:'Serien', library:'Meine Inhalte',
  },
  halloween: {
    home:'Zeit für Gänsehaut', movies:'Filme für dunkle Abende',
    series:'Serien für lange Nächte', library:'Meine Inhalte · Gänsehautzeit',
  },
  christmas: {
    home:'Zeit für Filmzauber', movies:'Filme für Winterabende',
    series:'Serien für gemütliche Stunden', library:'Meine Inhalte · Winterzauber',
  },
  newyear: {
    home:'Neues Jahr. Große Geschichten.', movies:'Filme zum Jahreswechsel',
    series:'Serien für lange Nächte', library:'Meine Inhalte · Neuanfang',
  },
  easter: {
    home:'Frischer Wind für deine Filmzeit', movies:'Filme für Frühlingstage',
    series:'Serien für freie Stunden', library:'Meine Inhalte · Frühlingszeit',
  },
  pentecost: {
    home:'Zeit für neue Geschichten', movies:'Filme fürs lange Wochenende',
    series:'Serien zum Abschalten', library:'Meine Inhalte · Zeit für dich',
  },
  filmfestival: {
    home:'Kino, das bewegt', movies:'Besondere Filmperlen',
    series:'Geschichten mit Charakter', library:'Meine Inhalte · Filmfestival',
  },
  hollywood: {
    home:'Die große Filmnacht', movies:'Großes Hollywood-Kino',
    series:'Serien mit Starqualität', library:'Meine Inhalte · Roter Teppich',
  },
  'summer-cinema': {
    home:'Filmabende voller Sommer', movies:'Filme für lange Abende',
    series:'Serien für den Sommer', library:'Meine Inhalte · Sommerzeit',
  },
})
export const SEASONAL_PAGE_HEADINGS = CONTENT
export const SEASONAL_ATMOSPHERE_SLOTS = Object.freeze([
  'poster-background','detail-corner','navigation-accent',
  'row-heading','hero-accent',
])
const ASSETS = Object.freeze(Object.fromEntries(Object.keys(CONTENT).map(id => [
  id, Object.freeze({
    wallpaper: `/seasonal-atmosphere/${id}-wallpaper.${isCinematicSeasonMediaReady(id) ? 'webp' : 'svg'}`,
    corner: `/seasonal-atmosphere/${id}-corner.${isCinematicSeasonMediaReady(id) ? 'webp' : 'svg'}`,
  }),
])))
export const SEASONAL_ATMOSPHERE_ASSETS = ASSETS

export function seasonalPageHeading(seasonId, pageId) {
  return (CONTENT[seasonId] || CONTENT.classic)[pageId] || CONTENT.classic[pageId] || ''
}
export function seasonalVisualAssets(seasonId) {
  return ASSETS[seasonId] || ASSETS.classic
}
