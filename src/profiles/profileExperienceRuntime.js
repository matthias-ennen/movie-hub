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
