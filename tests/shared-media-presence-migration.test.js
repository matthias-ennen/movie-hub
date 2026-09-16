import { describe, expect, it, vi } from 'vitest'
import {
  migrateSharedMediaPresenceParents,
  parseSharedMediaEntryPath,
} from '../scripts/migrate-shared-media-presence.mjs'

describe('shared-media presence migration', () => {
  it('accepts only user sharedMedia entry paths', () => {
    expect(parseSharedMediaEntryPath('users/u1/sharedMedia/movie-42/entries/e1')).toEqual({
      userId: 'u1',
      titleKey: 'movie-42',
      entryId: 'e1',
      parentPath: 'users/u1/sharedMedia/movie-42',
    })
    expect(parseSharedMediaEntryPath('catalog/sharedMedia/movie-42/entries/e1')).toBeNull()
    expect(parseSharedMediaEntryPath('users/u1/other/movie-42/entries/e1')).toBeNull()
  })

  it('creates a missing parent from an existing entry titleRef', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    const parentRef = { path: 'users/u1/sharedMedia/movie-42', set }
    const entrySnapshot = {
      ref: {
        path: 'users/u1/sharedMedia/movie-42/entries/e1',
        parent: { parent: parentRef },
      },
      data: () => ({
        titleRef: { tmdbId: 42, type: 'movie', title: 'Testfilm' },
      }),
    }
    const db = {
      collectionGroup: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ size: 1, docs: [entrySnapshot] }),
      })),
      getAll: vi.fn().mockResolvedValue([{ exists: false, data: () => undefined }]),
    }

    const result = await migrateSharedMediaPresenceParents({
      db,
      now: new Date('2026-09-16T06:00:00.000Z'),
    })

    expect(result).toMatchObject({
      scannedEntries: 1,
      parentGroups: 1,
      created: 1,
      repaired: 0,
      unresolved: 0,
    })
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][0]).toMatchObject({
      hasMedia: true,
      titleRef: { tmdbId: 42, type: 'movie', title: 'Testfilm' },
    })
    expect(set.mock.calls[0][1]).toEqual({ merge: true })
  })

  it('does not rewrite an already healthy parent', async () => {
    const set = vi.fn()
    const parentRef = { path: 'users/u1/sharedMedia/series-7', set }
    const titleRef = { tmdbId: 7, type: 'series', title: 'Testserie' }
    const db = {
      collectionGroup: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          size: 1,
          docs: [{
            ref: {
              path: 'users/u1/sharedMedia/series-7/entries/e1',
              parent: { parent: parentRef },
            },
            data: () => ({ titleRef }),
          }],
        }),
      })),
      getAll: vi.fn().mockResolvedValue([{
        exists: true,
        data: () => ({ hasMedia: true, titleRef }),
      }]),
    }

    const result = await migrateSharedMediaPresenceParents({ db })

    expect(result.unchanged).toBe(1)
    expect(set).not.toHaveBeenCalled()
  })
})
