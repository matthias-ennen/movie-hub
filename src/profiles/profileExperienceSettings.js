export const POSTER_ROW_LIMIT_OPTIONS = [30, 40, 50, 60, 70]
export const HERO_COUNT_OPTIONS = [3, 4, 5, 6, 7]
export const HERO_TRAILER_DELAY_OPTIONS = [10, 15, 20]

export const DEFAULT_PROFILE_EXPERIENCE_SETTINGS = Object.freeze({
  posterRowLimit: 50,
  heroCount: 5,
  heroTrailers: Object.freeze({
    enabled: false,
    delaySeconds: 15,
    soundEnabled: true,
  }),
  visibility: Object.freeze({
    home: Object.freeze({
      hero: true,
      top10: true,
      personalRows: true,
      providerRows: true,
    }),
    movies: Object.freeze({
      hero: true,
      top10: true,
      providerRows: true,
    }),
    series: Object.freeze({
      hero: true,
      top10: true,
      providerRows: true,
    }),
    tv: Object.freeze({
      hero: true,
      top10: true,
    }),
    myContent: Object.freeze({
      hero: true,
      top10: true,
      personalRows: true,
      history: true,
    }),
  }),
})

function allowedNumber(value, options, fallback) {
  const normalized = Number(value)
  return options.includes(normalized) ? normalized : fallback
}

function bool(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback
}

export function normalizeProfileExperienceSettings(value = {}) {
  const visibility = value?.visibility || {}
  const heroTrailers = value?.heroTrailers || {}
  const home = visibility.home || {}
  const movies = visibility.movies || {}
  const series = visibility.series || {}
  const tv = visibility.tv || {}
  const myContent = visibility.myContent || {}

  return {
    posterRowLimit: allowedNumber(
      value?.posterRowLimit,
      POSTER_ROW_LIMIT_OPTIONS,
      DEFAULT_PROFILE_EXPERIENCE_SETTINGS.posterRowLimit,
    ),
    heroCount: allowedNumber(
      value?.heroCount,
      HERO_COUNT_OPTIONS,
      DEFAULT_PROFILE_EXPERIENCE_SETTINGS.heroCount,
    ),
    heroTrailers: {
      enabled: bool(heroTrailers.enabled, DEFAULT_PROFILE_EXPERIENCE_SETTINGS.heroTrailers.enabled),
      delaySeconds: allowedNumber(
        heroTrailers.delaySeconds,
        HERO_TRAILER_DELAY_OPTIONS,
        DEFAULT_PROFILE_EXPERIENCE_SETTINGS.heroTrailers.delaySeconds,
      ),
      soundEnabled: bool(heroTrailers.soundEnabled, DEFAULT_PROFILE_EXPERIENCE_SETTINGS.heroTrailers.soundEnabled),
    },
    visibility: {
      home: {
        hero: bool(home.hero),
        top10: bool(home.top10),
        personalRows: bool(home.personalRows),
        providerRows: bool(home.providerRows),
      },
      movies: {
        hero: bool(movies.hero),
        top10: bool(movies.top10),
        providerRows: bool(movies.providerRows),
      },
      series: {
        hero: bool(series.hero),
        top10: bool(series.top10),
        providerRows: bool(series.providerRows),
      },
      tv: {
        hero: bool(tv.hero),
        top10: bool(tv.top10),
      },
      myContent: {
        hero: bool(myContent.hero),
        top10: bool(myContent.top10),
        personalRows: bool(myContent.personalRows),
        history: bool(myContent.history),
      },
    },
  }
}

function cloneSettings(settings) {
  return {
    ...settings,
    heroTrailers: { ...settings.heroTrailers },
    visibility: {
      ...settings.visibility,
      home: { ...settings.visibility.home },
      movies: { ...settings.visibility.movies },
      series: { ...settings.visibility.series },
      tv: { ...settings.visibility.tv },
      myContent: { ...settings.visibility.myContent },
    },
  }
}

export function updateProfileExperienceSetting(settings, path, value) {
  const normalized = normalizeProfileExperienceSettings(settings)
  const next = cloneSettings(normalized)
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return normalized

  let cursor = next
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {}
    cursor = cursor[part]
  }
  cursor[parts[parts.length - 1]] = value
  return normalizeProfileExperienceSettings(next)
}
