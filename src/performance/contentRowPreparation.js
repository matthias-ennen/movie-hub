export function prepareForActiveView(currentView, targetView, buildValue, fallback = null) {
  if (currentView !== targetView || typeof buildValue !== 'function') return fallback
  return buildValue()
}

export function prepareRowsForActiveView(currentView, targetView, buildRows) {
  const rows = prepareForActiveView(currentView, targetView, buildRows, [])
  return Array.isArray(rows) ? rows : []
}
