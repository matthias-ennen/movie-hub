import { describe, expect, it, vi } from 'vitest'
import { activeTitleWatchRows, cancelTitleWatch, titleWatchStatusText } from '../src/notifications/titleWatchManagement.js'
import { alertNotificationId } from '../src/notifications/titleAlertModel.js'

const watch = { id: 'movie-121-tv', type: 'movie', tmdbId: 121, title: 'Die zwei Türme', kind: 'tv',
  schemaVersion: 2, status: 'active', activationId: 'activation-a' }
const event = { id: alertNotificationId(watch), schemaVersion: 2, phase: 'tv-found', kind: 'tv', titleType: 'movie', tmdbId: 121,
  scheduleStatus: 'scheduled', airingStartAt: '2026-10-13T18:15:00Z', airingEndsAt: '2026-10-13T21:00:00Z', stationName: 'ZDF' }
const now = Date.parse('2026-10-12T13:00:00Z')

describe('active title watch management', () => {
  it('includes active and legacy watches while excluding completed, malformed and unknown watches', () => {
    const legacy = { ...watch, schemaVersion: 1, status: undefined, tmdbId: 2, title: 'Alien' }
    const rows = activeTitleWatchRows({
      [watch.id]: watch, 'movie-2-tv': legacy,
      'movie-3-tv': { ...watch, tmdbId: 3, status: 'completed' },
      'movie-4-tv': { ...watch, tmdbId: 4, status: 'future' },
      'movie-5-tv': { ...watch, tmdbId: 5, activationId: '' },
      'movie-6-tv': { ...watch, tmdbId: 6, title: '' },
      'movie-7-tv': watch,
    })
    expect(rows.map((row) => row.title)).toEqual(['Alien', 'Die zwei Türme'])
  })

  it('keeps both reasons for the same title as separate observations', () => {
    const included = { ...watch, id: 'movie-121-included', kind: 'included' }
    expect(activeTitleWatchRows({ [watch.id]: watch, [included.id]: included })).toHaveLength(2)
    expect(titleWatchStatusText(included, null, now)).toContain('aktivierten Anbietern')
  })

  it('formats the persisted schedule in German with explicit Berlin time', () => {
    expect(titleWatchStatusText(watch, event, now)).toBe('13.10.2026, 20:15 Uhr · ZDF · Erinnerung geplant')
    expect(titleWatchStatusText(watch, { ...event, airingStartAt: { seconds: Date.parse('2026-12-13T19:15:00Z') / 1000 } }, now))
      .toBe('13.12.2026, 20:15 Uhr · ZDF · Erinnerung geplant')
  })

  it('never attaches a past activation or another title to the current observation', () => {
    for (const change of [{ id: 'old-activation' }, { tmdbId: 99 }, { titleType: 'series' }, { kind: 'included' }, { phase: 'tv-final' }]) {
      expect(titleWatchStatusText(watch, { ...event, ...change }, now)).toContain('Wartet auf')
    }
  })

  it('reflects cancelled, shifted, running and elapsed broadcasts without claiming an upcoming reminder', () => {
    expect(titleWatchStatusText(watch, { ...event, scheduleStatus: 'cancelled' }, now)).toContain('Wartet auf')
    expect(titleWatchStatusText(watch, { ...event, airingStartAt: '2026-10-13T19:00:00Z' }, now)).toContain('21:00 Uhr')
    expect(titleWatchStatusText(watch, event, Date.parse('2026-10-13T19:00:00Z'))).toContain('Sendung läuft')
    expect(titleWatchStatusText(watch, event, Date.parse('2026-10-14T13:00:00Z'))).toContain('vergangen')
    expect(titleWatchStatusText(watch, { ...event, scheduleStatus: 'completed' }, now)).toContain('abgeschlossen')
    expect(titleWatchStatusText(watch, { ...event, airingStartAt: 'invalid' }, now)).toContain('Wartet auf')
  })
})

function transactionFor(current) {
  return { get: vi.fn(async () => ({ exists: () => Boolean(current), data: () => current })), delete: vi.fn() }
}

describe('cancelling exactly one persisted activation', () => {
  it('deletes only the selected active observation, without changing notifications or read-state', async () => {
    const transaction = transactionFor(watch)
    const ref = { path: 'users/alice/profiles/main/titleAlerts/movie-121-tv' }
    expect(await cancelTitleWatch(transaction, ref, watch)).toBe('cancelled')
    expect(transaction.delete).toHaveBeenCalledExactlyOnceWith(ref)
  })

  it('is idempotent after concurrent completion or removal', async () => {
    for (const current of [null, { ...watch, status: 'completed' }]) {
      const transaction = transactionFor(current)
      expect(await cancelTitleWatch(transaction, {}, watch)).toBe('inactive')
      expect(transaction.delete).not.toHaveBeenCalled()
    }
  })

  it('preserves a newly activated watch during a transaction retry', async () => {
    const transaction = transactionFor({ ...watch, activationId: 'activation-b' })
    expect(await cancelTitleWatch(transaction, {}, watch)).toBe('activation-changed')
    expect(transaction.delete).not.toHaveBeenCalled()
  })

  it('does not delete if the account/profile changed while the read was pending', async () => {
    const transaction = transactionFor(watch)
    expect(await cancelTitleWatch(transaction, {}, watch, () => false)).toBe('scope-changed')
    expect(transaction.delete).not.toHaveBeenCalled()
  })

  it('keeps the observation on network/read failure for a later retry', async () => {
    const transaction = { get: vi.fn().mockRejectedValue(new Error('offline')), delete: vi.fn() }
    await expect(cancelTitleWatch(transaction, {}, watch)).rejects.toThrow('offline')
    expect(transaction.delete).not.toHaveBeenCalled()
  })
})
