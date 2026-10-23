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
  it('loads missing or stale reuse candidates instead of aborting the generation', async () => {
    const loadTitle = vi.fn(async entry => completeMovie(entry.tmdbId, 'Nachgeladen', '2026-10-11T10:00:00.000Z'))
    const result = await executeTitlePriorityQueue({
      preview: { kind: 'title-priority-preview', queue: [queueEntry('movie:4513', 'reuse-canonical')], selectedKeys: ['movie:4513'] },
      candidateValues: new Map([['movie:4513', [completeMovie(4513, 'Zu alt', '2026-10-01T10:00:00.000Z')]]]),
      now: new Date('2026-10-11T10:00:00.000Z'), loadTitle,
    })
    expect(loadTitle).toHaveBeenCalledTimes(1)
    expect(result.summary.counts).toMatchObject({ fetched: 1, reused: 0, reuseFallbacks: 1, canonicalReady: 1 })
  })
  it('keeps TMDB failures and budget exhaustion fail-closed during a reuse fallback', async () => {
    await expect(executeTitlePriorityQueue({
      preview: { kind: 'title-priority-preview', queue: [queueEntry('movie:4513', 'reuse-canonical')], selectedKeys: ['movie:4513'] },
      loadTitle: async () => { throw Object.assign(new Error('budget exhausted'), { code: 'TMDB_REQUEST_BUDGET' }) },
    })).rejects.toMatchObject({ code: 'TMDB_REQUEST_BUDGET' })
  })
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
      reuseFallbacks: 0,
      notFound: 0,
      canonicalReady: 2,
    })
  })

  it('skips a permanent TMDB 404 without blocking other selected titles', async () => {
    const preview = {
      kind: 'title-priority-preview',
      queue: [queueEntry('movie:1', 'fetch-tmdb'), queueEntry('movie:2', 'fetch-tmdb')],
      selectedKeys: ['movie:1', 'movie:2'],
    }
    const loadTitle = vi.fn(async (entry) => {
      if (entry.tmdbId === 1) {
        throw Object.assign(new Error('not found'), { code: 'TMDB_METADATA_NOT_FOUND', status: 404 })
      }
      return completeMovie(2, 'Bleibt verarbeitbar')
    })

    const result = await executeTitlePriorityQueue({ preview, loadTitle })
    expect([...result.updates.keys()]).toEqual(['movie:2'])
    expect(result.summary.counts).toMatchObject({
      selected: 2,
      fetched: 1,
      notFound: 1,
      canonicalReady: 1,
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
    const profileDocument = {
      ref: { path: 'users/alice/profiles/main/titles/movie-11' },
      data: () => ({
        titleRef: { tmdbId: 11, type: 'movie' },
        bootstrapSnapshot: { ...canonical, title: 'Temporär' },
        watchlist: true,
        catalogRelevant: true,
      }),
    }
    const values = collectCanonicalCandidateValues({
      catalog: { titles: [canonical] },
      personalDocuments: [personalDocument],
      profileDocuments: [profileDocument],
      movieHubDocuments: [movieHubDocument],
    })
    expect(values.get('movie:11')).toHaveLength(4)

    const plan = buildCanonicalFanoutPlan({
      updates: new Map([['movie:11', canonical]]),
      catalog: { titles: [{ ...canonical, title: 'Alter Katalogtitel' }] },
      searchIndex: { entries: [{ id: 'tmdb-movie-11', tmdbId: 11, type: 'movie', title: 'Star Wars', providerIds: ['prime'] }] },
      searchShards: new Map(),
      waipuTitles: { entries: [{ tmdbId: 11, type: 'movie', title: 'Alt', airings: [{ stationId: 'zdf' }] }] },
      joynTitles: { entries: [{ tmdbId: 11, type: 'movie', title: 'Alt', airings: [{ stationId: 'joyn.zdf', playbackRoutes: [{ providerId: 'joyn', target: 'joyn-route' }] }] }] },
      personalDocuments: [personalDocument],
      profileDocuments: [profileDocument],
      movieHubDocuments: [movieHubDocument],
      generatedAt: '2026-09-20T05:00:00.000Z',
    })

    expect(plan.catalog.titles[0]).toMatchObject({ title: 'Alter Katalogtitel', metadataComplete: true })
    expect(plan.waipuTitles.entries[0]).toMatchObject({
      metadataComplete: true,
      airings: [{ stationId: 'zdf' }],
    })
    expect(plan.joynTitles.entries[0]).toMatchObject({ metadataComplete: true, airings: [{ stationId: 'joyn.zdf', playbackRoutes: [{ providerId: 'joyn', target: 'joyn-route' }] }] })
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
    expect(plan.firestoreWrites[1]).toMatchObject({
      data: {
        titleRef: { tmdbId: 11, type: 'movie' },
        canonicalReady: true,
        canonicalMetadataVersion: 3,
      },
      deleteFields: ['bootstrapSnapshot', 'titleSnapshot'],
    })
    expect(plan.firestoreWrites[2].data.titleRef).toMatchObject({
      tmdbId: 11,
      metadataComplete: true,
      metadataChecks: movieChecks,
    })
    expect(plan.counts).toEqual({
      catalogUpdated: 1,
      waipuUpdated: 1,
      joynUpdated: 1,
      searchDetailsUpdated: 1,
      searchIndexAdded: 0,
      personalUpdated: 1,
      profileUpdated: 1,
      movieHubUpdated: 1,
      firestoreWrites: 3,
    })
  })

  it('imports only independently approved YouTube titles to existing browse and search without changing TMDB providers', () => {
    const existing = completeMovie(11, 'Existing TMDB Film')
    const newFilm = completeMovie(77, 'New verified YouTube movie')
    const updates = new Map([
      ['movie:11', existing], ['movie:77', newFilm],
    ])
    const plan = buildCanonicalFanoutPlan({
      updates,
      youtubeApprovedKeys: new Set(['movie:77', 'movie:11', 'movie:999']),
      catalog: { titles: [existing] },
      searchIndex: { entries: [] },
      searchShards: new Map(),
      generatedAt: '2026-10-23T06:00:00.000Z',
    })
    expect(plan.catalog.titles.map(x => x.tmdbId)).toEqual([11, 77])
    expect(plan.counts.youtubeCatalogAdded).toBe(1)
    expect(plan.catalog.titles[1]).toMatchObject({
      title: 'New verified YouTube movie',
      metadataComplete: true,
    })
    // Never synthesize YouTube provider membership from an editorial playlist.
    expect(plan.catalog.titles[1].providerIds).toEqual(newFilm.providerIds)
    expect(plan.searchIndex.entries.map(x => x.tmdbId)).toEqual([11, 77])
    expect(plan.firestoreWrites).toHaveLength(0)
    const again = buildCanonicalFanoutPlan({
      updates,
      youtubeApprovedKeys: new Set(['movie:77']),
      catalog: plan.catalog,
      searchIndex: plan.searchIndex,
      searchShards: plan.searchShards,
    })
    expect(again.catalog.titles).toHaveLength(2)
    expect(again.counts.youtubeCatalogAdded).toBeUndefined()
  })

  it('never imports unapproved YouTube hypotheses from queue-only updates', () => {
    const newFilm = completeMovie(77, 'New candidate')
    const plan = buildCanonicalFanoutPlan({
      updates: new Map([['movie:77', newFilm]]),
      catalog: { titles: [] },
      searchIndex: { entries: [] },
      searchShards: new Map(),
    })
    expect(plan.catalog.titles).toEqual([])
    expect(plan.counts.youtubeCatalogAdded).toBeUndefined()
    // The normal executor may publish search refs for other canonical sources.
    expect(plan.searchIndex.entries).toHaveLength(1)
  })

  it('publishes a profile-only title to the shared search detail before discarding its bootstrap', () => {
    const canonical = completeMovie(77, 'Profilfilm')
    const profileDocument = {
      ref: { path: 'users/alice/profiles/main/titles/movie-77' },
      data: () => ({
        titleRef: { tmdbId: 77, type: 'movie' },
        bootstrapSnapshot: canonical,
        favorite: true,
        catalogRelevant: true,
      }),
    }
    const plan = buildCanonicalFanoutPlan({
      updates: new Map([['movie:77', canonical]]),
      searchIndex: { kind: 'search-index', entries: [] },
      searchShards: new Map(),
      profileDocuments: [profileDocument],
      generatedAt: '2026-09-20T05:00:00.000Z',
    })

    expect(plan.searchIndex.entries).toMatchObject([{
      tmdbId: 77,
      type: 'movie',
      title: 'Profilfilm',
      scope: 'public',
    }])
    expect(plan.searchShards.get('0d').entries[0]).toMatchObject({
      tmdbId: 77,
      title: 'Profilfilm',
      canonicalPublished: true,
    })
    expect(plan.firestoreWrites[0].deleteFields).toEqual(['bootstrapSnapshot', 'titleSnapshot'])
    expect(plan.counts).toMatchObject({
      searchIndexAdded: 1,
      searchDetailsUpdated: 1,
      profileUpdated: 1,
    })
  })
})
