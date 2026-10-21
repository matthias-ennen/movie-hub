import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

describe('YouTube Movies G1 isolated research checks', () => {
  it('runs all Node-only mock tests in ordinary CI without API credentials', () => {
    const run = spawnSync(process.execPath, ['--test', 'scripts/youtube-movies-store-id-g1.check.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, YOUTUBE_API_KEY: '', TMDB_API_READ_TOKEN: '' },
    })
    expect(run.error?.message).toBeUndefined()
    expect(run.status, [run.stdout, run.stderr].filter(Boolean).join('\n')).toBe(0)
    expect(run.stdout).toContain('# fail 0')
  }, 35000)
})
