import { getActivePosterRowLimit } from '../profiles/profileExperienceRuntime.js'

export const STANDARD_POSTER_ROW_LIMIT = 70
export const TOP_TEN_ROW_LIMIT = 10
export const ROW_VIRTUAL_OVERSCAN = 2

export function posterRowLimit(variant = 'standard') {
  return variant === 'top-ten' ? TOP_TEN_ROW_LIMIT : getActivePosterRowLimit()
}

export function limitPosterRowItems(items, variant = 'standard') {
  const source = Array.isArray(items) ? items : []
  return source.slice(0, posterRowLimit(variant))
}

export function estimatePosterRowHeight(variant = 'standard') {
  return variant === 'top-ten' ? 520 : 390
}
