import { describe, expect, it, vi } from 'vitest'
import { initialProfileEmail, nextEmailPreferences, isValidEmailAddress, emailAddressConfirmed } from '../src/notifications/profileEmailModel.js'
import { createEmailTokens } from '../server/email/tokens.mjs'
import { createResendTransport } from '../server/email/transport.mjs'
import { notificationMailModel } from '../server/email/eligibility.mjs'
import { titleNotificationEmail, verificationEmail } from '../server/email/templates.mjs'
import { createEmailActionHandler } from '../server/email/http.mjs'

const now = Date.parse('2026-10-14T08:00:00Z')
const prefs = nextEmailPreferences(null, { email: 'Person@Example.org', enabled: true, expectedRevision: 0 }, now - 1000)
const proof = { status: 'verified', email: prefs.email, addressVersion: 1, verifiedAt: now - 1000 }
const watch = { schemaVersion: 2, type: 'movie', tmdbId: 123, kind: 'included', title: '<Ein Film>', activationId: 'a', status: 'completed', completionNotificationId: 'movie-123-included-a-initial' }
const message = { schemaVersion: 2, titleType: 'movie', tmdbId: 123, kind: 'included', mediaTitle: watch.title, phase: 'included-found', expiresAt: now + 86400000 }
const modelArgs = { eventId: watch.completionNotificationId, message, watch, preferences: prefs, verification: proof, createdAt: now, now, liveAfter: now - 5000 }

describe('profile email contract', () => {
  it('prefills only missing primary settings and preserves explicit empty/custom addresses', () => {
    expect(initialProfileEmail({ role: 'primary' }, 'Person@Example.org')).toBe('Person@example.org')
    expect(initialProfileEmail({ role: 'member' }, 'Person@Example.org')).toBe('')
    expect(initialProfileEmail({ role: 'primary' }, 'Person@Example.org', { email: '' })).toBe('')
    expect(initialProfileEmail({ role: 'primary' }, 'Person@Example.org', { email: 'other@example.org' })).toBe('other@example.org')
  })
  it('uses optimistic revision checks and revokes trust when an address changes away and back', () => {
    expect(() => nextEmailPreferences(prefs, { email: prefs.email, enabled: false, expectedRevision: 0 }, now)).toThrow('anderen Gerät')
    const changed = nextEmailPreferences(prefs, { email: 'other@example.org', enabled: true, expectedRevision: 1 }, now)
    const back = nextEmailPreferences(changed, { email: prefs.email, enabled: true, expectedRevision: 2 }, now)
    expect(emailAddressConfirmed(prefs, proof)).toBe(true)
    expect(emailAddressConfirmed(back, proof)).toBe(false)
    expect(back.addressVersion).toBe(3)
  })
  it.each(['a..b@example.org', '.a@example.org', 'x\n@example.org', 'a@-example.org', 'a@example', 'a@@example.org'])('rejects malformed address %s', (address) => {
    expect(isValidEmailAddress(address)).toBe(false)
  })
  it('requires valid recipients when enabled but supports a saved blank off value', () => {
    expect(() => nextEmailPreferences(null, { email: '', enabled: true, expectedRevision: 0 }, now)).toThrow()
    expect(nextEmailPreferences(null, { email: '', enabled: false, expectedRevision: 0 }, now)).toMatchObject({ email: '', addressVersion: 1, enabled: false })
  })
})

