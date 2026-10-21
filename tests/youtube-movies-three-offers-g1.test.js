import {describe,expect,it} from 'vitest'
import {spawnSync} from 'node:child_process'

describe('YouTube Movies G1 three exact-provider monetization checks',()=>{
 it('runs Node mocked audit in ordinary CI, without API credentials',()=>{
  const result=spawnSync(process.execPath,['--test','scripts/youtube-movies-three-offers-g1.check.mjs'],{
   cwd:process.cwd(),encoding:'utf8',timeout:30000,
   env:{...process.env,TMDB_API_READ_TOKEN:''}
  })
  expect(result.error?.message).toBeUndefined()
  expect(result.status,[result.stdout,result.stderr].filter(Boolean).join('\n')).toBe(0)
  expect(result.stdout).toContain('# fail 0')
 },35000)
})
