import { stableStringHash } from './contentDisplaySettings.js'
import { tmdbImageUrl } from '../services/tmdbImages.js'

export const ARTWORK_ROTATION_MODES = Object.freeze([
  { id: 'daily', label: 'Täglich', description: 'Verwendet jeden Tag die nächste passende Bildvariante.' },
  { id: 'weekly', label: 'Wöchentlich', description: 'Behält eine Bildvariante jeweils für eine Kalenderwoche.' },
  { id: 'off', label: 'Aus', description: 'Zeigt dauerhaft das bestplatzierte Bild.' },
])

const MODE_IDS = new Set(ARTWORK_ROTATION_MODES.map((mode) => mode.id))
export const DEFAULT_ARTWORK_ROTATION_MODE = 'daily'

export function normalizeArtworkRotationMode(value) {
  return MODE_IDS.has(value) ? value : DEFAULT_ARTWORK_ROTATION_MODE
}

function candidateValues(item, kind) {
  const artwork = item?.artwork && typeof item.artwork === 'object' ? item.artwork : {}
  const paths = kind === 'hero'
    ? [...(Array.isArray(artwork.heroBackdropPaths) ? artwork.heroBackdropPaths : []), item?.backdropPath]
    : [...(Array.isArray(artwork.posterPaths) ? artwork.posterPaths : []), item?.neutralPosterPath, item?.posterPath]
  const normalizedPaths = [...new Set(paths
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()))]
  if (normalizedPaths.length) return normalizedPaths

  const urls = kind === 'hero' ? [item?.backdropUrl] : [item?.neutralPosterUrl, item?.posterUrl]
  return [...new Set(urls.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))]
}

function periodOrdinal(mode, date) {
  const current = date instanceof Date ? date : new Date(date)
  const utcDay = Math.floor(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()) / 86400000)
  return mode === 'weekly' ? Math.floor(utcDay / 7) : utcDay
}

function candidateUrl(value, kind) {
  if (/^https?:\/\//i.test(value)) return value
  return tmdbImageUrl(value, kind === 'hero' ? 'w1280' : 'w500')
}

export function resolveArtworkUrl(item, {
  kind = 'poster',
  profileId = 'profile',
  rotationMode = DEFAULT_ARTWORK_ROTATION_MODE,
  date = new Date(),
} = {}) {
  const candidates = candidateValues(item, kind)
  if (!candidates.length) return null

  const mode = normalizeArtworkRotationMode(rotationMode)
  if (mode === 'off' || candidates.length === 1) return candidateUrl(candidates[0], kind)

  const identity = item?.tmdbId ?? item?.id ?? item?.title ?? 'title'
  const offset = stableStringHash(`${profileId}:${identity}:${kind}`) % candidates.length
  const index = (offset + periodOrdinal(mode, date)) % candidates.length
  return candidateUrl(candidates[index], kind)
}

export function resolvePresentationArtwork(item, options = {}) {
  return {
    ...item,
    displayPosterUrl: resolveArtworkUrl(item, { ...options, kind: 'poster' }),
    displayHeroBackdropUrl: resolveArtworkUrl(item, { ...options, kind: 'hero' }),
  }
}
