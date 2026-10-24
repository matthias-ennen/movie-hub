import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {
  buildYoutubeActionableReviewQueue,renderYoutubeActionableReviewQueue,
} from './youtube-g2-actionable-review-queue.mjs'
export const FILES={
  intake:'artifacts/youtube-g2/complete-playlist-intake/qa.json',
  research:'artifacts/youtube-g2/curated-tmdb-membership/qa.json',
  reconciliation:'artifacts/youtube-g2/full-catalog-reconciliation/qa.json',
  hints:'public/youtube-curated-title-hints.json',
  filmFeed:'public/youtube-curated-new-films.json',
}
export const OUTPUT='artifacts/youtube-g2/actionable-review-queue'
export async function runActionableReviewQueue({
  files=FILES,output=OUTPUT,now=new Date().toISOString(),
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_REVIEW_QUEUE_READ_ONLY_ONLY')
  const inputs=Object.fromEntries(await Promise.all(
    Object.entries(files).map(async ([key,path])=>[key,JSON.parse(await readFile(path,'utf8'))])))
  const report=buildYoutubeActionableReviewQueue({...inputs,now})
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/qa.json',JSON.stringify(report,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',renderYoutubeActionableReviewQueue(report)+'\n',{mode:0o600}),
  ])
  process.stdout.write(JSON.stringify({
    sourceVideos:report.sourceVideoIds,
    accountedForVideos:report.accountedForVideos,
    publishedPlaylistLinks:report.publishedPlaylistLinks,
    publishedNewTmdbMovies:report.newCanonicalMovies,
    reviewQueueVideos:report.pendingReview,reviewLanes:report.lanes,
    verifiedDEOffers:0,newDatabaseWrites:0,
  })+'\n')
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runActionableReviewQueue().catch(error=>{
    console.error('YOUTUBE_REVIEW_QUEUE_FAIL_CLOSED: '+error.message)
    process.exitCode=1
  })
}
