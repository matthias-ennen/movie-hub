export const CATALOG_RETRY_DELAYS_MS = Object.freeze([1_000, 3_000, 7_000])

function createAbortError() {
  const error = new Error('Katalogladen wurde abgebrochen.')
  error.name = 'AbortError'
  return error
}

export function waitForCatalogRetry(delayMs) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs))
}

export async function loadCatalogWithRetry(
  loadCatalog,
  {
    retryDelays = CATALOG_RETRY_DELAYS_MS,
    shouldCancel = () => false,
    wait = waitForCatalogRetry,
  } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    if (shouldCancel()) throw createAbortError()

    try {
      const catalog = await loadCatalog({ attempt })
      if (shouldCancel()) throw createAbortError()
      return catalog
    } catch (error) {
      if (shouldCancel() || error?.name === 'AbortError') throw createAbortError()
      if (attempt >= retryDelays.length) throw error
      await wait(retryDelays[attempt])
    }
  }
}
