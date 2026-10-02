import { describe, expect, it, vi } from 'vitest'
import { prepareRowsForActiveView } from '../src/performance/contentRowPreparation.js'

describe('active content row preparation', () => {
  it('does not execute an inactive page row builder', () => {
    const buildRows = vi.fn(() => [{ id: 'movies' }])

    expect(prepareRowsForActiveView('home', 'movies', buildRows)).toEqual([])
    expect(buildRows).not.toHaveBeenCalled()
  })

  it('executes exactly the active page row builder', () => {
    const buildRows = vi.fn(() => [{ id: 'movies' }])

    expect(prepareRowsForActiveView('movies', 'movies', buildRows))
      .toEqual([{ id: 'movies' }])
    expect(buildRows).toHaveBeenCalledOnce()
  })

  it('normalizes an invalid builder result to an empty row list', () => {
    expect(prepareRowsForActiveView('series', 'series', () => null)).toEqual([])
  })
})
