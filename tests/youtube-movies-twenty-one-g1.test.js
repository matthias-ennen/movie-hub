import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
describe('G1 twenty-one ambiguous YouTube video identity audit',()=>{
 it('runs isolated official TMDB mock tests and prevents any auto-accepted works',()=>{
  const r=spawnSync(process.execPath,['--test','scripts/youtube-movies-twenty-one-g1.check.mjs'],{
   cwd:process.cwd(),encoding:'utf8',timeout:40000,
   env:{...process.env,TMDB_API_READ_TOKEN:''}
  })
  expect(r.error?.message).toBeUndefined()
  expect(r.status,[r.stdout,r.stderr].filter(Boolean).join('\n')).toBe(0)
  expect(r.stdout).toContain('# fail 0')
 },45000)
})
