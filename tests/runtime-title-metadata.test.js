import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRuntimeTitleMetadata,
  loadRuntimeTitleMetadata,
  readRuntimeTitleMetadata,
} from '../src/catalog/runtimeTitleMetadata.js'

const completeChecks = {
  details: 'present',
  artwork: 'present',
  ageRating: 'absent',
  credits: 'present',
  keywords: 'absent',
  videos: 'present',
  providers: 'present',
  collection: 'absent',
}

describe('gemeinsamer Titelmetadaten-Sitzungsspeicher', () => {
  beforeEach(() => clearRuntimeTitleMetadata())

  it('teilt eine vollständige Auflösung zwischen Detailansicht und Hero', async () => {
    const compact = {
      id: 'tmdb-movie-762441',
      tmdbId: 762441,
      type: 'movie',
      title: 'A Quiet Place: Tag Eins',
    }
    const complete = {
      ...compact,
      metadataVersion: 3,
      metadataComplete: true,
      metadataChecks: completeChecks,
      collectionChecked: true,
      videos: [{ type: 'trailer', site: 'youtube', key: 'xHhhaWyuXhQ' }],
    }
    const loadComplete = vi.fn(async () => complete)

    const first = await loadRuntimeTitleMetadata(compact, {
      loadComplete,
      requireContract: true,
    })
    const second = await loadRuntimeTitleMetadata(compact, {
      loadComplete,
      requireContract: true,
    })

    expect(loadComplete).toHaveBeenCalledOnce()
    expect(first.videos).toEqual(complete.videos)
    expect(second.videos).toEqual(complete.videos)
  })

  it('behält aktuelle Laufzeit-Verfügbarkeit beim Lesen des kanonischen Details', async () => {
    const base = {
      id: 'tmdb-movie-762441',
      tmdbId: 762441,
      type: 'movie',
      title: 'A Quiet Place: Tag Eins',
    }
    await loadRuntimeTitleMetadata(base, {
      loadComplete: async () => ({
        ...base,
        metadataVersion: 3,
        metadataComplete: true,
        metadataChecks: completeChecks,
        collectionChecked: true,
        videos: [{ type: 'trailer', site: 'youtube', key: 'xHhhaWyuXhQ' }],
      }),
      requireContract: true,
    })

    const current = readRuntimeTitleMetadata({
      ...base,
      waipuLive: { nextAiring: { programId: 'current-airing' } },
    })

    expect(current.videos).toHaveLength(1)
    expect(current.waipuLive.nextAiring.programId).toBe('current-airing')
  })
})
