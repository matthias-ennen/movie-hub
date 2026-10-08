import { describe, expect, it } from 'vitest'
import { activeAnnouncement } from '../src/notifications/useAnnouncements.js'

const DAY = 86400000
const T0 = Date.parse('2026-10-08T10:00:00Z')
const at = (millis) => ({ toMillis: () => millis })
const personal = {
  id: 'profile:movie-121-included-session-initial', profileId: 'main',
  mode: 'inbox', schemaVersion: 2, kind: 'included',
  title: 'Jetzt inklusive', body: 'Testfilm inklusive',
  startsAt: at(T0), completedAt: at(T0), expiresAt: at(T0 + 30 * DAY),
}
const global = {
  id: 'global-1', schemaVersion: 1, status: 'published', mode: 'inbox',
  title: 'Wartung', body: 'Infos', startsAt: at(T0), expiresAt: at(T0 + 2 * DAY),
}

describe('#381 inbox visibility, legacy and global separation', () => {
  it('shows a new included notice until 7 days after the later of reading and completion', () => {
    const read = { readAt: at(T0 + 3 * DAY) }
    expect(activeAnnouncement(personal, T0 + 10 * DAY - 1, read)).toBe(true)
    expect(activeAnnouncement(personal, T0 + 10 * DAY, read)).toBe(false)
    expect(activeAnnouncement(personal, T0 + 29 * DAY, null)).toBe(true)
    expect(activeAnnouncement(personal, T0 + 30 * DAY, null)).toBe(false)
  })

  it('does not hide a read but still pending TV reminder early', () => {
    const tvFound = { ...personal, kind: 'tv', completedAt: undefined, title: 'Bald im TV' }
    expect(activeAnnouncement(tvFound, T0 + 15 * DAY, { readAt: at(T0 + DAY) })).toBe(true)
  })

  it('keeps old V1 notifications visible until their existing hard deadline', () => {
    const old = { ...personal, schemaVersion: 1, completedAt: undefined }
    expect(activeAnnouncement(old, T0 + 29 * DAY, { readAt: at(T0 + DAY) })).toBe(true)
    expect(activeAnnouncement(old, T0 + 30 * DAY, { readAt: at(T0 + DAY) })).toBe(false)
  })

  it('does not modify global admin logic, including its own earlier expiration', () => {
    expect(activeAnnouncement(global, T0 + DAY)).toBe(true)
    expect(activeAnnouncement(global, T0 + 2 * DAY)).toBe(false)
    expect(activeAnnouncement({ ...global, status: 'draft' }, T0 + DAY)).toBe(false)
    expect(activeAnnouncement({ ...global, status: 'revoked' }, T0 + DAY)).toBe(false)
  })

  it('never displays a notification from an unknown schema or outside its start', () => {
    expect(activeAnnouncement({ ...personal, schemaVersion: 9 }, T0 + DAY)).toBe(false)
    expect(activeAnnouncement(personal, T0 - 1)).toBe(false)
  })
})
