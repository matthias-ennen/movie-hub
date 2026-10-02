import { insertTopTenRow } from './topTenRows.js'
import { filterRowsByExperienceVisibility } from '../profiles/profileExperienceRuntime.js'

function nonEmptyRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => Array.isArray(row?.items) && row.items.length > 0)
}

export function visiblePageRows(rows, page) {
  return filterRowsByExperienceVisibility(nonEmptyRows(rows), page)
}

export function assembleTopTenPageRows({
  page,
  rows = [],
  topTen = null,
  after,
} = {}) {
  const visibleBaseRows = visiblePageRows(rows, page)
  const withTopTen = topTen
    ? insertTopTenRow(visibleBaseRows, topTen, after)
    : visibleBaseRows
  return visiblePageRows(withTopTen, page)
}
