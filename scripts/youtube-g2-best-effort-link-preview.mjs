/**
 * Turn the successful private daily videos.list review into an ALSO PRIVATE,
 * small link-only projection. Never publish this on its own or claim a DE offer.
 * Conversion is pure; CLI reads a local QA artifact and writes a private file.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {buildYoutubeBestEffortLinkIndex}
  from '../src/providers/youtubeBestEffortRouteIndex.js'

export const PRIVATE_QA='artifacts/youtube-g2/global-known-no-search-review/qa.json'
export const PRIVATE_PREVIEW='artifacts/youtube-g2/global-known-no-search-review/best-effort-links.private.json'

export async function generatePrivateBestEffortLinkPreview({
  input=PRIVATE_QA,output=PRIVATE_PREVIEW,now=new Date().toISOString(),
}={}){
  const review=JSON.parse(await readFile(input,'utf8'))
  const result=buildYoutubeBestEffortLinkIndex(review,{now})
  if(result.verifiedDEOffers!==0||result.verifiedPlaybackRoutes!==0
    ||result.providerBadgeWrites!==0||result.claimedOfferTypes.length!==0)
    throw Error('YOUTUBE_BEST_EFFORT_PREVIEW_EXCEEDS_LINK_ONLY_SCOPE')
  await mkdir(dirname(resolve(output)),{recursive:true})
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify({
    kind:result.kind,privateOnly:true,sourceFilms:review.summary.rowsChecked,
    proposedWatchShortcuts:result.count,searchCallsPerformed:0,
    independentlyVerifiedDEOffers:0,publishedDirectRoutes:0,
    providerBadgeWrites:0,
  }))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  generatePrivateBestEffortLinkPreview().catch(e=>{
    console.error('PRIVATE BEST-EFFORT PREVIEW FAILED: '+e.message)
    process.exitCode=1
  })
}
