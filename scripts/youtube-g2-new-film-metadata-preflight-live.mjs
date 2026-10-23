/**
 * Runs against the private, complete-account reconciliation file within CI.
 * Reuses the same canonical TMDB loader as Waipu/Joyn and MovieHub's executor.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {WaipuTmdbMetadataClient} from './waipu-title-metadata.mjs'
import {
  inspectYoutubeNewFilmMetadata,youtubeNewFilmMetadataReport,
} from './youtube-g2-new-film-metadata-preflight.mjs'
export const RECONCILIATION='artifacts/youtube-g2/full-catalog-reconciliation/qa.json'
export const INTAKE='artifacts/youtube-g2/complete-playlist-intake/qa.json'
export const OUTPUT='artifacts/youtube-g2/new-film-metadata-preflight'
export async function runYoutubeNewFilmMetadataPreflight({
  reconciliationPath=RECONCILIATION,intakePath=INTAKE,
  output=OUTPUT,token=process.env.TMDB_API_READ_TOKEN,
  now=new Date().toISOString(),loadTitle=null,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_TMDB_NEW_FILM_READ_ONLY_REQUIRED')
  const [reconciliation,intake]=await Promise.all(
    [reconciliationPath,intakePath].map(x=>readFile(x,'utf8').then(JSON.parse)))
  if(!loadTitle&&!token)throw Error('TMDB_API_READ_TOKEN_MISSING')
  const client=loadTitle?null:new WaipuTmdbMetadataClient({
    token,language:'de-DE',country:'DE',maxRequests:250,maxRetries:2,
  })
  const result=await inspectYoutubeNewFilmMetadata(reconciliation,intake,{
    now,loadTitle:loadTitle||((ref,date)=>client.loadTitle(ref,date)),
  })
  await mkdir(output,{recursive:true})
  await writeFile(output+'/qa.json',JSON.stringify(result,null,2)+'\n',{mode:0o600})
  await writeFile(output+'/report.md',youtubeNewFilmMetadataReport(result)+'\n',{mode:0o600})
  console.log(JSON.stringify({
    upstreamVideos:result.accountedSourceVideoIds,
    inspectedCandidates:result.inspectedCandidates,
    metadataReadyForWorkReview:result.metadataReadyForWorkReview,
    outcomes:result.counts,tmdbApiCalls:client?.requestsStarted||0,
    catalogWrites:0,firestoreWrites:0,newMovieImports:0,
  }))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runYoutubeNewFilmMetadataPreflight().catch(e=>{
    console.error('YouTube new-film metadata preflight failed closed: '+e.message)
    process.exitCode=1
  })
}
