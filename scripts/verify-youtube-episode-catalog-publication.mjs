import {readFile} from 'node:fs/promises'
import {isDeepStrictEqual} from 'node:util'
import {pathToFileURL} from 'node:url'

export async function verifyYoutubeEpisodeCatalogPublication({
  prepared=false, publicDir='public',
  origin='https://movie-hub-62459.web.app', request=fetch,
}={}){
  const local=async path=>JSON.parse(await readFile(publicDir+'/'+path,'utf8'))
  const summary=await local('youtube-episode-playlist-summary.json')
  const manifest=await local('series-details/manifest.json')
  if(summary?.kind!=='moviehub-youtube-episode-playlist-source-summary'
    ||summary.schemaVersion!==1||summary.editorialOnly!==true
    ||summary.independentlyVerifiedDEOffers!==0||summary.verifiedPlaybackRoutes!==0
    ||!Number.isSafeInteger(summary.sourceVideoIds)||summary.sourceVideoIds<1
    ||!Number.isSafeInteger(summary.provisionalEpisodeLinks)
    ||!Number.isSafeInteger(summary.confirmedMetadataProposals)
    ||summary.confirmedMetadataProposals<summary.provisionalEpisodeLinks
    ||!Array.isArray(summary.affectedBuckets)
    ||new Set(summary.affectedBuckets).size!==summary.affectedBuckets.length
    ||summary.affectedBuckets.some(x=>!/^[0-9a-f]{2}$/.test(x))
    ||manifest?.kind!=='series-season-manifest'
    ||manifest.version!==1||manifest.bucketCount!==256
    ||!Array.isArray(manifest.shards)||manifest.shards.length!==256
    ||manifest.youtubeEpisodePlaylistEnrichment?.generatedAt!==summary.generatedAt
    ||manifest.youtubeEpisodePlaylistEnrichment?.provisionalEpisodeLinks!==summary.provisionalEpisodeLinks
    ||manifest.youtubeEpisodePlaylistEnrichment?.verificationStatus!=='not-independently-verified'){
    throw Error('YOUTUBE_EPISODE_PUBLICATION_INVALID_METADATA')
  }
  const shards=await Promise.all(summary.affectedBuckets.map(async bucket=>{
    const shard=await local('series-details/'+bucket+'.json')
    if(shard?.kind!=='series-season-shard'||shard.version!==1||shard.bucket!==bucket
      ||!Array.isArray(shard.entries)
      ||shard.entries.length!==manifest.shards.find(s=>s.bucket===bucket)?.count)
      throw Error('YOUTUBE_EPISODE_PUBLICATION_INVALID_SHARD')
    return [bucket,shard]
  }))
  const total=shards.flatMap(([,shard])=>shard.entries)
    .flatMap(s=>s.episodes||[]).filter(e=>e.youtubePlaylistHint).length
  if(total!==summary.provisionalEpisodeLinks){
    throw Error('YOUTUBE_EPISODE_PUBLICATION_LINK_COUNT_MISMATCH')
  }
  if(!prepared){
    const expected=[['youtube-episode-playlist-summary.json',summary],
      ['series-details/manifest.json',manifest],
      ...shards.map(([bucket,shard])=>['series-details/'+bucket+'.json',shard])]
    for(const [path,source] of expected){
      const url=new URL('/'+path,origin)
      url.searchParams.set('generation',String(Date.now()))
      const response=await request(url,{cache:'no-store',redirect:'error',
        signal:AbortSignal.timeout(20_000)})
      if(!response?.ok)throw Error('YOUTUBE_EPISODE_PUBLICATION_UNREACHABLE:'+path)
      if(!isDeepStrictEqual(await response.json(),source)){
        throw Error('Published generation differs from build: '+path)
      }
    }
  }
  return {sourceVideos:summary.sourceVideoIds,
    provisionalEpisodeLinks:summary.provisionalEpisodeLinks,
    independentlyVerifiedDEOffers:0}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const prepared=process.argv.includes('--prepared')
  const tries=prepared?1:8
  for(let attempt=1;attempt<=tries;attempt++){
    try{
      const result=await verifyYoutubeEpisodeCatalogPublication({prepared})
      console.log(JSON.stringify({checked:'canonical-season-shards',...result}))
      break
    }catch(error){
      if(attempt===tries||!String(error.message).startsWith('Published generation differs from build:')){
        console.error('YOUTUBE_EPISODE_PUBLICATION_FAILED: '+error.message)
        process.exitCode=1
        break
      }
      await new Promise(resolve=>setTimeout(resolve,3000))
    }
  }
}
