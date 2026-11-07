/**
 * Strict local artwork readiness audit. No image decoding at runtime.
 * A season can be promoted from SVG to photographic WebP only when both
 * files exist, match the intended dimensions and the overlay has alpha.
 *
 * Supports VP8, VP8L and VP8X image headers without a native dependency.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CINEMATIC_MEDIA_READY } from '../src/theme/seasonalMediaManifest.js'
import { seasonalVisualAssets } from '../src/theme/seasonalPresentation.js'
import { SEASONAL_CONTENT_MODES } from '../src/catalog/seasonalContent.js'

const seasonIds=new Set(SEASONAL_CONTENT_MODES.map(x=>x.id))
const bytes=(b,i)=>b[i] ?? 0
const twentyFour=(b,i)=>bytes(b,i)|(bytes(b,i+1)<<8)|(bytes(b,i+2)<<16)

export function inspectSeasonalWebP(value) {
  const b=Buffer.from(value)
  if(b.length<30 || b.toString('ascii',0,4)!=='RIFF'
    || b.toString('ascii',8,12)!=='WEBP')
    throw Error('SEASONAL_WEBP_HEADER_INVALID')
  const kind=b.toString('ascii',12,16)
  let width=0,height=0,alpha=false,animated=false
  if(kind==='VP8X') {
    if(b.length<30)throw Error('SEASONAL_WEBP_HEADER_TRUNCATED')
    const flags=b[20]
    alpha=Boolean(flags&0x10)
    animated=Boolean(flags&0x02)
    width=twentyFour(b,24)+1
    height=twentyFour(b,27)+1
  } else if(kind==='VP8L') {
    if(b.length<25 || b[20]!==0x2f)
      throw Error('SEASONAL_WEBP_LOSSLESS_HEADER_INVALID')
    width=(b[21]|((b[22]&0x3f)<<8))+1
    height=((b[22]>>6)|(b[23]<<2)|((b[24]&0x0f)<<10))+1
    alpha=Boolean(b[24]&0x10)
  } else if(kind==='VP8 ') {
    if(b.length<30 || b[23]!==0x9d || b[24]!==0x01 || b[25]!==0x2a)
      throw Error('SEASONAL_WEBP_LOSSY_HEADER_INVALID')
    width=b.readUInt16LE(26)&0x3fff
    height=b.readUInt16LE(28)&0x3fff
  } else throw Error('SEASONAL_WEBP_UNSUPPORTED_ENCODING: '+kind)
  if(!width || !height || animated)throw Error('SEASONAL_WEBP_IMAGE_INVALID')
  return {width,height,alpha,animated,bytes:b.length,encoding:kind}
}

export async function auditSeasonalArtwork({
  root=resolve('public'), ready=CINEMATIC_MEDIA_READY,
  assets=seasonalVisualAssets,
}={}) {
  if(new Set(ready).size!==ready.length || ready.some(id=>!seasonIds.has(id)))
    throw Error('SEASONAL_READY_MANIFEST_INVALID')
  const audited=[]
  for(const {id} of SEASONAL_CONTENT_MODES){
    const promoted=ready.includes(id)
    const season=assets(id)
    for(const type of ['wallpaper','corner']){
      const path=season[type]
      const extension=promoted?'webp':'svg'
      if(path!==`/seasonal-atmosphere/${id}-${type}.${extension}`)
        throw Error('SEASONAL_ASSET_MANIFEST_PATH_MISMATCH: '+id+':'+type)
      const value=await readFile(resolve(root,'.'+path))
      if(promoted){
        const info=inspectSeasonalWebP(value)
        if(info.bytes>1_500_000)throw Error('SEASONAL_WEBP_TOO_LARGE: '+path)
        if(type==='wallpaper' && (info.width<1400 || info.height<788
          || Math.abs(info.width/info.height-16/9)>0.04))
          throw Error('SEASONAL_WALLPAPER_SIZE_INVALID: '+path)
        if(type==='corner' && (info.width<500 || info.height<350 || !info.alpha))
          throw Error('SEASONAL_CORNER_ALPHA_OR_SIZE_INVALID: '+path)
        audited.push({season:id,type,format:extension,...info})
      } else {
        const svg=value.toString('utf8')
        if(!svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')
          || /<script|<image|foreignObject|https?:\/\//i.test(svg)
          || value.length>30000)throw Error('SEASONAL_SVG_UNSAFE: '+path)
        audited.push({season:id,type,format:extension,bytes:value.length})
      }
    }
  }
  return audited
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  auditSeasonalArtwork().then(items=>
    console.log(JSON.stringify({kind:'moviehub-seasonal-art-audit',count:items.length,items})),
  ).catch(error=>{console.error(error.message);process.exitCode=1})
}
