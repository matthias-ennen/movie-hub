import {readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {WaipuTmdbMetadataClient} from './waipu-title-metadata.mjs'
import {buildYoutubeNewFilmCatalogProjection} from './youtube-g2-publish-new-film-catalog.mjs'

export const REVIEW='artifacts/youtube-g2/canonical-new-film-metadata-review/qa.json'
export const RECON='artifacts/youtube-g2/full-catalog-reconciliation/qa.json'
export const INTAKE='artifacts/youtube-g2/complete-playlist-intake/qa.json'
export const HINTS='public/youtube-curated-title-hints.json'
export const OUTPUT='public/youtube-curated-new-films.json'

export async function publishYoutubeCuratedNewFilmMetadata({
  reviewPath=REVIEW,reconciliationPath=RECON,intakePath=INTAKE,
  editorialPath=HINTS,output=OUTPUT,
  token=process.env.TMDB_API_READ_TOKEN,
  now=new Date().toISOString(),loadTitle=null,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_EDITORIAL_CANONICAL_METADATA_ONLY')
  const [metadataReview,reconciliation,intake,editorialIndex]=await Promise.all(
    [reviewPath,reconciliationPath,intakePath,editorialPath]
      .map(x=>readFile(x,'utf8').then(JSON.parse)))
  if(!loadTitle&&!token)throw Error('YOUTUBE_CANONICAL_METADATA_TOKEN_MISSING')
  const client=loadTitle?null:new WaipuTmdbMetadataClient({
    token,language:'de-DE',country:'DE',maxRequests:250,maxRetries:2,
  })
  const canonicalTitles=[]
  for(const entry of metadataReview.items){
    const movie=await (loadTitle||((ref,at)=>client.loadTitle(ref,at)))({
      type:'movie',tmdbId:entry.tmdbId,
    },now)
    canonicalTitles.push(movie)
  }
  const projected=buildYoutubeNewFilmCatalogProjection({
    metadataReview,reconciliation,intake,editorialIndex,
    canonicalTitles,now,
  })
  // Prepare both files atomically enough for the single Firebase build:
  // no title is published without an accompanying exact video hint.
  await Promise.all([
    writeFile(output,JSON.stringify(projected.filmFeed)+'\n','utf8'),
    writeFile(editorialPath,JSON.stringify(projected.editorialIndex)+'\n','utf8'),
  ])
  console.log(JSON.stringify({
    ...projected.summary,tmdbApiRequests:client?.requestsStarted||0,
    publishedNewCanonicalMovieTitles:projected.filmFeed.count,
    catalogOrFirestoreDatabaseWrites:0,
    verifiedDEOffers:0,
  }))
  return projected
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  publishYoutubeCuratedNewFilmMetadata().catch(e=>{
    console.error('YouTube new-film catalog import FAILED CLOSED: '+e.message)
    process.exitCode=1
  })
}
