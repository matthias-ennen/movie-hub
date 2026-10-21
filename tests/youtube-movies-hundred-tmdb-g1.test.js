import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
describe('G1 – 100 original YouTube candidate VIDEO IDs, TMDB-only review',()=>{
 it('passes isolated no-secrets mocked ID, film/TV, quota and source-integrity checks',()=>{
  const run=spawnSync(process.execPath,['--test','scripts/youtube-movies-hundred-tmdb-g1.check.mjs'],{
   cwd:process.cwd(),encoding:'utf8',timeout:40000,env:{...process.env,TMDB_API_READ_TOKEN:''}
  })
  expect(run.error?.message).toBeUndefined()
  expect(run.status,[run.stdout,run.stderr].filter(Boolean).join('\n')).toBe(0)
  expect(run.stdout).toContain('# fail 0')
 },45000)
})
