import { describe, expect, it } from 'vitest'
import { normalizeSmbProgress, shouldSyncSmbProgress, validSmbProgressId, movieHubPlayerPalette } from '../src/library/smbProgressModel.js'

describe('SMB resume model', () => {
  const record = { positionMs: 120_000, durationMs: 600_000, updatedAtMs: 1234 }
  it('validates coordinates and strips extra fields', () => {
    expect(normalizeSmbProgress({ ...record, path: 'smb://private/video' })).toEqual(record)
    expect(normalizeSmbProgress({ ...record, positionMs: 700_000 })).toBeNull()
    expect(normalizeSmbProgress({ ...record, updatedAtMs: NaN })).toBeNull()
    expect(normalizeSmbProgress({ ...record, durationMs: -1 })).toBeNull()
    expect(validSmbProgressId('a'.repeat(64))).toBe(true)
    expect(validSmbProgressId('smb://private/video')).toBe(false)
  })
  it('newer completion defeats stale offline progress', () => {
    const completed = { ...record, positionMs: 0, updatedAtMs: 1500 }
    expect(shouldSyncSmbProgress(record, completed)).toBe(false)
    expect(shouldSyncSmbProgress(completed, record)).toBe(true)
    expect(shouldSyncSmbProgress(record, record)).toBe(false)
    expect(shouldSyncSmbProgress(record, null)).toBe(true)
  })
  it('uses the live Movie Hub theme palette', () => {
    const style = { getPropertyValue: key => ({ '--color-surface': '#ffffff', '--color-text': '#17202b' })[key] || '' }
    expect(movieHubPlayerPalette(style)).toMatchObject({ surface: '#ffffff', text: '#17202b' })
  })
})
