import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SEASONAL_CONTENT_MODES } from '../src/catalog/seasonalContent.js'
import { seasonalVisualAssets } from '../src/theme/seasonalPresentation.js'
import { verifySeasonalAtmospherePublication } from '../scripts/verify-seasonal-atmosphere-publication.mjs'

async function fixture(callback,{format='svg'}={}) {
  const root=await mkdtemp(join(tmpdir(),'moviehub-seasonal-art-'))
  const published=new Map()
  try {
    const directory=join(root,'seasonal-atmosphere')
    await mkdir(directory,{recursive:true})
    for(const {id} of SEASONAL_CONTENT_MODES){
      const paths=format==='webp'
        ? ['/seasonal-atmosphere/'+id+'-wallpaper.webp',
           '/seasonal-atmosphere/'+id+'-corner.webp']
        : Object.values(seasonalVisualAssets(id))
      for(const path of paths){
        const content=format==='webp'
          ? Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPVP8 '),Buffer.alloc(16)])
          : '<svg xmlns="http://www.w3.org/2000/svg">'+path+'</svg>'
        await writeFile(join(directory,path.slice('/seasonal-atmosphere/'.length)),content)
        published.set(path,content)
      }
    }
    return await callback({root,published})
  }finally { await rm(root,{recursive:true,force:true}) }
}
function response(body,ok=true,type='image/svg+xml') {
  return {ok,headers:{get:()=>type},text:async()=>body,
    arrayBuffer:async()=>Uint8Array.from(Buffer.from(body)).buffer}
}
describe('#484 seasonal SVG exact Hosting publication',()=>{
  it('verifies every design resource without any TMDB or YouTube network',async()=>{
    await fixture(async({root,published})=>{
      const request=vi.fn(async url=>response(published.get(url.pathname)))
      const result=await verifySeasonalAtmospherePublication({
        root,request,origin:'https://example.com',
      })
      expect(result).toHaveLength(18)
      expect(request).toHaveBeenCalledTimes(18)
      expect(result.map(x=>x.path).sort()).toEqual([...published.keys()].sort())
    })
  })
  it('rejects Firebase SPA HTML as a missing graphic',async()=>{
    await fixture(async({root})=>{
      const request=vi.fn(async()=>response('<!doctype html>',true,'text/html; charset=utf-8'))
      await expect(verifySeasonalAtmospherePublication({root,request})).rejects
        .toThrow('SEASONAL_HOSTED_ASSET_MISSING')
    })
  })
  it('verifies real binary WebP byte identity for all nine cinematic pairs',async()=>{
    await fixture(async({root,published})=>{
      const request=vi.fn(async url=>response(published.get(url.pathname),true,'image/webp'))
      const resolveAssets=id=>({
        wallpaper:'/seasonal-atmosphere/'+id+'-wallpaper.webp',
        corner:'/seasonal-atmosphere/'+id+'-corner.webp',
      })
      const result=await verifySeasonalAtmospherePublication({
        root,request,resolveAssets,origin:'https://example.com',
      })
      expect(result).toHaveLength(18)
      expect(result.every(x=>x.bytes===32)).toBe(true)
      expect(request).toHaveBeenCalledTimes(18)
    },{format:'webp'})
  })
  it('blocks a stale or invalid WebP even when Firebase returns HTTP 200',async()=>{
    await fixture(async({root})=>{
      const resolveAssets=id=>({
        wallpaper:'/seasonal-atmosphere/'+id+'-wallpaper.webp',
        corner:'/seasonal-atmosphere/'+id+'-corner.webp',
      })
      await expect(verifySeasonalAtmospherePublication({
        root,resolveAssets,request:vi.fn(async()=>response(
          Buffer.alloc(32),true,'image/webp',
        )),
      })).rejects.toThrow('SEASONAL_HOSTED_ASSET_MISMATCH')
    },{format:'webp'})
  })
  it('rejects stale or modified SVG assets even if content type is valid',async()=>{
    await fixture(async({root})=>{
      const request=vi.fn(async()=>response('<svg xmlns="http://www.w3.org/2000/svg"/>'))
      await expect(verifySeasonalAtmospherePublication({root,request})).rejects
        .toThrow('SEASONAL_HOSTED_ASSET_MISMATCH')
    })
  })
})
