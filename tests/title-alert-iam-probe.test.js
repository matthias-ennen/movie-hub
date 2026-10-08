import { describe, expect, it } from 'vitest'
import { probeTitleAlertFirestore } from '../scripts/probe-title-alert-firestore.mjs'

const PROBE_ID = '00000000-0000-4000-8000-000000000001'

function mockDb({ denyTransaction = false, unexpectedlyPresent = false } = {}) {
  const events = []
  const ref = {}
  const db = {
    collection(name) {
      expect(name).toBe('movieHubDiagnostics')
      return { doc(id) { expect(id).toBe(`title-alert-${PROBE_ID}`); return ref } }
    },
    async runTransaction(fn, options) {
      expect(options).toBeUndefined() // default read-write transaction: beginTransaction is required
      events.push('transaction')
      if (denyTransaction) throw new Error('PERMISSION_DENIED')
      return fn({
        async get(reference) {
          expect(reference).toBe(ref)
          events.push('transaction-read')
          return { exists: unexpectedlyPresent }
        },
        create() { throw new Error('unexpected write') },
        set() { throw new Error('unexpected write') },
        update() { throw new Error('unexpected write') },
        delete() { throw new Error('unexpected delete') },
      })
    },
  }
  return { db, events }
}

describe('isolated title-alert IAM probe', () => {
  it('executes a default read-write transaction without writing diagnostic or user data', async () => {
    const fixture = mockDb()
    await expect(probeTitleAlertFirestore(fixture.db, { probeId: PROBE_ID })).resolves.toEqual({
      transaction: 'passed', readback: 'absent', mutations: 0,
    })
    expect(fixture.events).toEqual(['transaction', 'transaction-read'])
  })

  it('exposes a transaction-permission failure', async () => {
    const fixture = mockDb({ denyTransaction: true })
    await expect(probeTitleAlertFirestore(fixture.db, { probeId: PROBE_ID })).rejects.toThrow('PERMISSION_DENIED')
    expect(fixture.events).toEqual(['transaction'])
  })

  it('never overwrites a pre-existing diagnostic path', async () => {
    const fixture = mockDb({ unexpectedlyPresent: true })
    await expect(probeTitleAlertFirestore(fixture.db, { probeId: PROBE_ID })).rejects.toThrow(/unexpectedly exists/)
    expect(fixture.events).toEqual(['transaction', 'transaction-read'])
  })

  it('rejects malformed diagnostic IDs before any Firestore access', async () => {
    await expect(probeTitleAlertFirestore({}, { probeId: '../invalid' })).rejects.toThrow(/Valid/)
  })
})
