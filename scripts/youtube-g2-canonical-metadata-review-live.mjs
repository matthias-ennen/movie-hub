import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {WaipuTmdbMetadataClient} from './waipu-title-metadata.mjs'
import {
  planYoutubeNewFilmMetadataReview,
  inspectYoutubeNewFilmMetadata,
  youtubeMetadataReviewMarkdown,
} from './youtube-g2-canonical-metadata-review.mjs'
export const RECONCILIATION='artifacts/youtube-g2/full-catalog-reconciliation/qa.json'
export const INTAKE='artifacts/youtube-g2/complete-playlist-intake/qa.json'
export const RESEARCH='artifacts/youtube-g2/curated-tmdb-membership/qa.json'
export const OUTPUT='artifacts/youtube-g2/canonical-new-film-metadata-review'
export async function runYoutubeNewFilmMetadataReview({
  reconciliationPath=RECONCILIATION,
  intakePath=INTAKE,researchPath=RESEARCH,output=OUTPUT,
  now=new Date().toISOString(),
  loadTitle=null,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_G2_METADATA_PREVIEW_READ_ONLY')
  const [reconciliation,intake,research]=await Promise.all(
    [reconciliationPath,intakePath,researchPath].map(p=>readFile(p,'utf8').then(JSON.parse)))
  const plan=planYoutubeNewFilmMetadataReview(reconciliation,intake,research,{now})
  const token=process.env.TMDB_API_READ_TOKEN
  if(plan.candidateCount>0&&!loadTitle&&!token)throw Error('TMDB_TOKEN_MISSING_FOR_YOUTUBE_METADATA')
  const client=loadTitle?null:new WaipuTmdbMetadataClient({
    token:token||'not-used',language:'de-DE',country:'DE',
    maxRequests:Math.max(1,plan.candidateCount*3),
  })
  const result=await inspectYoutubeNewFilmMetadata(plan,{
    now,loadTitle:loadTitle||((entry,at)=>client.loadTitle(entry,at)),
  })
  await mkdir(output,{recursive:true})
  await writeFile(output+'/qa.json',JSON.stringify(result,null,2)+'\n',{mode:0o600})
  await writeFile(output+'/report.md',youtubeMetadataReviewMarkdown(result)+'\n',{mode:0o600})
  process.stdout.write(JSON.stringify({
    sourceVideoIds:result.totalVideoIds,
    newFilmHypotheses:result.candidatesSelected,
    tmdbMetadataRetrieved:result.metadataPreviewReady,
    reviewStatuses:result.counts,
    tmdbRequests:client?.requestsStarted||0,
    newMoviesImported:0,verifiedDEOffers:0,catalogWrites:0,firestoreWrites:0,
  })+'\n')
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runYoutubeNewFilmMetadataReview().catch(e=>{
    console.error('YouTube canonical metadata preview FAIL CLOSED: '+e.message)
    process.exitCode=1
  })
}
