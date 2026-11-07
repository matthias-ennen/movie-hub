import { describe, expect, it } from 'vitest'
import { SEASONAL_CONTENT_MODES } from '../src/catalog/seasonalContent.js'
import {
  seasonalVisualAssets,
} from '../src/theme/seasonalPresentation.js'
import {
  CINEMATIC_MEDIA_READY, isCinematicSeasonMediaReady,
} from '../src/theme/seasonalMediaManifest.js'
import {
  auditSeasonalArtwork, inspectSeasonalWebP,
} from '../scripts/audit-seasonal-artwork.mjs'

function extendedWebP(width,height,{alpha=true,animated=false}={}) {
  const b=Buffer.alloc(30)
  b.write('RIFF',0,'ascii')
  b.writeUInt32LE(22,4)
  b.write('WEBP',8,'ascii')
  b.write('VP8X',12,'ascii')
  b.writeUInt32LE(10,16)
  b[20]=(alpha?0x10:0)|(animated?0x02:0)
  b.writeUIntLE(width-1,24,3)
  b.writeUIntLE(height-1,27,3)
  return b
}

describe('#484 opt-in cinematic seasonal media pipeline',()=>{
  it('retains all nine tested legacy resources until each original pair is approved',async()=>{
    expect(Array.isArray(CINEMATIC_MEDIA_READY)).toBe(true)
    for(const {id} of SEASONAL_CONTENT_MODES){
      expect(isCinematicSeasonMediaReady(id)).toBe(CINEMATIC_MEDIA_READY.includes(id))
      const extension=CINEMATIC_MEDIA_READY.includes(id)?'webp':'svg'
      const assets=seasonalVisualAssets(id)
      expect(assets.wallpaper).toBe(`/seasonal-atmosphere/${id}-wallpaper.${extension}`)
      expect(assets.corner).toBe(`/seasonal-atmosphere/${id}-corner.${extension}`)
    }
    const audited=await auditSeasonalArtwork()
    expect(audited).toHaveLength(18)
    expect(audited.every(x=>x.format===(CINEMATIC_MEDIA_READY.includes(x.season)?'webp':'svg'))).toBe(true)
    expect(audited.every(x=>x.bytes>0)).toBe(true)
  })
  it('reads dimensions and alpha for both new still and extended WebP',()=>{
    expect(inspectSeasonalWebP(extendedWebP(1600,900,{alpha:false}))).toMatchObject({
      width:1600,height:900,alpha:false,animated:false,encoding:'VP8X',
    })
    expect(inspectSeasonalWebP(extendedWebP(1024,768,{alpha:true}))).toMatchObject({
      width:1024,height:768,alpha:true,animated:false,
    })
    expect(()=>inspectSeasonalWebP(extendedWebP(1024,768,{animated:true})))
      .toThrow('SEASONAL_WEBP_IMAGE_INVALID')
    expect(()=>inspectSeasonalWebP(Buffer.from('<html>no image</html>')))
      .toThrow('SEASONAL_WEBP_HEADER_INVALID')
  })
  it('rejects invalid media manifests before checking any file',async()=>{
    await expect(auditSeasonalArtwork({ready:['not-a-season']}))
      .rejects.toThrow('SEASONAL_READY_MANIFEST_INVALID')
    await expect(auditSeasonalArtwork({ready:['christmas','christmas']}))
      .rejects.toThrow('SEASONAL_READY_MANIFEST_INVALID')
  })
})
