import { describe, expect, it } from 'vitest'
import { rowDefinitions, titles } from '../src/data/catalog.js'

describe('catalog fallback', () => {
  it('ships no hard-coded demo titles or rows', () => {
    expect(titles).toEqual([])
    expect(rowDefinitions).toEqual([])
  })
})
