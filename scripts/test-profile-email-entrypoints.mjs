// Exercise the real deployed exports through the Functions Framework's loader
// and HTTP parser. Only synthetic local events; Auth/Firestore are stubbed and
// outbound fetch is blocked. Run after preparing/installing email-functions.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'email-functions')
const require = createRequire(resolve(source, 'package.json'))
const framework = dirname(require.resolve('@google-cloud/functions-framework'))
const { getUserFunction } = require(resolve(framework, 'loader.js'))
const { getServer } = require(resolve(framework, 'server.js'))
const { parseOptions } = require(resolve(framework, 'options.js'))
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const proto = require(resolve(dirname(require.resolve('firebase-functions')), '../../protos/compiledFirestore.js'))
const DocumentEventData = proto.google.events.cloud.firestore.v1.DocumentEventData
const project = 'demo-moviehub-mail-entry'
Object.assign(process.env, { GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project, FIREBASE_CONFIG: JSON.stringify({ projectId: project }),
  MOVIE_HUB_EMAIL_ENABLED: 'true', MOVIE_HUB_EMAIL_FROM: 'MovieHub <mail@example.org>',
  MOVIE_HUB_EMAIL_LIVE_AFTER: '2026-01-01T00:00:00Z', MOVIE_HUB_EMAIL_APP_URL: 'https://app.example.org',
  MOVIE_HUB_EMAIL_ACTION_URL: 'https://action.example.org', MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256: '',
  RESEND_API_KEY: 're_synthetic_entrypoint_test', MOVIE_HUB_EMAIL_TOKEN_KEY: 'synthetic-entrypoint-key-'.repeat(2) })

const nativeFetch = globalThis.fetch
globalThis.fetch = (input, options) => {
  assert.equal(new URL(input).hostname, '127.0.0.1', 'External fetch forbidden in entrypoint test')
  return nativeFetch(input, options)
}
const targets = ['profileEmailPreferences', 'profileEmailNotification', 'profileEmailRetry', 'profileEmailAction']
const loaded = {}
await test('deployed exports override the default HTTP signature only for Firestore events', async () => {
  for (const target of targets) {
    loaded[target] = await getUserFunction(source, target, 'http')
    assert.ok(loaded[target])
    assert.equal(loaded[target].signatureType, target === 'profileEmailPreferences' || target === 'profileEmailNotification' ? 'cloudevent' : 'http')
  }
})

const authCalls = [], reads = []
getAuth().getUser = async (uid) => {
  assert.match(uid, /^synthetic-user-[12]$/)
  authCalls.push(uid)
  return { disabled: true }
}
const db = getFirestore()
db.runTransaction = async (callback) => callback({
  get: async (ref) => { reads.push(ref.path); return { exists: false } },
  set: () => assert.fail('Unexpected document write'), create: () => assert.fail('Unexpected document create'),
})
const emptyQueue = { where: () => emptyQueue, orderBy: () => emptyQueue, limit: () => emptyQueue, get: async () => ({ docs: [] }) }
db.collectionGroup = (name) => { assert.equal(name, 'emailDeliveries'); return emptyQueue }

async function withServer(target, callback, signatureType = loaded[target].signatureType) {
  const server = getServer(loaded[target].userFunction, { ...parseOptions([], {}), signatureType })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try { await callback(`http://127.0.0.1:${server.address().port}`) }
  finally { server.closeAllConnections(); await new Promise((done) => server.close(done)) }
}
async function postEvent(url, document, { deletion = false, structured = false } = {}) {
  const value = { name: `projects/${project}/databases/(default)/documents/${document}`,
    fields: {}, createTime: { seconds: 1, nanos: 0 }, updateTime: { seconds: 2, nanos: 0 } }
  const data = { oldValue: value, ...(!deletion ? { value } : {}) }
  const metadata = { specversion: '1.0', id: 'synthetic-event', type: 'google.cloud.firestore.document.v1.written',
    source: `//firestore.googleapis.com/projects/${project}/databases/(default)`,
    subject: `documents/${document}`, document, project, database: '(default)', namespace: '(default)' }
  const headers = structured ? { 'Content-Type': 'application/cloudevents+json' }
    : { ...Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`ce-${key}`, value])), 'Content-Type': 'application/protobuf' }
  const body = structured
    ? JSON.stringify({ ...metadata, datacontenttype: 'application/json', data: DocumentEventData.toObject(DocumentEventData.create(data), { json: true }) })
    : Buffer.from(DocumentEventData.encode(data).finish())
  const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) })
  await response.text()
  return response.status
}

await test('binary Firestore writes and deletes preserve main/member UID and profile identity', async () => {
  await withServer('profileEmailPreferences', async (url) => {
    for (const [uid, profileId, deletion] of [['synthetic-user-1', 'main', false], ['synthetic-user-2', 'family_1', false], ['synthetic-user-2', 'family_1', true]]) {
      const before = authCalls.length
      assert.equal(await postEvent(url, `users/${uid}/profiles/${profileId}/emailPreferences/current`, { deletion }), 204)
      assert.deepEqual(authCalls.slice(before), [uid])
    }
  })
})
await test('notification events pass the matching UID, profile and event ID to service reads', async () => {
  await withServer('profileEmailNotification', async (url) => {
    for (const eventId of ['included-1', 'tv-found-1', 'tv-final-1']) {
      const document = `users/synthetic-user-2/profiles/family_1/notifications/${eventId}`
      const before = authCalls.length; reads.length = 0
      assert.equal(await postEvent(url, document), 204)
      assert.ok(reads.includes(document))
      assert.deepEqual(authCalls.slice(before), ['synthetic-user-2'])
    }
  })
})
await test('structured JSON CloudEvents reach the same account identity', async () => {
  await withServer('profileEmailPreferences', async (url) => {
    const before = authCalls.length
    assert.equal(await postEvent(url, 'users/synthetic-user-1/profiles/main/emailPreferences/current', { structured: true }), 204)
    assert.deepEqual(authCalls.slice(before), ['synthetic-user-1'])
  })
})
await test('wrong HTTP framing and out-of-scope documents fail before account/database access', async () => {
  const before = authCalls.length; reads.length = 0
  const originalError = console.error; const errors = []
  console.error = (...args) => errors.push(args.map(String).join(' '))
  try {
    await withServer('profileEmailPreferences', async (url) => {
      assert.equal(await postEvent(url, 'users/synthetic-user-1/profiles/main/emailPreferences/current'), 500)
    }, 'http')
    await withServer('profileEmailPreferences', async (url) => {
      assert.equal(await postEvent(url, 'users/synthetic-user-1/profiles/main/unrelated/current'), 500)
    })
  } finally { console.error = originalError }
  assert.equal(authCalls.length, before); assert.deepEqual(reads, [])
  assert.ok(errors.some((error) => error.includes('invalid-mail-event')))
  assert.ok(errors.every((error) => !error.includes('synthetic-user-1')))
})
await test('action GET remains inert and retry keeps its HTTP method contract', async () => {
  const before = authCalls.length; reads.length = 0
  await withServer('profileEmailAction', async (url) => {
    const response = await fetch(url)
    assert.equal(response.status, 200); assert.match(await response.text(), /Deine E-Mail-Mitteilungen/)
  })
  await withServer('profileEmailRetry', async (url) => {
    const get = await fetch(url); assert.equal(get.status, 405); await get.text()
    const post = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(post.status, 204); await post.text()
  })
  assert.equal(authCalls.length, before); assert.deepEqual(reads, [])
})
globalThis.fetch = nativeFetch
