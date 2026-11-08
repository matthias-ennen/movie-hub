// Shared vertical placement for poster rows and the TV period/first-row pair.
// Calculations are deterministic and independent of scroll animations, so
// subsequent D-pad LEFT/RIGHT inputs cannot re-target an unfinished smooth scroll.
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

export function calculateTvPairScrollTop({
  currentTop, scrollHeight, viewportHeight, topbarBottom = 0, periodRect, posterRect = null,
}) {
  const safeTop = Math.max(0, topbarBottom) + TOP_GAP
  const maxTop = Math.max(0, scrollHeight - viewportHeight)
  // Always keep the date controls immediately below the sticky header if
  // there is sufficient scroll range.
  const dateTop = clamp(currentTop + periodRect.top - safeTop, 0, maxTop)
  if (!posterRect) return dateTop

  // The current first-poster centering is the source of truth for BOTH
  // focus regions. On a TV-sized viewport the date strip should sit above
  // that centered row without a separate date-focused scroll position.
  const centered = calculatePosterScrollTop({
    currentTop, scrollHeight, viewportHeight, topbarBottom, posterRect,
  })
  const dateTopIfCentered = periodRect.top - (centered - currentTop)

  // Only when a small screen would hide the date strip behind the sticky
  // header do we clamp to the safe date-at-top position. That same choice
  // is applied when the first poster itself gains focus, preventing jumps.
  return dateTopIfCentered >= safeTop - 1 ? centered : dateTop
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

export function settlePageAt(top, { documentRef = document, windowRef = window } = {}) {
  const state = viewportScrollState(documentRef, windowRef)
  if (!state || Math.abs(state.currentTop - top) <= 1) return false
  // Instant placement also cancels an old in-flight smooth scroll on WebView.
  try { windowRef.scrollTo?.({ top, behavior: 'instant' }) } catch { /* fallback below */ }
  if (Math.abs(state.scroller.scrollTop - top) > 1) state.scroller.scrollTop = top
  return true
}

export function alignPosterVertically(candidate, { documentRef = document, windowRef = window } = {}) {
  if (!candidate) return false
  const state = viewportScrollState(documentRef, windowRef)
  if (!state) return false
  const row = candidate.closest?.('.content-row')
  const tvFirstRow = row?.closest?.('.tv-program-rows')
    && row?.dataset?.rowIndex === '0'
  if (tvFirstRow) return alignTvFirstRowAndPeriod({ documentRef, windowRef })

  const posterRect = candidate.getBoundingClientRect()
  const top = calculatePosterScrollTop({ ...state, posterRect })
  settlePageAt(top, { documentRef, windowRef })
  return true
}

export function alignTvFirstRowAndPeriod({ documentRef = document, windowRef = window } = {}) {
  const period = documentRef.querySelector?.('.tv-program-page .tv-period-shell')
  if (!period) return false
  const state = viewportScrollState(documentRef, windowRef)
  if (!state) return false
  const poster = documentRef.querySelector?.('.tv-program-page .tv-program-rows .content-row[data-row-index="0"] .poster-card')
  const top = calculateTvPairScrollTop({
    ...state,
    periodRect: period.getBoundingClientRect(),
    posterRect: poster?.getBoundingClientRect?.() || null,
  })
  settlePageAt(top, { documentRef, windowRef })
  return true
}
