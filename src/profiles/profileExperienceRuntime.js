import {
  DEFAULT_PROFILE_EXPERIENCE_SETTINGS,
  normalizeProfileExperienceSettings,
} from './profileExperienceSettings.js'

let activeSettings = normalizeProfileExperienceSettings(DEFAULT_PROFILE_EXPERIENCE_SETTINGS)

export function setActiveProfileExperienceRuntime(value) {
  activeSettings = normalizeProfileExperienceSettings(value)
  return activeSettings
}

export function getActiveProfileExperienceRuntime() {
  return activeSettings
}

export function getActivePosterRowLimit() {
  return activeSettings.posterRowLimit
}

export function getActiveHeroCount() {
  return activeSettings.heroCount
}

export function isExperienceModuleVisible(page, module) {
  return activeSettings.visibility?.[page]?.[module] !== false
}

export function inferExperiencePage(rows, className = '') {
  if (String(className).includes('progressive-home-rows')) return 'home'
  if (String(className).includes('personal-library-rows')) return 'myContent'

  const ids = (Array.isArray(rows) ? rows : []).map((row) => String(row?.id || ''))
  if (ids.some((id) => id.includes('series'))) return 'series'
  if (ids.some((id) => id.includes('movie'))) return 'movies'
  return 'home'
}

export function rowExperienceModule(row, page) {
  const id = String(row?.id || '')
  if (row?.variant === 'top-ten' || id.startsWith('top-ten-')) return 'top10'
  if (page === 'myContent' && id === 'my-watched-history') return 'history'
  if (id.startsWith('provider-') || row?.providerId) return 'providerRows'
  if (id.startsWith('my-') || id.startsWith('tmdb-') || id.startsWith('personal-smart-')) return 'personalRows'
  return null
}

export function filterRowsByExperienceVisibility(rows, page) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const module = rowExperienceModule(row, page)
    return !module || isExperienceModuleVisible(page, module)
  })
}
