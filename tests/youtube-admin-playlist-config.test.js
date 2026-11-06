import { describe, it, expect } from 'vitest'
import { validateAdminPlaylistSnapshot, readAdminPlaylistConfig } from '../scripts/youtube-admin-playlist-config.mjs'
const a='PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ'
const b='PLJWJS8p_IeEo'
const r=(id,mode,enabled=true)=>({playlistId:id,name:'Liste '+mode,offerKind:mode,
  offerTypes:mode==='rent-buy'?['rent','buy']:[mode],enabled,schemaVersion:1})
describe('MovieHub Admin is exclusive playlist source',()=>{
  it('reads both existing lists plus more, with all six offer selections',()=>{
    const all=[r(a,'free'),r(b,'rent-buy'),r('PLabcdefghijklmnop','ads'),
      r('PLzyxwvutsrqponmlk','flatrate'),r('PLABCDEFGHIJKLmnop','rent'),
      r('PL1234567890mnopqr','buy')]
    const s=validateAdminPlaylistSnapshot({revision:6,rows:all})
    expect(s.sources).toHaveLength(6)
    expect(s.sources.map(x=>x.mode)).toEqual(['free','rent-buy','ads','flatrate','rent','buy'])
  })
  it('ignores disabled entries but never ignores invalid ones',()=>{
    expect(validateAdminPlaylistSnapshot({revision:1,rows:[r(a,'free'),r(b,'rent-buy',false)]}).sources).toHaveLength(1)
    expect(()=>validateAdminPlaylistSnapshot({revision:1,rows:[r(a,'free',false)]})).toThrow('NO_ENABLED')
    expect(()=>validateAdminPlaylistSnapshot({revision:1,rows:[r(a,'free'),r(a,'buy')]})).toThrow('INVALID')
    expect(()=>validateAdminPlaylistSnapshot({revision:1,rows:[{...r(a,'free'),offerTypes:['rent']}]})).toThrow('INVALID')
  })
  it('fails closed on missing data and on concurrent admin mutation',async()=>{
    expect(()=>validateAdminPlaylistSnapshot({revision:0,rows:[]})).toThrow()
    let calls=0
    const doc=()=>({exists:true,data:()=>({revision:++calls})})
    const db={collection:()=>({doc:()=>({get:async()=>doc(),collection:()=>({get:async()=>({docs:[{id:a,data:()=>r(a,'free')}]})})})})}
    await expect(readAdminPlaylistConfig({db})).rejects.toThrow('CHANGED_DURING_READ')
  })
})
