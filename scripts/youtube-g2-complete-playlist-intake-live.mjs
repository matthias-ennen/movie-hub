import { readFile,mkdir,writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  planCompleteYoutubePlaylistIntake,completeYoutubeIntakeReport,
} from './youtube-g2-complete-playlist-intake.mjs'

export const SOURCE='artifacts/youtube-g2/curated-production-sync/qa.json'
export const RESEARCH='artifacts/youtube-g2/curated-tmdb-membership/qa.json'
export const OUTPUT='artifacts/youtube-g2/complete-playlist-intake'

export async function writeCompleteYoutubePlaylistIntake({
  sourcePath=SOURCE,researchPath=RESEARCH,
  directory=OUTPUT,now=new Date().toISOString(),
}={}){
  const [source,research]=await Promise.all([
    readFile(sourcePath,'utf8').then(JSON.parse),
    readFile(researchPath,'utf8').then(JSON.parse),
  ])
  const planned=planCompleteYoutubePlaylistIntake(source,research,{now})
  if(planned.unaccountedForVideoIds!==0
    ||planned.processedVideoIds!==source.audit.uniqueVideoIds){
    throw Error('YOUTUBE_COMPLETE_PLAYLIST_INTAKE_NOT_COMPLETE')
  }
  await mkdir(directory,{recursive:true})
  await writeFile(directory+'/qa.json',JSON.stringify(planned,null,2)+'\n',{mode:0o600})
  await writeFile(directory+'/report.md',completeYoutubeIntakeReport(planned)+'\n',{mode:0o600})
  process.stdout.write(JSON.stringify({
    sourceVideoIds:planned.uniqueVideoIds,
    processedVideoIds:planned.processedVideoIds,
    omittedVideoIds:planned.unaccountedForVideoIds,
    playlistClasses:planned.playlistClasses,
    stages:planned.stages,
    originalMovieHubLinks:planned.existingMovieEditorialLinks,
    newCatalogTitlesImported:planned.newCatalogTitlesImported,
    productionOffers:planned.productionAvailabilityRecords,
    catalogWrites:planned.catalogWrites,
    firestoreWrites:planned.firestoreWrites,
  })+'\n')
  return planned
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  writeCompleteYoutubePlaylistIntake().catch(error=>{
    console.error('YouTube 100% playlist intake STAGING failed closed: '+error.message)
    process.exitCode=1
  })
}
