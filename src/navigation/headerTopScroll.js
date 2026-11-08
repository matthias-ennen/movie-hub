import { settlePageAt } from './pageRowScroll.js'
import { cancelNavigationMotion } from './navigationMotion.js'

// The header is sticky: scrollIntoView({ block: 'nearest' }) can leave the
// document far below its true start. Header focus needs an explicit top edge.
const HEADER_CONTROL = '.brand-button[data-focusable="true"], .nav-link[data-focusable="true"], .icon-button[data-focusable="true"], .profile-button[data-focusable="true"]'

// Hero controls have the same absolute-top contract as header controls.
// They must not rely on scrollIntoView(nearest) inside the sticky shell.
export function restoreTopScrollForHeroAction(target, {
  documentRef = document,
  windowRef = window,
  behavior = 'instant',
} = {}) {
  if (!target?.matches?.('.hero-actions .action-button[data-focusable="true"]')) return false
  const scroller = documentRef.scrollingElement || documentRef.documentElement
  if (!scroller) return false
  if ((scroller.scrollTop || 0) > 0 || (windowRef.scrollY || 0) > 0) {
    if (behavior === 'smooth') { settlePageAt(0, { documentRef, windowRef, behavior }); return true }
    cancelNavigationMotion(scroller)
    try { windowRef.scrollTo?.({ top: 0, behavior: 'instant' }) } catch { /* legacy fallback below */ }
    if (scroller.scrollTop !== 0) scroller.scrollTop = 0
  }
  return true
}

export function restoreTopScrollForHeaderFocus(target, {
  documentRef = document,
  windowRef = window,
  behavior = 'instant',
} = {}) {
  const control = target?.closest?.(HEADER_CONTROL)
  if (!control?.closest?.('.topbar') || control.closest?.('.profile-menu')) return false

  const scroller = documentRef.scrollingElement || documentRef.documentElement
  if (!scroller) return false

  if ((scroller.scrollTop || 0) > 0 || (windowRef.scrollY || 0) > 0) {
    if (behavior === 'smooth') { settlePageAt(0, { documentRef, windowRef, behavior }); return true }
    cancelNavigationMotion(scroller)
    // An instant request cancels a pending native smooth-scroll animation.
    // The direct scrollTop assignment covers older embedded WebViews.
    try {
      windowRef.scrollTo?.({ top: 0, behavior: 'instant' })
    } catch {
      // Fallback below is supported even when scrollTo options are rejected.
    }
    if (scroller.scrollTop !== 0) scroller.scrollTop = 0
  }
  return true
}
