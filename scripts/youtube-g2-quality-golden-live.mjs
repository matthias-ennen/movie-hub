/** AP1 historical golden quality observations applied to current private G2 QA. */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {buildG2QualityGoldenReport} from './youtube-g2-quality-golden.mjs'

const REVIEW='artifacts/youtube-g2/actionable-review-queue/qa.json'
const OUTPUT='artifacts/youtube-g2/quality-golden'
export async function runYoutubeG2QualityGolden({
  reviewPath=REVIEW,output=OUTPUT,read=readFile,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('G2_QUALITY_GOLDEN_READ_ONLY_REQUIRED')
  const reviewQueue=JSON.parse(await read(reviewPath,'utf8'))
  const result=buildG2QualityGoldenReport({reviewQueue})
  const stats=result.playlistFirst,pilot=result.tmdbFirst
  await mkdir(output,{recursive:true})
  const report=[
    '# YouTube G2 – historical quality golden anchors (private)',
    '',
    '- TMDB-FIRST reference: ORIGINAL run '+pilot.sourceRun+', '+pilot.selected+' films',
    '- Original categories: '+JSON.stringify(pilot.historicalClassCounts),
    '- WARNING: historical pilot not rerun in this deploy. These outcomes are NOT confirmed video routes.',
    '- Known YouTube search false-negative reference: TMDB movie '+result.knownTmdbSearchFalseNegative.tmdbId,
    '- PLAYLIST-FIRST original run: '+stats.sourceRun,
    '- Historical watchlist sample: '+stats.historicalSampleSize+' real video IDs',
    '- Present/absent/changed: '+stats.anchorsPresent+'/'+stats.anchorsAbsent+'/'+stats.changedAnchors,
    '- User-reported successful playlist links currently present: '+stats.userTestedPositiveAnchorsPresent,
    '- Removed unauthorized FREE duplicate reappeared: '+stats.removedUnauthorizedFreeUploadPresent,
    '- On reappearance, REQUIRES explicit source-authorization review; never auto re-add.',
    '- Playlist lane deltas: '+JSON.stringify(stats.reviewDeltas),
    '- Absent source IDs (NO delete inference): '+JSON.stringify(stats.absentSourceIds),
    '- Independent verified DE offers: 0; automatic approvals: 0; API searches in QA: 0.',
    '- No account-scoped canonical membership or personal profile details are exported.',
    '',
  ].join('\n')
  await Promise.all([
    writeFile(output+'/qa.json',JSON.stringify(result,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',report,{mode:0o600}),
  ])
  console.log(JSON.stringify({
    kind:result.kind,historicalTmdbFirstCases:pilot.selected,
    historicalSingle:pilot.historicalClassCounts.single,
    historicalMultiple:pilot.historicalClassCounts.multiple,
    historicalUnresolved:pilot.historicalClassCounts.unresolved,
    playlistAnchors:stats.historicalSampleSize,
    playlistAnchorsPresent:stats.anchorsPresent,
    playlistAnchorsAbsent:stats.anchorsAbsent,
    playlistAnchorsChanged:stats.changedAnchors,
    unauthorizedRemovedUploadReappeared:stats.removedUnauthorizedFreeUploadPresent,
    independentlyVerifiedDEOffers:0,automaticApprovals:0,
    youtubeSearchApiCalls:0,firestoreWrites:0,catalogWrites:0,
  }))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runYoutubeG2QualityGolden().catch(error=>{
    console.error('G2 historical-quality-golden failed closed: '+error.message)
    process.exitCode=1
  })
}
