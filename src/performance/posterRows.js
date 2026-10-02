import { getActivePosterRowLimit } from '../profiles/profileExperienceRuntime.js'
import {
  INITIAL_VISIBLE_POSTERS,
  POSTER_REVEAL_BATCH_SIZE,
} from './progressiveRendering.js'

export const STANDARD_POSTER_ROW_LIMIT = 50
export const TOP_TEN_ROW_LIMIT = 10
export const HISTORY_POSTER_ROW_LIMIT = 100
export const TV_POSTER_ROW_LIMIT = 150
export const STANDARD_INITIAL_RENDERED_POSTERS = INITIAL_VISIBLE_POSTERS
export const STANDARD_RENDER_BATCH_SIZE = POSTER_REVEAL_BATCH_SIZE
export const STANDARD_RENDER_AHEAD_THRESHOLD = 5
export const TV_INITIAL_RENDERED_POSTERS = 30
export const TV_RENDER_BATCH_SIZE = 30
export const TV_RENDER_AHEAD_THRESHOLD = 8
export const ROW_VIRTUAL_OVERSCAN = 2

export function posterRowLimit(variant = 'standard') {
  if (variant === 'tv') return TV_POSTER_ROW_LIMIT
  if (variant === 'history') return HISTORY_POSTER_ROW_LIMIT
  return variant === 'top-ten' ? TOP_TEN_ROW_LIMIT : getActivePosterRowLimit()
}

function progressivePosterPolicy(variant = 'standard') {
  if (variant === 'standard') {
    return {
      initial: STANDARD_INITIAL_RENDERED_POSTERS,
      batch: STANDARD_RENDER_BATCH_SIZE,
      ahead: STANDARD_RENDER_AHEAD_THRESHOLD,
    }
  }
  if (variant === 'tv' || variant === 'history') {
    return {
      initial: TV_INITIAL_RENDERED_POSTERS,
      batch: TV_RENDER_BATCH_SIZE,
      ahead: TV_RENDER_AHEAD_THRESHOLD,
    }
  }
  return null
}

export function isProgressivePosterRow(variant = 'standard') {
  return Boolean(progressivePosterPolicy(variant))
}

export function limitPosterRowItems(items, variant = 'standard') {
  const source = Array.isArray(items) ? items : []
  return source.slice(0, posterRowLimit(variant))
}

export function estimatePosterRowHeight(variant = 'standard') {
  return variant === 'top-ten' ? 520 : 390
}

export function posterRenderCountForIndex(total, focusIndex = 0, variant = 'standard') {
  const count = Math.max(0, Number(total) || 0)
  const policy = progressivePosterPolicy(variant)
  if (!count || !policy) return count
  const index = Math.max(0, Number(focusIndex) || 0)
  const required = Math.max(policy.initial, index + policy.ahead + 1)
  const batches = Math.ceil(required / policy.batch)
  return Math.min(count, batches * policy.batch)
}

export function nextPosterRenderCount(current, total, variant = 'standard') {
  const count = Math.max(0, Number(total) || 0)
  const policy = progressivePosterPolicy(variant)
  if (!count || !policy) return count
  const rendered = Math.max(0, Number(current) || 0)
  return Math.min(count, Math.max(policy.initial, rendered + policy.batch))
}

export function shouldExpandPosterWindow(focusIndex, renderedCount, total, variant = 'standard') {
  const policy = progressivePosterPolicy(variant)
  const rendered = Math.max(0, Number(renderedCount) || 0)
  const count = Math.max(0, Number(total) || 0)
  if (!policy || !rendered || rendered >= count) return false
  const index = Math.max(0, Number(focusIndex) || 0)
  return index >= Math.max(0, rendered - policy.ahead)
}

// Compatibility wrappers for existing tests/callers while the underlying
// implementation is now shared across standard, history and TV rows.
export function tvPosterRenderCountForIndex(total, focusIndex = 0) {
  return posterRenderCountForIndex(total, focusIndex, 'tv')
}

export function nextTvPosterRenderCount(current, total) {
  return nextPosterRenderCount(current, total, 'tv')
}

export function shouldExpandTvPosterWindow(focusIndex, renderedCount, total) {
  return shouldExpandPosterWindow(focusIndex, renderedCount, total, 'tv')
}
