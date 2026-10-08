import { describe, expect, it } from 'vitest'
import { verifyCheckResults } from '../scripts/probe-title-alert-e2e.mjs'

describe('targeted title-alert acceptance evidence', () => {
  const result = { observed: 1, includedCreated: 1, tvCreated: 0, failed: 0 }
  const confirmed = [{ stateRecorded: true, includedNow: true, initialNotificationPresent: true }]

  it('accepts a stored event and zero duplicate events on replay', () => {
    expect(verifyCheckResults(result, { ...result, observed: 0, includedCreated: 0 }, confirmed)).toEqual({
      observed: 1, initialCreated: 1, repeatCreated: 0, statesPersisted: 1,
      currentlyIncluded: 1, initialEventsPresent: 1, deduplication: 'passed',
    })
  })

  it('accepts a valid pending offer without claiming that an alert was emitted', () => {
    const none = { ...result, includedCreated: 0 }
    expect(verifyCheckResults(none, none, [
      { stateRecorded: true, includedNow: false, initialNotificationPresent: false },
    ])).toMatchObject({ observed: 1, initialEventsPresent: 0, currentlyIncluded: 0 })
  })

  it('fails when target watch or persisted state cannot be confirmed', () => {
    expect(() => verifyCheckResults({ ...result, observed: 0 }, result, confirmed)).toThrow(/not consistently found/)
    expect(() => verifyCheckResults(result, { ...result, includedCreated: 0 }, [
      { stateRecorded: false, includedNow: true, initialNotificationPresent: true },
    ])).toThrow(/not persisted/)
  })

  it('fails when a repeated evaluation creates another notification', () => {
    expect(() => verifyCheckResults(result, result, confirmed)).toThrow(/not idempotent/)
    expect(() => verifyCheckResults(result, { ...result, observed: 2, includedCreated: 0 }, confirmed)).toThrow(/not consistently found/)
  })

  it('fails when a newly-created event cannot be read back', () => {
    expect(() => verifyCheckResults(result, { ...result, includedCreated: 0 }, [
      { stateRecorded: true, includedNow: true, initialNotificationPresent: false },
    ])).toThrow(/cannot be read back/)
  })
})
