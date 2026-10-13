// Shared by lazy detail dialogs and App's existing hardware-Back dispatcher.
const dialogs = new Map()

export function activeDetailDialog() {
  if (typeof document === 'undefined') return null
  const mounted = [...document.querySelectorAll('[data-detail-dialog]')]
    .filter((element) => dialogs.has(element) && element.isConnected)
  return mounted[mounted.length - 1] || null
}

function synchronizeDialogs() {
  const active = activeDetailDialog()
  const mounted = [...document.querySelectorAll('[data-detail-dialog]')].filter((element) => dialogs.has(element))
  for (const [index, element] of mounted.entries()) {
    // Portalled children must stay above the primary backdrop, regardless of
    // legacy per-feature z-indices. Attribute also supports older WebViews.
    element.parentElement.style.zIndex = String(170 + index)
    element.toggleAttribute('inert', element !== active)
    element.inert = element !== active
    if (element === active) element.removeAttribute('aria-hidden')
    else element.setAttribute('aria-hidden', 'true')
  }
}

export function registerDetailDialog(element, controls) {
  dialogs.set(element, controls)
  synchronizeDialogs()
  return () => {
    dialogs.delete(element)
    synchronizeDialogs()
  }
}

export function closeTopDetailLayer() {
  const controls = dialogs.get(activeDetailDialog())
  if (!controls || controls.primary) return false
  controls.close()
  return true
}
