import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
describe('YouTube G1 top-three exact-work matcher QA',()=>{
 it('checks original hundred-source, aliases, independent runtimes and no production acceptance',()=>{
  const out=spawnSync(process.execPath,
   ['--test','scripts/youtube-movies-top-three-qa-g1.check.mjs'],{
    cwd:process.cwd(),encoding:'utf8',timeout:40000,
    env:{...process.env,TMDB_API_READ_TOKEN:''}
   })
  expect(out.error?.message).toBeUndefined()
  expect(out.status,[out.stdout,out.stderr].filter(Boolean).join('\n')).toBe(0)
  expect(out.stdout).toContain('# fail 0')
 },45000)
})
