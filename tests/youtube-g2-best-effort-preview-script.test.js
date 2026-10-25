import {describe,it,expect} from 'vitest'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'
import {generatePrivateBestEffortLinkPreview}
  from '../scripts/youtube-g2-best-effort-link-preview.mjs'

const current='2026-10-25T12:00:00Z'
const sample=()=>({
  summary:{
    kind:'moviehub-youtube-g2-global-known-video-no-search-recheck',
    generatedAt:current,rowsChecked:1,searchCalls:0,
    privateReviewArtifact:true,publicationPermitted:false,
    independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
    firebaseWrites:0,providerWrites:0,catalogWrites:0,badgeWrites:0,
  },
  rows:[{
    tmdbId:100,status:'review-single-video-candidate',
    candidateDiscoveryMode:'trusted-previous-candidate-ids',
    tmdbDeOfferTypes:['free'],
    reviewedVideoId:null,directPlaybackRoute:null,publicationPermitted:false,
    videoCandidates:[{
      videoId:'0nBiidtN7ZU',score:45,titleLevel:4,runtimeDelta:2,
      strong:true,yearMismatch:false,sequelConflict:false,
      sourceTypeRisk:false,regionSignal:'unknown',
    }],
  }],
})
describe('private best-effort preview generator',()=>{
  it('writes only local protected review candidate projection, no sources changed',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'moviehub-best-effort-'))
    try{
      const input=join(dir,'qa.json'),output=join(dir,'preview.private.json')
      const original=JSON.stringify(sample())
      await writeFile(input,original)
      const result=await generatePrivateBestEffortLinkPreview({input,output,now:current})
      expect(result).toMatchObject({
        count:1,verifiedDEOffers:0,verifiedPlaybackRoutes:0,providerBadgeWrites:0,
      })
      expect(JSON.parse(await readFile(output,'utf8'))).toEqual(result)
      expect(await readFile(input,'utf8')).toBe(original)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('rejects attempt to project stale QA, even when a watch video exists',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'moviehub-best-effort-'))
    try{
      const input=join(dir,'qa.json'),output=join(dir,'preview.private.json')
      const invalid=sample()
      invalid.summary.generatedAt='2026-09-01T12:00:00Z'
      await writeFile(input,JSON.stringify(invalid))
      await expect(generatePrivateBestEffortLinkPreview({
        input,output,now:current,
      })).rejects.toThrow('YOUTUBE_BEST_EFFORT_PRIVATE_QA_INVALID_OR_STALE')
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('scheduled research writes only a private artifact, never directly publishes it',()=>{
    const workflow=readFileSync(new URL(
      '../.github/workflows/youtube-g2-global-known-no-search.yml',import.meta.url,
    ),'utf8')
    expect(workflow).toContain('node scripts/youtube-g2-best-effort-link-preview.mjs')
    expect(workflow).toContain('best-effort-links.private.json')
    expect(workflow).toContain('retention-days: 7')
    expect(workflow).not.toContain('node scripts/generate-youtube-best-effort-public')
    expect(workflow).not.toContain('firebase deploy')
    expect(workflow).not.toContain('gsutil cp')
  })
})
