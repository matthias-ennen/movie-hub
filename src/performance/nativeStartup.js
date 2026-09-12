export function notifyNativeStartupReady(bridge = globalThis.window?.MovieHubNative) {
  if (typeof bridge?.notifyStartupReady !== 'function') return false

  if (globalThis.window) globalThis.window.__movieHubStartupReady = true
  bridge.notifyStartupReady()
  return true
}
