// One lightweight, cancellable D-pad scroll profile for all content pages.
// Pixel scroll coordinates are animated, never poster/viewport transforms.
export const NAVIGATION_MOTION_DURATION_MS = 260
const runningMotions = new WeakMap()

export function cancelNavigationMotion(element) {
  const running = element && runningMotions.get(element)
  if (!running) return false
  running.stopped = true
  if (running.frame !== null) running.windowRef.cancelAnimationFrame?.(running.frame)
  runningMotions.delete(element)
  return true
}

export function moveScrollCoordinate(element, axis, target, {
  behavior = 'smooth', windowRef = window,
} = {}) {
  if (!element || !Number.isFinite(target)) return false
  const property = axis === 'x' ? 'scrollLeft' : 'scrollTop'
  const current = Number(element[property]) || 0
  const running = runningMotions.get(element)
  if (running && behavior === 'smooth' && running.axis === axis
    && Math.abs(running.target - target) <= 1) return true
  if (running) cancelNavigationMotion(element)
  if (Math.abs(current - target) <= 1) return false
  if (behavior !== 'smooth' || windowRef.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    || typeof windowRef.requestAnimationFrame !== 'function') {
    element[property] = target
    return true
  }

  const state = { axis, target, frame: null, stopped: false, windowRef }
  runningMotions.set(element, state)
  let startAt = null
  const animate = (now) => {
    if (state.stopped) return
    if (startAt === null) startAt = now
    const progress = Math.min(1, Math.max(0, (now - startAt) / NAVIGATION_MOTION_DURATION_MS))
    // Exactly the same ease-out curve for horizontal and vertical motion.
    const eased = 1 - (1 - progress) ** 3
    element[property] = progress === 1 ? target : current + (target - current) * eased
    if (progress < 1) state.frame = windowRef.requestAnimationFrame(animate)
    else if (runningMotions.get(element) === state) runningMotions.delete(element)
  }
  state.frame = windowRef.requestAnimationFrame(animate)
  return true
}
