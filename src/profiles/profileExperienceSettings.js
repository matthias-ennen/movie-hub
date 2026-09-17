export const POSTER_ROW_LIMIT_OPTIONS = [30, 40, 50, 60, 70]
export const HERO_COUNT_OPTIONS = [3, 4, 5, 6, 7]

export const DEFAULT_PROFILE_EXPERIENCE_SETTINGS = Object.freeze({
  posterRowLimit: 50,
  heroCount: 5,
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
    myContent: Object.freeze({
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
  const home = visibility.home || {}
  const movies = visibility.movies || {}
  const series = visibility.series || {}
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
      myContent: {
        personalRows: bool(myContent.personalRows),
        history: bool(myContent.history),
      },
    },
  }
}

export function updateProfileExperienceSetting(settings, path, value) {
  const normalized = normalizeProfileExperienceSettings(settings)
  const next = structuredClone(normalized)
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return normalized

  let cursor = next
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {}
    cursor = cursor[part]
  }
  cursor[parts.at(-1)] = value
  return normalizeProfileExperienceSettings(next)
}
