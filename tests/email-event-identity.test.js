import { describe, expect, it } from 'vitest'
import { mailEventIdentity } from '../server/email/eventIdentity.mjs'

const event = (kind = 'preferences') => ({ type: 'google.cloud.firestore.document.v1.written',
  document: `users/synthetic-user/profiles/main/${kind === 'preferences' ? 'emailPreferences/current' : 'notifications/tv-final-1'}`,
  params: { uid: 'synthetic-user', profileId: 'main', ...(kind === 'notification' ? { eventId: 'tv-final-1' } : {}) } })

describe('Firestore mail event identity', () => {
  it('accepts exactly matching captures for preferences and notifications', () => {
    for (const kind of ['preferences', 'notification']) expect(mailEventIdentity(event(kind), kind)).toEqual(event(kind).params)
  })
  it('rejects missing captures and invalid account/profile/event identifiers with a fixed error', () => {
    for (const value of [undefined, '', 'private@example.org', 'x'.repeat(129), '../other']) {
      for (const key of ['uid', 'profileId']) {
        const input = event(); input.params[key] = value
        expect(() => mailEventIdentity(input, 'preferences')).toThrow(/^invalid-mail-event$/)
      }
    }
    const input = event('notification'); input.params.eventId = '../other'
    expect(() => mailEventIdentity(input, 'notification')).toThrow(/^invalid-mail-event$/)
    expect(() => mailEventIdentity({}, 'preferences')).toThrow(/^invalid-mail-event$/)
  })
  it('rejects a wrong event type, unrelated collection or mismatched captures', () => {
    for (const mutate of [
      (input) => { input.type = 'google.cloud.storage.object.v1.finalized' },
      (input) => { input.document = input.document.replace('emailPreferences', 'unrelated') },
      (input) => { input.params.uid = 'another-user' },
      (input) => { input.params.profileId = 'another-profile' },
    ]) {
      const input = event(); mutate(input)
      expect(() => mailEventIdentity(input, 'preferences')).toThrow(/^invalid-mail-event$/)
    }
    expect(() => mailEventIdentity(event('notification'), 'preferences')).toThrow(/^invalid-mail-event$/)
    expect(() => mailEventIdentity(event(), 'unknown')).toThrow(/^invalid-mail-event$/)
  })
})
