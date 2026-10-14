// Registered only by firestore.rules.test.js; never points at a live project.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { createEmailService } from '../server/email/service.mjs'
import { createEmailTokens } from '../server/email/tokens.mjs'
import { nextEmailPreferences } from '../src/notifications/profileEmailModel.js'

export function registerEmailServiceTests() {
  describe('email service with real emulator transactions', () => {
    let app, db, uid, ref, service, transport, auth, now
    const tokens = createEmailTokens('emulator-only-secret-not-for-live-1234567890')
    beforeAll(() => {
      if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required')
      app = initializeApp({ projectId: 'movie-hub-rules-test' }, 'email-service-tests')
      db = getFirestore(app)
    })
    afterAll(async () => { await deleteApp(app) })
    beforeEach(async () => {
      now = Date.now()
      uid = `mail-${randomUUID()}`
      ref = db.doc(`users/${uid}/profiles/main`)
      transport = { enabled: true, from: 'MovieHub <notice@example.org>', liveAfter: now - 5000,
        send: vi.fn().mockResolvedValue({ providerId: 'provider-test-id' }) }
      auth = { getUser: vi.fn().mockResolvedValue({ email: 'owner@example.org', emailVerified: true, disabled: false }) }
      service = createEmailService({ db, auth, transport, tokens, clock: () => now,
        appUrl: 'https://app.example.org', actionUrl: 'https://action.example.org' })
      await ref.set({ displayName: 'Mein Profil', role: 'primary' })
    })
    const prefsRef = () => ref.collection('emailPreferences').doc('current')
    const proofRef = () => ref.collection('emailVerification').doc('current')
    async function settings(email = 'owner@example.org') {
      const prefs = nextEmailPreferences(null, { email, enabled: true, expectedRevision: 0 }, new Date(now - 1000))
      await prefsRef().set(prefs)
      return prefs
    }
    async function includedEvent() {
      const eventId = 'movie-123-included-activation-initial'
      await ref.collection('titleAlerts').doc('movie-123-included').set({ schemaVersion: 2, type: 'movie', tmdbId: 123, kind: 'included', title: 'Film',
        activationId: 'activation', status: 'completed', completionNotificationId: eventId })
      const msg = ref.collection('notifications').doc(eventId)
      await msg.set({ schemaVersion: 2, titleType: 'movie', tmdbId: 123, kind: 'included', mediaTitle: 'Film', phase: 'included-found', expiresAt: new Date(now + 86400000) })
      // Use the database's creation time, not a client-controlled event date.
      now = (await msg.get()).createTime.toMillis() + 10
      return eventId
    }
    async function trustedSettings() {
      const prefs = await settings()
      await proofRef().set({ email: prefs.email, addressVersion: prefs.addressVersion, status: 'verified', verifiedAt: new Date(now - 1000) })
      return prefs
    }
    const tokenIn = (mail) => mail.html.match(/href="https:\/\/action\.example\.org#([^"]+)"/)?.[1]

    it('trusts only the verified account address and does not send confirmation for it', async () => {
      await settings()
      await service.reconcile(uid, 'main')
      expect((await proofRef().get()).data()).toMatchObject({ status: 'verified', source: 'firebase-auth' })
      expect(transport.send).not.toHaveBeenCalled()
    })
    it('confirms a custom address once and rejects the old token after an address change', async () => {
      const prefs = await settings('other@example.org')
      await service.reconcile(uid, 'main')
      const token = tokenIn(transport.send.mock.calls[0][0])
      expect(token).toBeTruthy()
      expect((await proofRef().get()).data().status).toBe('pending')
      await expect(service.applyToken(token)).resolves.toBe('confirmed')
      await expect(service.applyToken(token)).rejects.toThrow('invalid-link')
      await prefsRef().set(nextEmailPreferences(prefs, { email: 'new@example.org', enabled: true, expectedRevision: 1 }, new Date(now)))
      await expect(service.applyToken(token)).rejects.toThrow('invalid-link')
    })
    it('sends once under concurrent/repeated event delivery and keeps a redacted permanent ledger', async () => {
      await trustedSettings()
      const eventId = await includedEvent()
      await Promise.all([service.enqueueNotification(uid, 'main', eventId), service.enqueueNotification(uid, 'main', eventId)])
      await service.enqueueNotification(uid, 'main', eventId)
      expect(transport.send).toHaveBeenCalledTimes(1)
      const jobs = await ref.collection('emailDeliveries').get()
      expect(jobs.size).toBe(1)
      expect(jobs.docs[0].data()).toMatchObject({ state: 'submitted', attempts: 1 })
      expect(jobs.docs[0].data()).not.toHaveProperty('payload')
      expect(jobs.docs[0].data()).not.toHaveProperty('recipient')
      expect(jobs.docs[0].data()).not.toHaveProperty('queueAt')
    })
    it('retries an ambiguous send with identical bytes/key and cancels if consent changes', async () => {
      const prefs = await trustedSettings()
      const eventId = await includedEvent()
      transport.send.mockRejectedValueOnce({ code: 'mail-network', retryable: true })
      await service.enqueueNotification(uid, 'main', eventId)
      now += 61000
      await service.retryDue()
      expect(transport.send).toHaveBeenCalledTimes(2)
      expect(transport.send.mock.calls[1][0]).toEqual(transport.send.mock.calls[0][0])
      const token = tokenIn(transport.send.mock.calls[1][0])
      await expect(service.applyToken(token)).resolves.toBe('unsubscribed')
      expect((await prefsRef().get()).data()).toMatchObject({ enabled: false, revision: prefs.revision + 1 })
    })
    it.each(['opt-out', 'watch-removed', 'account-disabled'])('does not retry after %s', async (reason) => {
      const prefs = await trustedSettings()
      const eventId = await includedEvent()
      transport.send.mockRejectedValue({ code: 'mail-network', retryable: true })
      await service.enqueueNotification(uid, 'main', eventId)
      if (reason === 'opt-out') await prefsRef().set(nextEmailPreferences(prefs, { email: prefs.email, enabled: false, expectedRevision: 1 }, new Date(now)))
      if (reason === 'watch-removed') await ref.collection('titleAlerts').doc('movie-123-included').delete()
      if (reason === 'account-disabled') auth.getUser.mockResolvedValue({ disabled: true })
      now += 61000
      await service.retryDue()
      expect(transport.send).toHaveBeenCalledTimes(1)
      expect((await ref.collection('emailDeliveries').get()).docs[0].data().state).toBe('cancelled')
    })
    it('never mails an event created before confirmation and does nothing when disabled', async () => {
      await trustedSettings()
      const eventId = await includedEvent()
      await proofRef().update({ verifiedAt: new Date(now + 1) })
      await service.enqueueNotification(uid, 'main', eventId)
      expect(transport.send).not.toHaveBeenCalled()
      const disabled = createEmailService({ db, auth, tokens, transport: { ...transport, enabled: false } })
      await disabled.reconcile(uid, 'main')
      expect(await disabled.retryDue()).toBe(0)
    })
    it('limits confirmation requests per account even across profile/address changes', async () => {
      let prefs = await settings('first@example.org')
      for (let index = 0; index < 4; index++) {
        await service.reconcile(uid, 'main')
        prefs = nextEmailPreferences(prefs, { email: `other${index}@example.org`, enabled: true, expectedRevision: prefs.revision }, new Date(now))
        await prefsRef().set(prefs)
      }
      expect(transport.send).toHaveBeenCalledTimes(3)
      expect((await proofRef().get()).data().status).toBe('limited')
    })
  })
}
