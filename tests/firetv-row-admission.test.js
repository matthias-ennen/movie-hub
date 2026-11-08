import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  orderVirtualRowsForAdmission,
  ROW_ADMISSION_STAGGER_MS,
} from '../src/performance/rowAdmission.js'

describe('#747 Fire-TV row admission', () => {
  it('prioritizes rows intersecting the viewport before earlier overscan rows', () => {
    const rows = [
      { index: 0, key: 'editorial', start: 0, size: 350 },
      { index: 1, key: 'category', start: 400, size: 350 },
      { index: 2, key: 'provider', start: 800, size: 350 },
      { index: 3, key: 'personal', start: 1400, size: 350 },
    ]
    const result = orderVirtualRowsForAdmission(rows, { scrollTop: 540, viewportHeight: 500 })
    expect(result.map((row) => row.key)).toEqual(['category', 'provider', 'editorial', 'personal'])
    expect(rows.map((row) => row.key)).toEqual(['editorial', 'category', 'provider', 'personal'])
  })

  it('preserves display order for equally visible rows and tolerates missing viewport data', () => {
    const rows = [
      { index: 4, key: 'b', start: 0, size: 350 },
      { index: 3, key: 'a', start: 0, size: 350 },
    ]
    expect(orderVirtualRowsForAdmission(rows, { scrollTop: 20, viewportHeight: 900 })
      .map((row) => row.key)).toEqual(['a', 'b'])
    expect(orderVirtualRowsForAdmission([])).toEqual([])
    expect(ROW_ADMISSION_STAGGER_MS).toBeGreaterThan(0)
    expect(ROW_ADMISSION_STAGGER_MS).toBeLessThan(150)
  })

  it('allows D-pad target and detail-return rows to bypass the stagger', () => {
    const source = readFileSync(new URL('../src/components/ProgressiveContent.jsx', import.meta.url), 'utf8')
    expect(source).toContain('orderVirtualRowsForAdmission(virtualItems')
    expect(source).toContain('ROW_ADMISSION_STAGGER_MS')
    expect(source).toContain('const targetKey = activeRows[targetIndex]?.id')
    expect(source).toContain('current.has(targetKey) ? current : new Set([...current, targetKey])')
    expect(source).toContain('current.has(row.id) ? current : new Set([...current, row.id])')
  })
})
