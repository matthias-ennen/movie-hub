import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
describe('Twelve real user YouTube movie links G1 read-only playlist investigation',()=>{
 it('passes all mocked API and safety tests without external calls',()=>{
  const r=spawnSync(process.execPath,['--test','scripts/youtube-movies-user-twelve-g1.check.mjs'],{
   cwd:process.cwd(),encoding:'utf8',timeout:30000,
   env:{...process.env,TMDB_API_READ_TOKEN:''}
  })
  expect(r.error?.message).toBeUndefined()
  expect(r.status,[r.stdout,r.stderr].filter(Boolean).join('\n')).toBe(0)
  expect(r.stdout).toContain('# fail 0')
 },35000)
})
