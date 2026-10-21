import {describe,it,expect} from 'vitest'
import {spawnSync} from 'node:child_process'
describe('YouTube G1 final Matcher v1 — 100 source video candidates, no production writes',()=>{
 it('passes exact-origin, 100-id QA, translation, sequels, TV, 429 and candidate-only gates',()=>{
  const out=spawnSync(process.execPath,['--test','scripts/youtube-g1-matcher-v1.check.mjs'],
   {cwd:process.cwd(),encoding:'utf8',timeout:45000,
    env:{...process.env,TMDB_API_READ_TOKEN:''}})
  expect(out.error?.message).toBeUndefined()
  expect(out.status,[out.stdout,out.stderr].filter(Boolean).join('\n')).toBe(0)
  expect(out.stdout).toContain('# fail 0')
 },50000)
})
