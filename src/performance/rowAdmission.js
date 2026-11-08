// Admission order is based on the actual viewport, not the logical row type.
// Categories, providers, personal rows and Top 10 retain their on-screen order;
// only near-viewport mounts are staggered to avoid a burst of image decodes.
export const ROW_ADMISSION_STAGGER_MS = 90

export function orderVirtualRowsForAdmission(items, { scrollTop = 0, viewportHeight = 0 } = {}) {
  const top = Math.max(0, Number(scrollTop) || 0)
  const bottom = top + Math.max(0, Number(viewportHeight) || 0)
  const distance = (row) => {
    const start = Number(row?.start) || 0
    const end = start + Math.max(0, Number(row?.size) || 0)
    return Math.max(0, top - end, start - bottom)
  }

  return [...(Array.isArray(items) ? items : [])].sort(
    (a, b) => distance(a) - distance(b) || a.index - b.index,
  )
}
