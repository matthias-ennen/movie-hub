import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SEASONAL_CONTENT_MODES } from '../src/catalog/seasonalContent.js'
import { seasonalVisualAssets } from '../src/theme/seasonalPresentation.js'
import { verifySeasonalAtmospherePublication } from '../scripts/verify-seasonal-atmosphere-publication.mjs'

async function fixture(callback) {
  const root=await mkdtemp(join(tmpdir(),'moviehub-seasonal-art-'))
  const published=new Map()
  try {
    const directory=join(root,'seasonal-atmosphere')
    await mkdir(directory,{recursive:true})
    for(const {id} of SEASONAL_CONTENT_MODES){
      for(const path of Object.values(seasonalVisualAssets(id))){
        const text='<svg xmlns="http://www.w3.org/2000/svg">'+path+'</svg>'
        await writeFile(join(directory,path.slice('/seasonal-atmosphere/'.length)),text)
        published.set(path,text)
      }
    }
    return await callback({root,published})
  }finally { await rm(root,{recursive:true,force:true}) }
}
function response(body,ok=true,type='image/svg+xml') {
  return {ok,headers:{get:()=>type},text:async()=>body}
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
  it('rejects stale or modified SVG assets even if content type is valid',async()=>{
    await fixture(async({root})=>{
      const request=vi.fn(async()=>response('<svg xmlns="http://www.w3.org/2000/svg"/>'))
      await expect(verifySeasonalAtmospherePublication({root,request})).rejects
        .toThrow('SEASONAL_HOSTED_ASSET_MISMATCH')
    })
  })
})
