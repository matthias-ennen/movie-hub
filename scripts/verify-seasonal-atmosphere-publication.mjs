/**
 * Read the *exact* published original MovieHub season artwork after Hosting
 * deploy. Both legacy SVG and audited cinematic WebP pairs fail closed on
 * missing file, Firebase SPA fallback, wrong MIME type or changed bytes.
 * Pure readback; no TMDB, YouTube, external images or processing costs.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SEASONAL_CONTENT_MODES } from '../src/catalog/seasonalContent.js'
import { seasonalVisualAssets } from '../src/theme/seasonalPresentation.js'
import { verifyPublicationWithBoundedConvergence } from './verify-published-data.mjs'

const DEFAULT_ORIGIN='https://movie-hub-62459.web.app'
const files=resolveAssets=>SEASONAL_CONTENT_MODES.flatMap(({id})=>Object.values(resolveAssets(id)))

export async function verifySeasonalAtmospherePublication({
  origin=process.env.MOVIE_HUB_LIVE_URL || DEFAULT_ORIGIN,
  request=fetch, root=resolve('public'), resolveAssets=seasonalVisualAssets,
}={}){
  const expected=files(resolveAssets)
  if(expected.length!==18 || new Set(expected).size!==18)
    throw Error('SEASONAL_ASSET_MANIFEST_INCOMPLETE')
  const summary=[]
  for(let i=0;i<expected.length;i+=4){
    const group=expected.slice(i,i+4)
    const results=await Promise.all(group.map(async path=>{
      if(!/^\/seasonal-atmosphere\/[a-z-]+-(?:wallpaper|corner)\.(?:svg|webp)$/.test(path))
        throw Error('SEASONAL_ASSET_PATH_INVALID')
      const isWebp=path.endsWith('.webp')
      const prepared=await readFile(resolve(root,'.'+path))
      if(isWebp && (prepared.length<24 || prepared.length>1500000
        || prepared.toString('ascii',0,4)!=='RIFF'
        || prepared.toString('ascii',8,12)!=='WEBP'))
        throw Error('SEASONAL_WEBP_INVALID: '+path)
      const expectedType=isWebp?'image/webp':'image/svg+xml'
      const url=new URL(path,origin)
      url.searchParams.set('check',String(Date.now()))
      const response=await request(url,{redirect:'error',cache:'no-store',
        headers:{Accept:expectedType},signal:AbortSignal.timeout(20000)})
      if(!response?.ok || !String(response.headers?.get?.('content-type')||'')
        .includes(expectedType))throw Error('SEASONAL_HOSTED_ASSET_MISSING: '+path)
      const hosted=isWebp?Buffer.from(await response.arrayBuffer())
        :Buffer.from(await response.text(),'utf8')
      if(!hosted.equals(prepared))throw Error('SEASONAL_HOSTED_ASSET_MISMATCH: '+path)
      return {path,bytes:hosted.length}
    }))
    summary.push(...results)
  }
  console.log(JSON.stringify({kind:'moviehub-seasonal-assets-verified',count:summary.length,summary}))
  return summary
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  verifyPublicationWithBoundedConvergence({
    verify:()=>verifySeasonalAtmospherePublication(),maxAttempts:8,
  }).catch(e=>{
    console.error('SEASONAL_ASSET_PUBLICATION_FAILED: '+e.message)
    process.exitCode=1
  })
}
