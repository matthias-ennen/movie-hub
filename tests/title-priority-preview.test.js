import { describe, expect, it } from 'vitest'
import {
  buildTitleCandidateState,
  buildTitlePriorityPreview,
  summarizeTitlePriorityPreview,
} from '../scripts/build-title-priority-preview.mjs'

function candidate(key, metadata = {}, sources = ['browse']) {
  const [type, id] = key.split(':')
  return {
    key,
    type,
    tmdbId: Number(id),
    sources,
    metadata: {
      strictCompleteAvailable: true,
      freshCompleteAvailable: true,
      incompleteReferences: 0,
      staleReferences: 0,
      failedReferences: 0,
      structuralGapReferences: 0,
      structuralOnlyGapReferences: 0,
      referencesWithoutUpdatedAt: 0,
      oldestUpdatedAt: '2026-09-20T00:00:00.000Z',
      latestUpdatedAt: '2026-09-20T00:00:00.000Z',
      sourceStates: {},
      ...metadata,
    },
  }
}

describe('read-only Titelprioritätsvorschau', () => {
  it('ordnet jede Identität höchstens einmal ein und hält die Prioritätsreihenfolge ein', () => {
    const inventory = {
      kind: 'title-candidate-inventory',
      generatedAt: '2026-09-20T03:17:00.000Z',
      candidates: [
        candidate('movie:1', { incompleteReferences: 1, freshCompleteAvailable: false }),
        candidate('movie:2'),
        candidate('series:3'),
        candidate('movie:4', { staleReferences: 1, freshCompleteAvailable: false }),
        candidate('series:5'),
      ],
    }
    const previousState = {
      kind: 'title-candidate-state',
      schemaVersion: 1,
      generatedAt: '2026-09-19T03:17:00.000Z',
      keys: ['movie:1', 'movie:2', 'movie:4', 'movie:99'],
    }
    const changeSet = {
      kind: 'tmdb-change-set',
      generatedAt: '2026-09-20T03:17:00.000Z',
      pending: { movie: [{ id: 2 }], series: [] },
    }

    const preview = buildTitlePriorityPreview({ inventory, previousState, changeSet, capacity: 3 })

    expect(preview.queue.map(({ key }) => key)).toEqual(['movie:1', 'series:3', 'series:5', 'movie:2', 'movie:4'])
    expect(preview.queue.map(({ priority }) => priority.rank)).toEqual([1, 2, 2, 3, 5])
    expect(preview.counts).toMatchObject({
      queued: 5,
      selectedWithinCapacity: 3,
      backlog: 2,
      fetchRequired: 3,
      reusableCanonical: 2,
      upToDate: 0,
      newCandidates: 2,
      departedCandidates: 1,
      duplicateQueueEntries: 0,
      priorities: {
        'incomplete-or-failed': 1,
        'new-catalog-relevant': 2,
        'tmdb-changed': 1,
        'structural-gap': 0,
        stale: 1,
      },
    })
    expect(preview.selectedKeys).toEqual(['movie:1', 'series:3', 'series:5'])
    expect(preview.queue.find(({ key }) => key === 'movie:2')).toMatchObject({
      action: 'fetch-tmdb',
      fetchRequired: true,
    })
  })

  it('reuses a fresh canonical copy when another membership is incomplete', () => {
    const inventory = {
      kind: 'title-candidate-inventory',
      candidates: [candidate('movie:11', {
        strictCompleteAvailable: true,
        freshCompleteAvailable: true,
        incompleteReferences: 1,
      }, ['browse', 'personal-tmdb'])],
    }
    const preview = buildTitlePriorityPreview({ inventory, capacity: 10 })
    expect(preview.queue[0]).toMatchObject({
      key: 'movie:11',
      priority: { rank: 1, id: 'incomplete-or-failed' },
      action: 'reuse-canonical',
      fetchRequired: false,
    })
    expect(preview.inputs.baselineAvailable).toBe(false)
    expect(preview.counts.newCandidates).toBeNull()
  })

  it('publishes a complete profile bootstrap even when no previous candidate baseline exists', () => {
    const inventory = {
      kind: 'title-candidate-inventory',
      candidates: [candidate('movie:77', {
        canonicalPublicationPending: true,
      }, ['profile-state'])],
    }

    const preview = buildTitlePriorityPreview({ inventory, previousState: null, capacity: 10 })

    expect(preview.queue[0]).toMatchObject({
      key: 'movie:77',
      priority: { rank: 2, id: 'new-catalog-relevant' },
      reasons: ['new-catalog-relevant'],
      action: 'reuse-canonical',
      fetchRequired: false,
    })
  })

  it('does not interpret a missing changes artifact as an empty verified change set', () => {
    const inventory = { candidates: [candidate('movie:11')] }
    const preview = buildTitlePriorityPreview({ inventory })
    expect(preview.inputs.changeSetAvailable).toBe(false)
    expect(preview.counts).toMatchObject({ queued: 0, upToDate: 1 })
  })

  it('does not requeue a TMDB change already covered by newer canonical metadata', () => {
    const inventory = {
      candidates: [candidate('movie:11', {
        oldestUpdatedAt: '2026-09-20T03:20:00.000Z',
        latestUpdatedAt: '2026-09-20T03:20:00.000Z',
      })],
    }
    const changeSet = {
      kind: 'tmdb-change-set',
      generatedAt: '2026-09-20T03:17:00.000Z',
      pending: {
        movie: [{ id: 11, lastSeen: '2026-09-20T03:17:00.000Z' }],
        series: [],
      },
    }

    const preview = buildTitlePriorityPreview({ inventory, changeSet })

    expect(preview.queue).toEqual([])
    expect(preview.counts).toMatchObject({ queued: 0, fetchRequired: 0, upToDate: 1 })
  })

  it('fans out a newer canonical copy when another membership predates a TMDB change', () => {
    const inventory = {
      candidates: [candidate('movie:11', {
        oldestUpdatedAt: '2026-09-19T00:00:00.000Z',
        latestUpdatedAt: '2026-09-20T03:20:00.000Z',
      }, ['browse', 'personal-tmdb'])],
    }
    const changeSet = {
      kind: 'tmdb-change-set',
      pending: {
        movie: [{ id: 11, lastSeen: '2026-09-20T03:17:00.000Z' }],
        series: [],
      },
    }

    const preview = buildTitlePriorityPreview({ inventory, changeSet })

    expect(preview.queue[0]).toMatchObject({
      key: 'movie:11',
      priority: { id: 'tmdb-changed' },
      action: 'reuse-canonical',
      fetchRequired: false,
    })
  })

  it('uses the structural priority only when the V3 structure check is the remaining gap', () => {
    const inventory = {
      candidates: [candidate('series:12', {
        strictCompleteAvailable: false,
        freshCompleteAvailable: false,
        incompleteReferences: 1,
        structuralGapReferences: 1,
        structuralOnlyGapReferences: 1,
      })],
    }
    const preview = buildTitlePriorityPreview({ inventory })
    expect(preview.queue[0]).toMatchObject({
      priority: { rank: 4, id: 'structural-gap' },
      action: 'fetch-tmdb',
    })
  })

  it('writes a compact state and a summary without queue identities', () => {
    const inventory = {
      generatedAt: '2026-09-20T03:17:00.000Z',
      candidates: [candidate('series:2'), candidate('movie:1')],
    }
    expect(buildTitleCandidateState(inventory)).toEqual({
      schemaVersion: 1,
      kind: 'title-candidate-state',
      generatedAt: '2026-09-20T03:17:00.000Z',
      keys: ['movie:1', 'series:2'],
    })
    const summary = summarizeTitlePriorityPreview(buildTitlePriorityPreview({ inventory }))
    expect(summary.kind).toBe('title-priority-preview-summary')
    expect(summary).not.toHaveProperty('queue')
    expect(summary).not.toHaveProperty('selectedKeys')
  })
})
