import { randomUUID } from 'node:crypto'
import { emailAddressConfirmed, normalizeEmailAddress, validEmailPreferences } from '../../src/notifications/profileEmailModel.js'
import { timeMillis } from '../../src/notifications/titleAlertLifecycleModel.js'
import { watchId } from '../../src/notifications/titleAlertModel.js'
import { MAIL_MAX_ATTEMPTS, MAIL_RETRY_WINDOW, notificationMailModel } from './eligibility.mjs'
import { tokenHash } from './tokens.mjs'
import { titleNotificationEmail, verificationEmail } from './templates.mjs'

const HOUR = 3600000
const DAY = 24 * HOUR
const LEASE = 60000
const safeId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const data = (snapshot) => snapshot.exists ? snapshot.data() : null
const terminal = (job, state, now, extra = {}) => {
  const { queueAt: _queueAt, payload: _payload, tokenData: _tokenData, recipient: _recipient,
    model: _model, profileName: _profileName, ...rest } = job
  return { ...rest, state, finishedAt: new Date(now), ...extra }
}

// All callers run with a dedicated server identity. No recipient, subject or
// rendered body is accepted from the client. Firestore transactions claim work;
// network calls happen afterwards with a durable, provider-side idempotency key.
export function createEmailService({ db, auth, transport, tokens, appUrl, actionUrl, clock = Date.now }) {
  const validUrl = (value) => { try { return new URL(value).protocol === 'https:' && !new URL(value).hash } catch { return false } }
  const enabled = transport.enabled && tokens && validUrl(appUrl) && validUrl(actionUrl)
  const allowed = (email) => !transport.allowsRecipient || transport.allowsRecipient(email)
  const profileRef = (uid, profileId) => {
    if (!safeId(uid) || !safeId(profileId)) throw new Error('invalid-profile')
    return db.doc(`users/${uid}/profiles/${profileId}`)
  }
  async function accountAvailable(uid) {
    try { const user = await auth.getUser(uid); return user.disabled ? null : user }
    catch (error) { if (error.code === 'auth/user-not-found') return null; throw new Error('mail-account-unavailable') }
  }
  const link = (token) => `${actionUrl}#${token}`

  async function reconcile(uid, profileId) {
    if (!enabled) return null
    const user = await accountAvailable(uid)
    if (!user) return null
    const ref = profileRef(uid, profileId)
    const prefsRef = ref.collection('emailPreferences').doc('current')
    const proofRef = ref.collection('emailVerification').doc('current')
    const now = clock()
    const jobRef = await db.runTransaction(async (tx) => {
      const [profile, prefsSnap, proofSnap] = await Promise.all([tx.get(ref), tx.get(prefsRef), tx.get(proofRef)])
      const prefs = data(prefsSnap)
      const proof = data(proofSnap)
      if (!profile.exists || !validEmailPreferences(prefs) || !prefs.enabled || !allowed(prefs.email)
        || emailAddressConfirmed(prefs, proof)) return null
      // Trust only Firebase Admin's current account record, never a browser flag.
      if (user.emailVerified && normalizeEmailAddress(user.email) === prefs.email) {
        tx.set(proofRef, { email: prefs.email, addressVersion: prefs.addressVersion, status: 'verified',
          source: 'firebase-auth', verifiedAt: new Date(now) })
        return null
      }
      const job = ref.collection('emailDeliveries').doc(tokenHash(`confirm:${prefs.addressVersion}:${prefs.revision}`))
      const limitRef = db.doc(`emailInternal/confirm-${uid}-${Math.floor(now / HOUR)}`)
      const [existing, limitSnap] = await Promise.all([tx.get(job), tx.get(limitRef)])
      if (existing.exists) return job
      if ((data(limitSnap)?.count || 0) >= 3) {
        tx.set(proofRef, { status: 'limited', addressVersion: prefs.addressVersion, retryAfter: new Date((Math.floor(now / HOUR) + 1) * HOUR) })
        return null
      }
      const tokenData = { purpose: 'confirm', uid, profileId, addressVersion: prefs.addressVersion,
        revision: prefs.revision, expiresAt: now + DAY, challenge: randomUUID() }
      tx.set(limitRef, { count: (data(limitSnap)?.count || 0) + 1, expiresAt: new Date(now + 2 * DAY) })
      tx.set(proofRef, { email: prefs.email, addressVersion: prefs.addressVersion, revision: prefs.revision,
        status: 'pending', tokenHash: tokenHash(tokens.issue(tokenData)), expiresAt: new Date(now + DAY) })
      tx.create(job, { schemaVersion: 1, purpose: 'confirm', revision: prefs.revision,
        addressVersion: prefs.addressVersion, recipient: prefs.email, tokenData,
        profileName: String(profile.data().displayName || 'Profil').slice(0, 32),
        state: 'pending', attempts: 0, createdAt: new Date(now), expiresAt: new Date(now + MAIL_RETRY_WINDOW), queueAt: new Date(now) })
      return job
    })
    if (jobRef) await deliver(jobRef)
    return jobRef?.id || null
  }

  async function enqueueNotification(uid, profileId, eventId) {
    if (!enabled || typeof eventId !== 'string' || !/^[a-zA-Z0-9-]{1,240}$/.test(eventId)) return null
    const ref = profileRef(uid, profileId)
    const job = ref.collection('emailDeliveries').doc(tokenHash(`notice:${eventId}`))
    const now = clock()
    await db.runTransaction(async (tx) => {
      const [existing, profile, prefsSnap, proofSnap, messageSnap] = await Promise.all([
        tx.get(job), tx.get(ref), tx.get(ref.collection('emailPreferences').doc('current')),
        tx.get(ref.collection('emailVerification').doc('current')), tx.get(ref.collection('notifications').doc(eventId)),
      ])
      if (existing.exists || !profile.exists || !messageSnap.exists) return
      const message = messageSnap.data()
      const watchKey = watchId({ type: message.titleType, tmdbId: message.tmdbId }, message.kind)
      if (!watchKey) return
      const watchSnap = await tx.get(ref.collection('titleAlerts').doc(watchKey))
      const prefs = data(prefsSnap)
      if (!prefs || !allowed(prefs.email)) return
      const model = notificationMailModel({ eventId, message, watch: data(watchSnap), preferences: prefs,
        verification: data(proofSnap), profileName: profile.data().displayName,
        createdAt: timeMillis(messageSnap.createTime), now, liveAfter: transport.liveAfter })
      if (!model) return
      tx.create(job, { schemaVersion: 1, purpose: 'notice', eventId, watchKey, model,
        recipient: prefs.email, revision: prefs.revision, addressVersion: prefs.addressVersion,
        state: 'pending', attempts: 0, createdAt: new Date(now), expiresAt: new Date(model.expiresAt), queueAt: new Date(now) })
    })
    await deliver(job)
    return job.id
  }

  async function deliver(jobRef) {
    if (!enabled) return 'disabled'
    const parts = jobRef.path.split('/')
    if (parts.length !== 6 || parts[0] !== 'users' || parts[2] !== 'profiles' || parts[4] !== 'emailDeliveries') return 'invalid'
    const [, uid, , profileId] = parts
    const user = await accountAvailable(uid)
    const ref = profileRef(uid, profileId)
    const now = clock()
    const leaseId = randomUUID()
    const claimed = await db.runTransaction(async (tx) => {
      const [jobSnap, profile, prefsSnap, proofSnap] = await Promise.all([
        tx.get(jobRef), tx.get(ref), tx.get(ref.collection('emailPreferences').doc('current')),
        tx.get(ref.collection('emailVerification').doc('current')),
      ])
      const job = data(jobSnap)
      const prefs = data(prefsSnap)
      const proof = data(proofSnap)
      if (!job || !['pending', 'retry', 'sending'].includes(job.state) || timeMillis(job.queueAt) > now) return null
      const cancel = (reason) => { tx.set(jobRef, terminal(job, 'cancelled', now, { reason })); return null }
      if (!user || !profile.exists || !validEmailPreferences(prefs) || !prefs.enabled
        || prefs.revision !== job.revision || prefs.addressVersion !== job.addressVersion || prefs.email !== job.recipient) return cancel('consent-changed')
      if (!allowed(job.recipient)) return cancel('test-recipient-excluded')
      if (now >= timeMillis(job.expiresAt) || job.attempts >= MAIL_MAX_ATTEMPTS) return cancel('expired')
      if (job.purpose === 'confirm') {
        if (proof?.status !== 'pending' || proof.tokenHash !== tokenHash(tokens.issue(job.tokenData))) return cancel('confirmation-changed')
      } else if (job.purpose === 'notice') {
        const [message, watch] = await Promise.all([tx.get(ref.collection('notifications').doc(job.eventId)), tx.get(ref.collection('titleAlerts').doc(job.watchKey))])
        const current = notificationMailModel({ eventId: job.eventId, message: data(message), watch: data(watch),
          preferences: prefs, verification: proof, profileName: profile.data().displayName,
          createdAt: timeMillis(message.createTime), now, liveAfter: transport.liveAfter })
        if (!current || current.airingStartAt !== job.model.airingStartAt || current.stationName !== job.model.stationName) return cancel('event-changed')
        // An ambiguous pre-start send must never retry stale "Gleich" text after start.
        if (job.model.phase === 'tv-final' && job.payload && job.renderedAt < job.model.airingStartAt && now >= job.model.airingStartAt) return cancel('airing-started')
      } else return cancel('invalid-purpose')
      const day = Math.floor(now / DAY)
      const month = new Date(now).toISOString().slice(0, 7)
      const limits = [db.doc(`emailInternal/day-${day}`), db.doc(`emailInternal/month-${month}`), db.doc(`emailInternal/user-${uid}-${day}`)]
      const counts = await Promise.all(limits.map((limit) => tx.get(limit)))
      if (!job.budgeted && counts.some((count, index) => (data(count)?.count || 0) >= [90, 2700, 30][index])) {
        tx.set(jobRef, terminal(job, 'cancelled', now, { reason: 'budget-exhausted' })); return null
      }
      const tokenData = job.purpose === 'confirm' ? job.tokenData : { purpose: 'unsubscribe', uid, profileId,
        revision: job.revision, addressVersion: job.addressVersion, expiresAt: now + 90 * DAY }
      const payload = job.payload || (job.purpose === 'confirm'
        ? verificationEmail({ profileName: job.profileName, url: link(tokens.issue(tokenData)) })
        : titleNotificationEmail({ ...job.model, sentAt: now, url: appUrl, unsubscribeUrl: link(tokens.issue(tokenData)) }))
      // Freeze exact bytes across retries (also across template releases).
      const next = { ...job, payload, sender: job.sender || transport.from, renderedAt: job.renderedAt ?? now,
        state: 'sending', leaseId, attempts: job.attempts + 1, budgeted: true, queueAt: new Date(now + LEASE) }
      if (!job.budgeted) limits.forEach((limit, index) => tx.set(limit, { count: (data(counts[index])?.count || 0) + 1, expiresAt: new Date(now + 62 * DAY) }))
      tx.set(jobRef, next)
      return next
    })
    if (!claimed) return 'skipped'
    let result
    let failure
    try {
      result = await transport.send({ ...claimed.payload, to: claimed.recipient, sender: claimed.sender,
        idempotencyKey: `moviehub-${tokenHash(jobRef.path)}` })
    } catch (error) { failure = { code: /^mail-[a-z0-9-]+$/.test(error.code || '') ? error.code : 'mail-error', retryable: error.retryable === true } }
    await db.runTransaction(async (tx) => {
      const latest = data(await tx.get(jobRef))
      if (latest?.leaseId !== leaseId || latest.state !== 'sending') return
      const finished = clock()
      const proofRef = ref.collection('emailVerification').doc('current')
      const proof = claimed.purpose === 'confirm' ? data(await tx.get(proofRef)) : null
      if (result) {
        tx.set(jobRef, terminal(latest, 'submitted', finished, { providerId: result.providerId }))
        if (proof?.tokenHash === tokenHash(tokens.issue(claimed.tokenData))) tx.set(proofRef, { ...proof, sentAt: new Date(finished) })
      } else if (failure.retryable && latest.attempts < MAIL_MAX_ATTEMPTS && finished + LEASE < timeMillis(latest.expiresAt)) {
        tx.set(jobRef, { ...latest, state: 'retry', lastError: failure.code, queueAt: new Date(finished + Math.min(15 * 60000, LEASE * 2 ** (latest.attempts - 1))) })
      } else {
        tx.set(jobRef, terminal(latest, 'failed', finished, { lastError: failure.code }))
        if (proof?.tokenHash === tokenHash(tokens.issue(claimed.tokenData))) tx.set(proofRef, { ...proof, status: 'failed' })
      }
    })
    return result ? 'submitted' : 'failed-attempt'
  }

  async function retryDue() {
    if (!enabled) return 0
    // Only active jobs possess queueAt. One collection-group ascending index.
    const due = await db.collectionGroup('emailDeliveries').where('queueAt', '<=', new Date(clock())).orderBy('queueAt').limit(40).get()
    const deadline = clock() + 90000
    let processed = 0
    for (const snapshot of due.docs) {
      if (clock() >= deadline) break
      await deliver(snapshot.ref)
      processed++
    }
    return processed
  }

  async function applyToken(token) {
    if (!enabled) throw new Error('mail-disabled')
    const now = clock()
    const parsed = tokens.read(token, now)
    if (!await accountAvailable(parsed.uid)) throw new Error('invalid-link')
    const ref = profileRef(parsed.uid, parsed.profileId)
    return db.runTransaction(async (tx) => {
      const prefsRef = ref.collection('emailPreferences').doc('current')
      const proofRef = ref.collection('emailVerification').doc('current')
      const [profile, prefsSnap, proofSnap] = await Promise.all([tx.get(ref), tx.get(prefsRef), tx.get(proofRef)])
      const prefs = data(prefsSnap)
      const proof = data(proofSnap)
      if (!profile.exists || !validEmailPreferences(prefs) || prefs.addressVersion !== parsed.addressVersion
        || prefs.revision !== parsed.revision || !prefs.enabled) throw new Error('invalid-link')
      if (parsed.purpose === 'unsubscribe') {
        tx.set(prefsRef, { ...prefs, enabled: false, revision: prefs.revision + 1, updatedAt: new Date(now) })
        return 'unsubscribed'
      }
      if (proof?.status !== 'pending' || proof.tokenHash !== tokenHash(token)
        || proof.email !== prefs.email || now >= timeMillis(proof.expiresAt)) throw new Error('invalid-link')
      tx.set(proofRef, { email: prefs.email, addressVersion: prefs.addressVersion, status: 'verified', source: 'email-link', verifiedAt: new Date(now) })
      return 'confirmed'
    })
  }
  return { enabled: Boolean(enabled), reconcile, enqueueNotification, deliver, retryDue, applyToken }
}
