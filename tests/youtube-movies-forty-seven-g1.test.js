import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
describe('YouTube G1 47-evidence read-only identity review',()=>{
 it('passes all isolated mocked API and inventory integrity checks',()=>{
  const result=spawnSync(process.execPath,['--test','scripts/youtube-movies-forty-seven-g1.check.mjs'],{
   cwd:process.cwd(),encoding:'utf8',timeout:40000,
   env:{...process.env,TMDB_API_READ_TOKEN:''}
  })
  expect(result.error?.message).toBeUndefined()
  expect(result.status,[result.stdout,result.stderr].filter(Boolean).join('\n')).toBe(0)
  expect(result.stdout).toContain('# fail 0')
 },45000)
})
