/**
 * Production-facing projection of the existing YouTube G2 adapter RESEARCH.
 * It is an explicitly provisional title hint, never SourceEnvelope availability.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {
  buildCuratedEditorialTitleIndex,CURATED_HINT_KIND,CURATED_HINT_VERSION,
} from '../src/providers/youtubeCuratedEditorialIndex.js'

export const SOURCE='artifacts/youtube-g2/curated-production-sync/qa.json'
export const RESEARCH='artifacts/youtube-g2/curated-tmdb-membership/qa.json'
export const OUTPUT='public/youtube-curated-title-hints.json'

async function optionalJson(path){
  try{return JSON.parse(await readFile(path,'utf8'))}
  catch(e){if(e.code==='ENOENT')return null;throw e}
}
export async function generateCuratedEditorialIndex({
  sourcePath=SOURCE,researchPath=RESEARCH,output=OUTPUT,
  now=new Date().toISOString(),
}={}){
  const [source,research]=await Promise.all([
    optionalJson(sourcePath),optionalJson(researchPath),
  ])
  const result=source&&research
    ?buildCuratedEditorialTitleIndex(source,research,{now})
    :{
      kind:CURATED_HINT_KIND,schemaVersion:CURATED_HINT_VERSION,
      providerId:'youtube',generatedAt:now,sourceVideoIds:0,
      publicationAuthority:'editorial-playlist-only',
      verifiedDEOffers:0,verifiedPlaybackRoutes:0,
      count:0,entries:[],classificationCounts:{free:0,'rent-buy':0},
      skippedAmbiguousMovieKeys:0,
    }
  await mkdir(dirname(output),{recursive:true})
  await writeFile(output,JSON.stringify(result)+'\n','utf8')
  console.log(JSON.stringify({
    sourceVideoIds:result.sourceVideoIds,
    sourceClassifiedFree:result.classificationCounts.free,
    sourceClassifiedRentBuy:result.classificationCounts['rent-buy'],
    provisionalTitleHints:result.count,
    skippedAmbiguousMovieKeys:result.skippedAmbiguousMovieKeys,
    verifiedDEOffers:0,verifiedPlaybackRoutes:0,
    firestoreWrites:0,catalogWrites:0,badgeWrites:0,
  }))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  generateCuratedEditorialIndex().catch(e=>{
    console.error('Provisional playlist hints FAIL CLOSED: '+e.message)
    process.exitCode=1
  })
}
