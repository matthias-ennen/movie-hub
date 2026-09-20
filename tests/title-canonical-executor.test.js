import { describe, expect, it, vi } from 'vitest'
import {
  buildCanonicalFanoutPlan,
  collectCanonicalCandidateValues,
  executeTitlePriorityQueue,
  selectReusableCanonical,
} from '../scripts/execute-title-priority-queue.mjs'

const movieChecks = {
  details: 'present',
  artwork: 'present',
  ageRating: 'absent',
  credits: 'present',
  keywords: 'absent',
  videos: 'absent',
  providers: 'present',
  collection: 'absent',
}

function completeMovie(tmdbId, title, metadataUpdatedAt = '2026-09-20T04:00:00.000Z') {
  return {
    id: `tmdb-movie-${tmdbId}`,
    tmdbId,
    type: 'movie',
    mediaType: 'movie',
    title,
    originalTitle: title,
    description: `${title} Beschreibung`,
    collectionId: null,
    collectionChecked: true,
    collectionDetails: null,
    providerIds: ['netflix'],
    metadataVersion: 3,
    metadataComplete: true,
    metadataChecks: movieChecks,
    metadataUpdatedAt,
  }
}

function queueEntry(key, action) {
  const [type, id] = key.split(':')
  return {
    key,
    type,
    tmdbId: Number(id),
    sources: ['browse'],
    priority: { rank: 1, id: 'incomplete-or-failed' },
    reasons: ['incomplete-target'],
    action,
    fetchRequired: action === 'fetch-tmdb',
  }
}

describe('kanonischer Titel-Executor', () => {
  it('loads or reuses every selected identity exactly once', async () => {
    const fetched = completeMovie(1, 'Neu geladen')
    const reusable = { ...completeMovie(2, 'Wiederverwendet'), favorite: true, privateNote: 'nicht verteilen' }
    const loadTitle = vi.fn(async () => fetched)
    const preview = {
      kind: 'title-priority-preview',
      queue: [queueEntry('movie:1', 'fetch-tmdb'), queueEntry('movie:2', 'reuse-canonical')],
      selectedKeys: ['movie:1', 'movie:2'],
    }

    const result = await executeTitlePriorityQueue({
      preview,
      candidateValues: new Map([['movie:2', [reusable]]]),
      loadTitle,
      now: new Date('2026-09-20T05:00:00.000Z'),
    })

    expect(loadTitle).toHaveBeenCalledTimes(1)
    expect(loadTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'movie:1' }), '2026-09-20T05:00:00.000Z')
    expect([...result.updates]).toEqual([
      ['movie:1', expect.objectContaining({ title: 'Neu geladen', metadataComplete: true })],
      ['movie:2', expect.objectContaining({ title: 'Wiederverwendet', metadataComplete: true })],
    ])
    expect(result.updates.get('movie:2')).not.toHaveProperty('favorite')
    expect(result.updates.get('movie:2')).not.toHaveProperty('privateNote')
    expect(result.summary.counts).toEqual({
      queued: 2,
      selected: 2,
      fetched: 1,
      reused: 1,
      canonicalReady: 2,
    })
  })

  it('rejects an incomplete result before a fan-out can start', async () => {
    const preview = {
      kind: 'title-priority-preview',
      queue: [queueEntry('movie:1', 'fetch-tmdb')],
      selectedKeys: ['movie:1'],
    }
    await expect(executeTitlePriorityQueue({
      preview,
      loadTitle: async () => ({ tmdbId: 1, type: 'movie', title: 'Unvollständig' }),
    })).rejects.toThrow('Canonical metadata is incomplete for movie:1')
  })

  it('chooses only a fresh strict V3 copy for reuse', () => {
    const old = completeMovie(1, 'Alt', '2026-07-01T00:00:00.000Z')
    const fresh = completeMovie(1, 'Frisch', '2026-09-19T00:00:00.000Z')
    expect(selectReusableCanonical([old, fresh], {
      now: new Date('2026-09-20T00:00:00.000Z'),
      maxAgeDays: 30,
    })).toBe(fresh)
  })

  it('fans one canonical copy out without losing source-specific state', () => {
    const canonical = completeMovie(11, 'Star Wars')
    const personalSet = vi.fn()
    const movieHubSet = vi.fn()
    const personalDocument = {
      ref: { path: 'users/alice/tmdbCatalog/movie-11', set: personalSet },
      data: () => ({
        tmdbId: 11,
        mediaType: 'movie',
        title: 'Alt',
        favorite: true,
        watchlist: false,
        syncedAt: '2026-09-19T00:00:00.000Z',
      }),
    }
    const movieHubDocument = {
      ref: { path: 'users/alice/sharedMedia/movie-11', set: movieHubSet },
      data: () => ({ hasMedia: true, titleRef: { tmdbId: 11, type: 'movie', title: 'Alt' } }),
    }
    const values = collectCanonicalCandidateValues({
      catalog: { titles: [canonical] },
      personalDocuments: [personalDocument],
      movieHubDocuments: [movieHubDocument],
    })
    expect(values.get('movie:11')).toHaveLength(3)

    const plan = buildCanonicalFanoutPlan({
      updates: new Map([['movie:11', canonical]]),
      catalog: { titles: [{ ...canonical, title: 'Alter Katalogtitel' }] },
      searchIndex: { entries: [{ id: 'tmdb-movie-11', tmdbId: 11, type: 'movie', title: 'Star Wars', providerIds: ['prime'] }] },
      searchShards: new Map(),
      waipuTitles: { entries: [{ tmdbId: 11, type: 'movie', title: 'Alt', airings: [{ stationId: 'zdf' }] }] },
      personalDocuments: [personalDocument],
      movieHubDocuments: [movieHubDocument],
      generatedAt: '2026-09-20T05:00:00.000Z',
    })

    expect(plan.catalog.titles[0]).toMatchObject({ title: 'Alter Katalogtitel', metadataComplete: true })
    expect(plan.waipuTitles.entries[0]).toMatchObject({
      metadataComplete: true,
      airings: [{ stationId: 'zdf' }],
    })
    expect(plan.searchShards.get('0b').entries[0]).toMatchObject({
      id: 'tmdb-movie-11',
      metadataComplete: true,
      providerIds: ['prime'],
    })
    expect(plan.firestoreWrites[0].data).toMatchObject({
      favorite: true,
      watchlist: false,
      metadataComplete: true,
      syncedAt: '2026-09-19T00:00:00.000Z',
    })
    expect(plan.firestoreWrites[1].data.titleRef).toMatchObject({
      tmdbId: 11,
      metadataComplete: true,
      metadataChecks: movieChecks,
    })
    expect(plan.counts).toEqual({
      catalogUpdated: 1,
      waipuUpdated: 1,
      searchDetailsUpdated: 1,
      personalUpdated: 1,
      movieHubUpdated: 1,
      firestoreWrites: 2,
    })
  })
})
