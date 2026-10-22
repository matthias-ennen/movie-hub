import {describe,it,expect} from 'vitest'
import {resolveYouTubeResearchSources} from '../scripts/youtube-g2-source-config.mjs'
import {SOURCES} from '../scripts/youtube-api-smoke.mjs'
const ID_A = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const ID_B = 'UCbbbbbbbbbbbbbbbbbbbbbb'
describe('YouTube G2 research channel selection independent of source adapter',()=>{
 it('defaults to all registered channels, not Netzkino alone',()=>{
  expect(resolveYouTubeResearchSources().map(s=>s.channelId))
   .toEqual(SOURCES.map(s=>s.channelId))
 })
 it('supports selecting a single provider source in audit without code changes',()=>{
  expect(resolveYouTubeResearchSources({mode:'netzkino'})).toHaveLength(1)
  expect(resolveYouTubeResearchSources({mode:'cinenet'})[0].name)
   .toBe('CiNENET Deutschland')
 })
 it('accepts up to four valid unique custom channel IDs',()=>{
  const result=resolveYouTubeResearchSources({
   mode:'custom',channelIds:ID_A+', '+ID_B,
  })
  expect(result.map(s=>s.channelId)).toEqual([ID_A,ID_B])
 })
 it('rejects duplicate, invalid, too many and blank custom IDs before any API requests',()=>{
  for(const channelIds of [
   ID_A+','+ID_A,'not-a-channel-id','','UCshort',
   [ID_A,ID_B,'UCcccccccccccccccccccccc','UCdddddddddddddddddddddd','UCeeeeeeeeeeeeeeeeeeeeee'].join(','),
  ]){
   expect(()=>resolveYouTubeResearchSources({mode:'custom',channelIds})).toThrow()
  }
  expect(()=>resolveYouTubeResearchSources({mode:'no-such-channel'})).toThrow()
 })
})
