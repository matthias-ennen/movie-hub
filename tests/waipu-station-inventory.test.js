import { describe, expect, it } from 'vitest'
import {
  buildWaipuStationInventory,
  renderWaipuStationInventoryMarkdown,
  stationHints,
  stationMatchKey,
} from '../scripts/waipu-station-inventory.mjs'

describe('Waipu station inventory', () => {
  it('normalizes quality suffixes, punctuation and common separators', () => {
    expect(stationMatchKey('Warner TV Film HD')).toBe('warnertvfilm')
    expect(stationMatchKey('Warner-TV Film')).toBe('warnertvfilm')
    expect(stationMatchKey('Love & Passion SD')).toBe('loveundpassion')
  })

  it('marks only unique normalized names as exact assignments', () => {
    const inventory = buildWaipuStationInventory(
      ['Das Erste HD', 'Film Total HD', 'Ohne Treffer HD'],
      [
        { id: 'ard', displayName: 'Das Erste' },
        { id: 'film-a', displayName: 'Film Total' },
        { id: 'film-b', displayName: 'Film Total HD' },
        { id: 'technical-only', displayName: 'Nur technisch' },
      ],
      { generatedAt: '2026-09-22T12:00:00.000Z' },
    )

    expect(inventory.counts).toMatchObject({
      official: 3,
      technical: 4,
      matchedOfficial: 1,
      ambiguousOfficial: 1,
      unmatchedOfficial: 1,
      technicalOnly: 1,
    })
    expect(inventory.official.map(({ status }) => status)).toEqual(['matched', 'ambiguous', 'unmatched'])
    expect(inventory.technical.find(({ id }) => id === 'technical-only')?.status).toBe('technical-only')
  })

  it('adds cautious catch-up, VOD and regional review hints', () => {
    expect(stationHints('Kinowelt TV Catch-Up HD')).toEqual(['catch-up'])
    expect(stationHints('Beispiel VOD')).toEqual(['vod'])
    expect(stationHints('Regional TV HD')).toEqual(['regional-hint'])
    expect(stationHints('ZDF HD')).toEqual([])
  })

  it('renders unresolved assignments without implying automatic approval', () => {
    const inventory = buildWaipuStationInventory(
      ['Unbekannt HD'],
      [{ id: 'catchup', displayName: 'Beispiel Catch-Up HD' }],
      { generatedAt: '2026-09-22T12:00:00.000Z' },
    )
    const report = renderWaipuStationInventoryMarkdown(inventory)
    expect(report).toContain('Öffentlich ohne technische Zuordnung | 1')
    expect(report).toContain('Beispiel Catch-Up')
    expect(report).toContain('keine automatische Freigabe')
  })
})
