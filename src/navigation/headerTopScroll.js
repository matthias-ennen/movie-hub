// The header is sticky: scrollIntoView({ block: 'nearest' }) can leave the
// document far below its true start. Header focus needs an explicit top edge.
const HEADER_CONTROL = '.brand-button[data-focusable="true"], .nav-link[data-focusable="true"], .icon-button[data-focusable="true"], .profile-button[data-focusable="true"]'

export function restoreTopScrollForHeaderFocus(target, {
  documentRef = document,
  windowRef = window,
} = {}) {
  const control = target?.closest?.(HEADER_CONTROL)
  if (!control?.closest?.('.topbar') || control.closest?.('.profile-menu')) return false

  const scroller = documentRef.scrollingElement || documentRef.documentElement
  if (!scroller) return false

  if ((scroller.scrollTop || 0) > 0 || (windowRef.scrollY || 0) > 0) {
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
