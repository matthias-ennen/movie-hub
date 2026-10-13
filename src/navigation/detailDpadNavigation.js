// DOM order defines the vertical sequence. Geometry is used only to identify
// wrapped visual rows and to choose a column inside the adjacent row.
export function detailNavigationRows(items) {
  const rows = []
  for (const item of items) {
    if (item.rect.width <= 0 || item.rect.height <= 0) continue
    const previous = rows[rows.length - 1]
    const overlap = previous
      ? Math.min(previous.bottom, item.rect.bottom) - Math.max(previous.top, item.rect.top)
      : 0
    if (previous && previous.group === item.group
        && overlap >= Math.min(previous.bottom - previous.top, item.rect.height) / 2) {
      previous.items.push(item)
      previous.top = Math.max(previous.top, item.rect.top)
      previous.bottom = Math.min(previous.bottom, item.rect.bottom)
    } else {
      rows.push({ group: item.group, top: item.rect.top, bottom: item.rect.bottom, items: [item] })
    }
  }
  return rows.map(row => row.items.sort((a, b) => a.rect.left - b.rect.left))
}

export function detailRowTarget(rows, active, direction) {
  const rowIndex = rows.findIndex(row => row.some(item => item.element === active))
  if (rowIndex < 0) return null
  const row = rows[rowIndex]
  const index = row.findIndex(item => item.element === active)
  let target = row[index]
  let targetRow = rowIndex
  if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
    target = row[index + (direction === 'ArrowLeft' ? -1 : 1)] || target
  } else if (direction === 'ArrowUp' || direction === 'ArrowDown') {
    const nextIndex = rowIndex + (direction === 'ArrowUp' ? -1 : 1)
    if (rows[nextIndex]) {
      targetRow = nextIndex
      const x = target.rect.left + target.rect.width / 2
      target = rows[nextIndex].reduce((best, item) => {
        const distance = Math.abs(item.rect.left + item.rect.width / 2 - x)
        return !best || distance < best.distance ? { item, distance } : best
      }, null).item
    }
  } else return null
  return { element: target.element, first: targetRow === 0, last: targetRow === rows.length - 1 }
}

export function detailScrollTop({ scrollTop, scrollHeight, clientHeight, top, bottom, margin = 16, first = false, last = false }) {
  const max = Math.max(0, scrollHeight - clientHeight)
  if (first) return 0
  if (last) return max
  // Taller-than-viewport controls align at the top so their heading stays readable.
  const delta = top < margin || bottom - top > clientHeight - 2 * margin
    ? top - margin : bottom > clientHeight - margin ? bottom - clientHeight + margin : 0
  return Math.max(0, Math.min(max, scrollTop + delta))
}

function scrollContainer(element, scope) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.scrollHeight > parent.clientHeight + 1
        && /^(auto|scroll)$/.test(getComputedStyle(parent).overflowY)) return parent
    if (parent === scope) break
  }
  return null
}

export function navigateDetailRows(scope, candidates, active, direction, behavior) {
  if (!scope?.matches('[data-dpad-navigation="rows"]')) return false
  // Snapshot before moving focus; no observer, polling or React state.
  const rows = detailNavigationRows(candidates.map(element => ({
    element, rect: element.getBoundingClientRect(),
    group: element.closest('[data-dpad-row-group]') || scope,
  })))
  const target = detailRowTarget(rows, active, direction)
  if (!target) return false
  target.element.focus({ preventScroll: true })
  const container = scrollContainer(target.element, scope)
  if (container) {
    const port = container.getBoundingClientRect()
    const rect = target.element.getBoundingClientRect()
    const style = getComputedStyle(container)
    const margin = Math.max(16, parseFloat(style.scrollPaddingTop) || 0, parseFloat(style.scrollPaddingBottom) || 0)
    container.scrollTo({ top: detailScrollTop({
      scrollTop: container.scrollTop, scrollHeight: container.scrollHeight, clientHeight: container.clientHeight,
      top: rect.top - port.top - container.clientTop, bottom: rect.bottom - port.top - container.clientTop,
      margin, first: target.first, last: target.last,
    }), behavior })
  }
  return true
}