describe('mail eligibility and rendering', () => {
  it('allows a completed included watch and refuses replays after opt-in/verification/address change', () => {
    expect(notificationMailModel(modelArgs)?.phase).toBe('included-found')
    for (const change of [{ liveAfter: now + 1 }, { preferences: { ...prefs, updatedAt: now + 1 } },
      { verification: { ...proof, verifiedAt: now + 1 } }, { preferences: { ...prefs, enabled: false } },
      { verification: { ...proof, addressVersion: 2 } }, { watch: null }, { watch: { ...watch, activationId: 'b' } }]) {
      expect(notificationMailModel({ ...modelArgs, ...change })).toBeNull()
    }
  })
  it('supports both TV phases, rejects cancelled/expired schedules and first notices after start', () => {
    const tvWatch = { ...watch, kind: 'tv', status: 'active' }
    const tvMessage = { ...message, kind: 'tv', phase: 'tv-found', scheduleStatus: 'scheduled', stationName: 'ZDF', airingStartAt: now + 4 * 60000, airingEndsAt: now + 3600000 }
    const tv = { ...modelArgs, eventId: 'movie-123-tv-a-initial', watch: tvWatch, message: tvMessage }
    expect(notificationMailModel(tv)?.phase).toBe('tv-found')
    expect(notificationMailModel({ ...tv, now: tvMessage.airingStartAt })).toBeNull()
    expect(notificationMailModel({ ...tv, message: { ...tvMessage, scheduleStatus: 'cancelled' } })).toBeNull()
    const final = { ...tv, eventId: 'movie-123-tv-a-final', watch: { ...tvWatch, status: 'completed', completionNotificationId: 'movie-123-tv-a-final' }, message: { ...tvMessage, phase: 'tv-final' } }
    expect(notificationMailModel(final)?.phase).toBe('tv-final')
    expect(notificationMailModel({ ...final, now: tvMessage.airingEndsAt })).toBeNull()
    expect(notificationMailModel({ ...final, message: { ...final.message, airingStartAt: now + 6 * 60000 } })).toBeNull()
  })
  it('escapes content, formats German airing times, and includes an opt-out link', () => {
    const mail = titleNotificationEmail({ phase: 'tv-final', title: '<img src=x onerror=alert(1)>', profileName: 'Familie', stationName: 'ZDF', airingStartAt: now, sentAt: now, url: 'https://example.org', unsubscribeUrl: 'https://example.org/action#token' })
    expect(mail.html).toContain('&lt;img')
    expect(mail.html).not.toContain('<img')
    expect(mail.text).toContain('14.10.2026 um 10:00 Uhr')
    expect(mail.subject).toContain('Jetzt im TV')
    expect(mail.text).toContain('E-Mail-Mitteilungen ausschalten:')
    expect(verificationEmail({ profileName: 'Kind', url: 'https://example.org/action#token' }).text).toContain('24 Stunden')
  })
})

describe('tokens, transport and HTTP boundary', () => {
  const tokens = createEmailTokens('test-key-for-local-tests-only-1234567890')
  const payload = { purpose: 'confirm', uid: 'u', profileId: 'p', revision: 1, addressVersion: 1, expiresAt: now + 1000 }
  it('rejects altered, expired and wrong-key tokens', () => {
    const token = tokens.issue(payload)
    expect(tokens.read(token, now)).toMatchObject(payload)
    expect(() => tokens.read(token + 'x', now)).toThrow('invalid-link')
    expect(() => tokens.read(token, now + 1000)).toThrow('invalid-link')
    expect(() => createEmailTokens('different-local-test-key-12345678900').read(token, now)).toThrow('invalid-link')
  })
  it('makes no network request without all live configuration', async () => {
    const fetch = vi.fn()
    const transport = createResendTransport({}, fetch)
    expect(transport.enabled).toBe(false)
    await expect(transport.send({})).rejects.toThrow('mail-disabled')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('sends fixed fields with idempotency and hides provider responses on failures', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'test-id' }) }).mockResolvedValueOnce({ ok: false, status: 429 })
    const transport = createResendTransport({ MOVIE_HUB_EMAIL_ENABLED: 'true', MOVIE_HUB_EMAIL_FROM: 'MovieHub <notice@example.org>', RESEND_API_KEY: 're_test', MOVIE_HUB_EMAIL_TOKEN_KEY: 'local-test-only-key-1234567890123456', MOVIE_HUB_EMAIL_LIVE_AFTER: new Date(now).toISOString() }, fetch)
    const input = { to: 'recipient@example.org', subject: 'Film', html: '<p>Film</p>', text: 'Film', idempotencyKey: 'test-job' }
    await expect(transport.send(input)).resolves.toEqual({ providerId: 'test-id' })
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('test-job')
    expect(JSON.parse(fetch.mock.calls[0][1].body).to).toEqual(['recipient@example.org'])
    await expect(transport.send(input)).rejects.toMatchObject({ code: 'mail-http-429', retryable: true })
  })
  it('does not consume tokens on GET; only explicit JSON POST invokes the action', async () => {
    const service = { enabled: true, applyToken: vi.fn().mockResolvedValue('confirmed') }
    const handler = createEmailActionHandler(service)
    const res = { set: vi.fn(), status: vi.fn(), type: vi.fn(), send: vi.fn(), json: vi.fn() }
    res.status.mockReturnValue(res); res.type.mockReturnValue(res)
    await handler({ method: 'GET', query: { token: 'ignored' } }, res)
    expect(service.applyToken).not.toHaveBeenCalled()
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('history.replaceState'))
    await handler({ method: 'POST', is: () => true, body: { token: 'signed-token' } }, res)
    expect(service.applyToken).toHaveBeenCalledWith('signed-token')
    expect(res.json).toHaveBeenLastCalledWith({ status: 'confirmed' })
  })
})
