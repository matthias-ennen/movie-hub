import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
describe('YouTube Movies G1 DE three movie search orders comparison',()=>{
 it('passes mocked YouTube sorting and TMDB-safety tests without remote API credentials',()=>{
  const r=spawnSync(process.execPath,['--test','scripts/youtube-movies-three-sorts-g1.check.mjs'],{
   cwd:process.cwd(),encoding:'utf8',timeout:40000,
   env:{...process.env,TMDB_API_READ_TOKEN:''}
  })
  expect(r.error?.message).toBeUndefined()
  expect(r.status,[r.stdout,r.stderr].filter(Boolean).join('\n')).toBe(0)
  expect(r.stdout).toContain('# fail 0')
 },45000)
})
