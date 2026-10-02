export function prepareRowsForActiveView(currentView, targetView, buildRows) {
  if (currentView !== targetView || typeof buildRows !== 'function') return []
  const rows = buildRows()
  return Array.isArray(rows) ? rows : []
}
