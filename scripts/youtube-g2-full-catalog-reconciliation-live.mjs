/** Post-intake read-only join with the complete account-scoped title inventory. */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {reconcileYoutubeWithCompleteCatalog,completeCatalogReport} from './youtube-g2-full-catalog-reconciliation.mjs'

export const INPUT_INTAKE='artifacts/youtube-g2/complete-playlist-intake/qa.json'
export const INPUT_RESEARCH='artifacts/youtube-g2/curated-tmdb-membership/qa.json'
export const INPUT_CATALOG='artifacts/title-candidate-inventory.json'
export const OUTPUT='artifacts/youtube-g2/full-catalog-reconciliation'

export async function runCompleteCatalogReconciliation({
  intakePath=INPUT_INTAKE,researchPath=INPUT_RESEARCH,
  inventoryPath=INPUT_CATALOG,output=OUTPUT,now=new Date().toISOString(),
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_RECONCILIATION_READ_ONLY')
  const [intake,research,inventory]=await Promise.all(
    [intakePath,researchPath,inventoryPath].map(x=>readFile(x,'utf8').then(JSON.parse)))
  const report=reconcileYoutubeWithCompleteCatalog(intake,inventory,research,{now})
  if(report.processedVideoIds!==report.totalVideoIds
    ||report.unaccountedForVideoIds!==0||report.catalogWrites!==0){
    throw Error('YOUTUBE_FULL_CATALOG_RECONCILIATION_COVERAGE_FAILED')
  }
  await mkdir(output,{recursive:true})
  await writeFile(output+'/qa.json',JSON.stringify(report,null,2)+'\n',{mode:0o600})
  await writeFile(output+'/report.md',completeCatalogReport(report)+'\n',{mode:0o600})
  console.log(JSON.stringify({
    totalVideoIds:report.totalVideoIds,
    reconciled:report.processedVideoIds,
    unaccountedForVideoIds:report.unaccountedForVideoIds,
    completeCatalogCandidates:report.catalogCandidateCount,
    decisionsSummary:report.decisionsSummary,
    metadataReviewCandidateCount:report.metadataReviewCandidateCount,
    newMoviesImported:0,verifiedDEOffers:0,firestoreWrites:0,catalogWrites:0,
  }))
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runCompleteCatalogReconciliation().catch(e=>{
    console.error('YouTube full-catalog reconciliation failed closed: '+e.message)
    process.exitCode=1
  })
}
