export const CONTENT_VIEW_IDS = Object.freeze(['home', 'movies', 'series', 'tv', 'library'])

export const CONTENT_ACTIVATION_STATE = Object.freeze({
  HERO: 'hero',
  FALLBACK: 'fallback',
  WAITING: 'waiting',
  INVALID: 'invalid',
})

export function resolveContentActivationFocus(viewId, root = document) {
  if (!CONTENT_VIEW_IDS.includes(viewId)) {
    return { state: CONTENT_ACTIVATION_STATE.INVALID, target: null }
  }

  const page = root.querySelector(`[data-content-page="${viewId}"]`)
  const hero = page?.querySelector('.hero-carousel[data-focusable="true"]')
  if (hero) return { state: CONTENT_ACTIVATION_STATE.HERO, target: hero }

  if (!page || page.getAttribute?.('data-page-load-state') !== 'rows') {
    return { state: CONTENT_ACTIVATION_STATE.WAITING, target: null }
  }

  return {
    state: CONTENT_ACTIVATION_STATE.FALLBACK,
    target: root.querySelector(`[data-content-view="${viewId}"]`),
  }
}

export function getContentActivationFocusTarget(viewId, root = document) {
  return resolveContentActivationFocus(viewId, root).target
}

export function focusContentActivationTarget(viewId, root = document) {
  const target = getContentActivationFocusTarget(viewId, root)
  if (!target || typeof target.focus !== 'function') return null

  target.focus({ preventScroll: true })
  return target
}
