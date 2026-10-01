import { getActivePosterRowLimit } from '../profiles/profileExperienceRuntime.js'

export const STANDARD_POSTER_ROW_LIMIT = 50
export const TOP_TEN_ROW_LIMIT = 10
export const TV_POSTER_ROW_LIMIT = 150
export const TV_INITIAL_RENDERED_POSTERS = 30
export const TV_RENDER_BATCH_SIZE = 30
export const TV_RENDER_AHEAD_THRESHOLD = 8
export const ROW_VIRTUAL_OVERSCAN = 2

export function posterRowLimit(variant = 'standard') {
  if (variant === 'tv') return TV_POSTER_ROW_LIMIT
  return variant === 'top-ten' ? TOP_TEN_ROW_LIMIT : getActivePosterRowLimit()
}

export function limitPosterRowItems(items, variant = 'standard') {
  const source = Array.isArray(items) ? items : []
  return source.slice(0, posterRowLimit(variant))
}

export function estimatePosterRowHeight(variant = 'standard') {
  return variant === 'top-ten' ? 520 : 390
}

export function tvPosterRenderCountForIndex(total, focusIndex = 0) {
  const count = Math.max(0, Number(total) || 0)
  if (!count) return 0
  const index = Math.max(0, Number(focusIndex) || 0)
  const required = Math.max(TV_INITIAL_RENDERED_POSTERS, index + TV_RENDER_AHEAD_THRESHOLD + 1)
  const batches = Math.ceil(required / TV_RENDER_BATCH_SIZE)
  return Math.min(count, batches * TV_RENDER_BATCH_SIZE)
}

export function nextTvPosterRenderCount(current, total) {
  const count = Math.max(0, Number(total) || 0)
  if (!count) return 0
  const rendered = Math.max(0, Number(current) || 0)
  return Math.min(count, Math.max(TV_INITIAL_RENDERED_POSTERS, rendered + TV_RENDER_BATCH_SIZE))
}

export function shouldExpandTvPosterWindow(focusIndex, renderedCount, total) {
  const rendered = Math.max(0, Number(renderedCount) || 0)
  const count = Math.max(0, Number(total) || 0)
  if (!rendered || rendered >= count) return false
  const index = Math.max(0, Number(focusIndex) || 0)
  return index >= Math.max(0, rendered - TV_RENDER_AHEAD_THRESHOLD)
}
