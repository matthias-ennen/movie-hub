import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ rows: new Map(), reads: [], writes: [], abort: null }))
vi.mock('../src/lib/firebase.js', () => ({ firebaseReady: Promise.resolve({ db: {} }) }))
vi.mock('firebase/firestore', () => {
  const path = (ref, ...parts) => ({ path: [ref.path, ...parts].filter(Boolean).join('/') })
  return {
    collection: path, doc: path, deleteField: () => 'DELETE_FIELD', serverTimestamp: () => 'SERVER_TIME',
    documentId: () => '__name__', orderBy: key => ({ order: key }), limit: value => ({ limit: value }), startAfter: value => ({ after: value.id }),
    query: (ref, ...constraints) => ({ ref, constraints }),
    getDocs: async ({ ref, constraints }) => {
      const count = constraints.find(row => row.limit)?.limit
      const after = constraints.find(row => row.after)?.after || ''
      const docs = (runtime.rows.get(ref.path) || []).filter(row => row.id > after).slice(0, count)
        .map(row => ({ id: row.id, ref: { path: `${ref.path}/${row.id}` }, data: () => row.data }))
      runtime.reads.push({ path: ref.path, count: docs.length, limit: count })
      if (runtime.abort && ref.path.endsWith('/titles')) runtime.abort()
      return { docs, size: docs.length }
    },
    setDoc: async (ref, data) => { runtime.writes.push({ path: ref.path, data }) },
  }
})
import { runPersonalDataEncryptionMigration } from '../src/lib/personalDataMigration.js'
let sequence = 0
function fixture() {
  const uid = `synthetic-${++sequence}`
  runtime.rows.set(`users/${uid}/profiles`, [{ id: 'main', data: {} }])
  runtime.rows.set(`users/${uid}/profiles/main/titles`, Array.from({ length: 123 }, (_, i) => ({
    id: `title-${String(i).padStart(3, '0')}`, data: i === 0 ? { note: 'Private Testnotiz' } : {},
  })))
  return uid
}
beforeEach(() => {
  runtime.rows.clear(); runtime.reads.length = 0; runtime.writes.length = 0; runtime.abort = null
  vi.stubGlobal('window', { MovieHubCrypto: {
    isAvailable: () => true,
    encrypt: (_purpose, text) => JSON.stringify({ cryptoVersion: 1, algorithm: 'A256GCM', iv: 'test', ciphertext: text }),
    decrypt: (_purpose, envelope) => JSON.parse(envelope).ciphertext,
  } })
})
afterEach(() => vi.unstubAllGlobals())
describe('incremental encryption verification after startup', () => {
  it('verifies every document in bounded pages and only removes plaintext after round-trip verification', async () => {
    const uid = fixture()
    const report = await runPersonalDataEncryptionMigration(uid)
    expect(report).toMatchObject({ status: 'complete', titleDocuments: 123, profileDocuments: 1 })
    expect(runtime.reads.filter(row => row.path.endsWith('/titles')).map(row => row.count)).toEqual([50, 50, 23])
    expect(runtime.reads.every(row => row.limit === 50)).toBe(true)
    expect(runtime.writes[0].data).toMatchObject({ note: 'DELETE_FIELD', noteEncrypted: { ciphertext: 'Private Testnotiz' }, cryptoVersion: 1 })
    expect(runtime.writes.at(-1).data.status).toBe('complete')
  })
  it('stops on account teardown, writes no successful report, and permits a later safe retry', async () => {
    const uid = fixture(), controller = new AbortController()
    runtime.abort = () => controller.abort()
    await expect(runPersonalDataEncryptionMigration(uid, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(runtime.reads.filter(row => row.path.endsWith('/titles'))).toHaveLength(1)
    expect(runtime.writes).toHaveLength(0)
    runtime.abort = null
    await expect(runPersonalDataEncryptionMigration(uid)).resolves.toMatchObject({ status: 'complete', titleDocuments: 123 })
  })
})
