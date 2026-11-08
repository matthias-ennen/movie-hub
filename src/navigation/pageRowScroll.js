// Shared vertical placement for poster rows and the TV period/first-row pair.
// Calculations are deterministic and independent of scroll animations, so
// subsequent D-pad LEFT/RIGHT inputs cannot re-target an unfinished smooth scroll.
import { cancelNavigationMotion, moveScrollCoordinate } from './navigationMotion.js'

const TOP_GAP = 24
const BOTTOM_GAP = 32

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function calculatePosterScrollTop({
  currentTop, scrollHeight, viewportHeight, topbarBottom = 0, posterRect,
}) {
  const safeTop = Math.max(0, topbarBottom) + TOP_GAP
  const safeBottom = Math.max(safeTop, viewportHeight - BOTTOM_GAP)
  const visibleCenter = safeTop + (safeBottom - safeTop) / 2
  const posterCenter = posterRect.top + posterRect.height / 2
  return clamp(currentTop + posterCenter - visibleCenter, 0, Math.max(0, scrollHeight - viewportHeight))
}

// One stable viewport anchor for both the TV date strip and the first poster
// row. It deliberately depends on neither a mounted poster nor async row data:
// switching TV dates must not change the vertical target when rows unmount.
const TV_PERIOD_VIEWPORT_ANCHOR_RATIO = 0.25

export function calculateTvPairScrollTop({
  currentTop, scrollHeight, viewportHeight, topbarBottom = 0, periodRect,
}) {
  const safeTop = Math.max(0, topbarBottom) + TOP_GAP
  const anchorTop = Math.max(safeTop, Math.round(viewportHeight * TV_PERIOD_VIEWPORT_ANCHOR_RATIO))
  return clamp(
    currentTop + periodRect.top - anchorTop,
    0,
    Math.max(0, scrollHeight - viewportHeight),
  )
}

export function viewportScrollState(documentRef = document, windowRef = window) {
  const scroller = documentRef.scrollingElement || documentRef.documentElement
  const viewportHeight = windowRef.innerHeight || documentRef.documentElement?.clientHeight || 0
  if (!scroller || viewportHeight <= 0) return null
  const topbarBottom = documentRef.querySelector?.('.topbar')?.getBoundingClientRect?.().bottom || 0
  return {
    scroller, viewportHeight, topbarBottom,
    currentTop: scroller.scrollTop || windowRef.scrollY || 0,
    scrollHeight: scroller.scrollHeight || viewportHeight,
  }
}

export function settlePageAt(top, { documentRef = document, windowRef = window, behavior = 'instant' } = {}) {
  const state = viewportScrollState(documentRef, windowRef)
  if (!state) return false
  if (behavior === 'smooth') {
    return moveScrollCoordinate(state.scroller, 'y', top, { behavior, windowRef })
  }
  cancelNavigationMotion(state.scroller)
  if (Math.abs(state.currentTop - top) <= 1) return false
  // Restoration and repeated D-pad keys remain instant and cancel old motion.
  try { windowRef.scrollTo?.({ top, behavior: 'instant' }) } catch { /* fallback below */ }
  if (Math.abs(state.scroller.scrollTop - top) > 1) state.scroller.scrollTop = top
  return true
}

export function alignPosterVertically(candidate, { documentRef = document, windowRef = window, behavior = 'instant' } = {}) {
  if (!candidate) return false
  const state = viewportScrollState(documentRef, windowRef)
  if (!state) return false
  const row = candidate.closest?.('.content-row')
  const tvFirstRow = row?.closest?.('.tv-program-rows')
    && row?.dataset?.rowIndex === '0'
  if (tvFirstRow) return alignTvFirstRowAndPeriod({ documentRef, windowRef, behavior })

  const posterRect = candidate.getBoundingClientRect()
  const top = calculatePosterScrollTop({ ...state, posterRect })
  settlePageAt(top, { documentRef, windowRef, behavior })
  return true
}

export function alignTvFirstRowAndPeriod({ documentRef = document, windowRef = window, behavior = 'instant' } = {}) {
  const period = documentRef.querySelector?.('.tv-program-page .tv-period-shell')
  if (!period) return false
  const state = viewportScrollState(documentRef, windowRef)
  if (!state) return false
  const top = calculateTvPairScrollTop({
    ...state,
    periodRect: period.getBoundingClientRect(),
  })
  settlePageAt(top, { documentRef, windowRef, behavior })
  return true
}
