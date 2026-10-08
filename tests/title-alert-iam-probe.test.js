import { describe, expect, it } from 'vitest'
import { probeTitleAlertFirestore } from '../scripts/probe-title-alert-firestore.mjs'

const PROBE_ID = '00000000-0000-4000-8000-000000000001'

function mockDb({ denyTransaction = false } = {}) {
  const events = []
  let item
  const ref = {
    async get() { events.push('readback'); return { exists: Boolean(item), data: () => item } },
    async delete() { events.push('delete'); item = undefined },
  }
  const db = {
    collection(name) {
      expect(name).toBe('movieHubDiagnostics')
      return { doc(id) { expect(id).toBe(`title-alert-${PROBE_ID}`); return ref } }
    },
    async runTransaction(fn) {
      events.push('transaction')
      if (denyTransaction) throw new Error('PERMISSION_DENIED')
      await fn({
        async get(reference) { expect(reference).toBe(ref); events.push('transaction-read'); return { exists: Boolean(item) } },
        create(reference, value) { expect(reference).toBe(ref); events.push('transaction-create'); item = value },
      })
    },
  }
  return { db, events, present: () => item }
}

describe('isolated title-alert IAM probe', () => {
  it('tests a real transaction, reads the result, and removes only its own diagnostic document', async () => {
    const fixture = mockDb()
    await expect(probeTitleAlertFirestore(fixture.db, { probeId: PROBE_ID })).resolves.toMatchObject({
      transaction: 'passed', readback: 'passed',
    })
    expect(fixture.events).toEqual(['transaction', 'transaction-read', 'transaction-create', 'readback', 'delete'])
    expect(fixture.present()).toBeUndefined()
  })

  it('exposes a denied transaction without touching existing user data or attempting to delete it', async () => {
    const fixture = mockDb({ denyTransaction: true })
    await expect(probeTitleAlertFirestore(fixture.db, { probeId: PROBE_ID })).rejects.toThrow('PERMISSION_DENIED')
    expect(fixture.events).toEqual(['transaction'])
  })

  it('rejects malformed diagnostic IDs before any Firestore access', async () => {
    await expect(probeTitleAlertFirestore({}, { probeId: '../invalid' })).rejects.toThrow(/Valid/)
  })
})
