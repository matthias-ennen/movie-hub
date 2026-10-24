/** One passive census per complete G2 deploy; no YouTube/TMDB API search. */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {loadPublicMovieHubIndex} from './youtube-g2-tmdb-first-link-pilot.mjs'
import {
  buildYoutubeG2BidirectionalCoverage,renderYoutubeG2BidirectionalCoverage,
} from './youtube-g2-bidirectional-coverage.mjs'

export const INPUTS={
  inventory:'artifacts/title-candidate-inventory.json',
  reviewQueue:'artifacts/youtube-g2/actionable-review-queue/qa.json',
  editorialIndex:'public/youtube-curated-title-hints.json',
  searchTitleFeed:'public/youtube-curated-search-titles.json',
  verifiedRoutes:'public/youtube-verified-title-routes.json',
}
export const OUTPUT='artifacts/youtube-g2/bidirectional-coverage'

export async function runYoutubeG2BidirectionalCoverage({
  inputs=INPUTS,output=OUTPUT,loadPublicIndex=loadPublicMovieHubIndex,
  now=new Date().toISOString(),
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('BIDIRECTIONAL_QA_READ_ONLY_REQUIRED')
  const [inventory,reviewQueue,editorialIndex,searchTitleFeed,verifiedRoutes,publicIndex]=
    await Promise.all([
      ...['inventory','reviewQueue','editorialIndex','searchTitleFeed','verifiedRoutes']
        .map(key=>readFile(inputs[key],'utf8').then(JSON.parse)),
      loadPublicIndex(),
    ])
  const report=buildYoutubeG2BidirectionalCoverage({
    inventory,publicIndex,reviewQueue,editorialIndex,searchTitleFeed,
    verifiedRoutes,now,
  })
  // PRIVATE artifact only; no public HTML/JSON, user/account titles or secrets.
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/qa.json',JSON.stringify(report,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',renderYoutubeG2BidirectionalCoverage(report)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify({
    mode:report.kind,playlistVideos:report.youtubeFirst.sourceVideos,
    publishedPlaylistLinks:report.youtubeFirst.editorialDirectLinks,
    unmatchedPlaylistVideos:report.youtubeFirst.reviewOnlyVideos,
    publicTmdbYoutubeMovieBadges:report.tmdbFirst.publicYoutubeBadgedMovies,
    publicTmdbYoutubeSeriesBadges:report.tmdbFirst.publicYoutubeBadgedSeries,
    tmdbBadgesWithExactRoutes:report.tmdbFirst.movieBadgesWithAnyExactRoute,
    tmdbBadgesWithoutExactRoutes:report.tmdbFirst.movieBadgesStillUsingSearchFallback,
    independentlyVerifiedDETitleRoutes:report.totalVerifiedDETitleRoutes,
    publicRecordsExported:0,apiSearches:0,catalogWrites:0,firestoreWrites:0,
  }))
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runYoutubeG2BidirectionalCoverage().catch(error=>{
    console.error('G2 bidirectional coverage FAILED CLOSED: '+error.message)
    process.exitCode=1
  })
}
