export const RESTORE_POSTER_FOCUS_EVENT = 'moviehub:restore-poster-focus'

export function resolvePosterIndex(items, id, fallback = 0) {
  const index = id == null ? -1 : items.findIndex((item) => String(item.id) === String(id))
  return index >= 0 ? index : Math.max(0, Math.min(items.length - 1, Number(fallback) || 0))
}

export function capturePosterAnchor(element) {
  const card = element?.closest?.('.poster-card')
  const row = card?.closest?.('[data-row-id]')
  if (!row) return null
  return { rowId: row.dataset.rowId, rowIndex: Number(row.dataset.rowIndex) || 0,
    itemId: card.dataset.posterId, index: Number(card.dataset.posterIndex) || 0 }
}

export function focusPosterAnchor(anchor, root = document) {
  if (!anchor) return false
  const rows = [...root.querySelectorAll('[data-row-id]')]
  const row = rows.find((candidate) => candidate.dataset.rowId === anchor.rowId)
  if (!row) return false
  const cards = [...row.querySelectorAll('.poster-card')]
  const card = cards.find((candidate) => candidate.dataset.posterId === String(anchor.itemId))
    || cards[Math.max(0, Math.min(cards.length - 1, anchor.index))]
  if (!card) return false
  card.focus({ preventScroll: true })
  return true
}

export function restorePosterAnchor(anchor) {
  if (!anchor) return false
  // The virtualizer owns row mounting and the horizontal render window.
  const detail = { anchor, handled: false }
  window.dispatchEvent(new CustomEvent(RESTORE_POSTER_FOCUS_EVENT, { detail }))
  return detail.handled || focusPosterAnchor(anchor)
}
