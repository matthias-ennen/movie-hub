export const CONTENT_VIEW_IDS = Object.freeze(['home', 'movies', 'series', 'tv', 'library'])

export function getContentActivationFocusTarget(viewId, root = document) {
  if (!CONTENT_VIEW_IDS.includes(viewId)) return null

  const page = root.querySelector(`[data-content-page="${viewId}"]`)
  const hero = page?.querySelector('.hero-carousel[data-focusable="true"]')
  if (hero) return hero

  return root.querySelector(`[data-content-view="${viewId}"]`)
}

export function focusContentActivationTarget(viewId, root = document) {
  const target = getContentActivationFocusTarget(viewId, root)
  if (!target || typeof target.focus !== 'function') return null

  target.focus({ preventScroll: true })
  return target
}
