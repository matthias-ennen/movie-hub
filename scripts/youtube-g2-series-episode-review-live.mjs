/**
 * Private YouTube episode reconciliation. Reuses the already generated TMDB
 * series-season JSON shards, with NO TMDB/YouTube API calls or catalog writes.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {buildYoutubeEpisodeIdentityReview} from './youtube-g2-series-episode-matching.mjs'

export const INPUT='artifacts/youtube-g2/curated-production-sync/qa.json'
export const SEASON_DIR='public/series-details'
export const OUTPUT='artifacts/youtube-g2/series-episode-review'

export async function readCachedCanonicalSeasons(directory=SEASON_DIR) {
  const manifest=JSON.parse(await readFile(directory+'/manifest.json','utf8'))
  if(manifest?.kind!=='series-season-manifest' || manifest.version!==1
    || !Array.isArray(manifest.shards) || manifest.shards.length!==256) {
    throw Error('YOUTUBE_EPISODE_CANONICAL_SEASON_MANIFEST_INVALID')
  }
  const populated=manifest.shards.filter(x=>Number(x?.count)>0)
  const groups=await Promise.all(populated.map(async entry=>{
    if(!/^[0-9a-f]{2}$/u.test(String(entry.bucket||'')))throw Error('YOUTUBE_EPISODE_BUCKET_INVALID')
    const shard=JSON.parse(await readFile(directory+'/'+entry.bucket+'.json','utf8'))
    if(shard?.kind!=='series-season-shard'||shard.version!==1
      ||shard.bucket!==entry.bucket||!Array.isArray(shard.entries)
      ||shard.entries.length!==entry.count)throw Error('YOUTUBE_EPISODE_CANONICAL_SHARD_MISMATCH')
    return shard.entries
  }))
  return groups.flat()
}

export async function runYoutubeSeriesEpisodeReview({
  input=INPUT,seasonDirectory=SEASON_DIR,output=OUTPUT,
  now=new Date().toISOString(),
}={}) {
  if(process.env.YOUTUBE_G2_WRITE_MODE)throw Error('YOUTUBE_EPISODE_REVIEW_READ_ONLY')
  const [source,seasons]=await Promise.all([
    readFile(input,'utf8').then(JSON.parse),readCachedCanonicalSeasons(seasonDirectory),
  ])
  const audit=source?.audit??source
  const report=buildYoutubeEpisodeIdentityReview(audit,seasons,{now})
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/qa.json',JSON.stringify(report,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',[
      '# YouTube – einzelne Serienfolgen (private TMDB-Prüfung)',
      '',
      '- Erfasste Videos: '+report.processedVideoIds,
      '- Videos mit expliziter Folgenkennung: '+report.episodeMarkedVideos,
      '- Videos mit exaktem, einzelnem TMDB-Folgentitel: '+report.episodeTitleOnlyCandidates,
      '- Alle privaten Episoden-Prüffälle: '+report.episodeIdentityReviewCases,
      '- Eindeutige TMDB-Folgen-Kandidaten: '+report.canonicalEpisodeProposals,
      '- Prüfstatus: '+JSON.stringify(report.reviewStatusCounts),
      '- Bestätigte DE-Angebote: 0; veröffentlichte Episoden-Links: 0.',
      '- Kein Film-Match für ausdrücklich gekennzeichnete Episoden.',
      '- Serien-ID/Staffel/Folge sind Identitätshypothesen, keine Bestätigung des vollständigen Videoinhalts.',
      '',
      '| Video | Titel | Staffel/Folge | TMDB-Episode | Status |',
      '|---|---|---|---|---|',
      ...report.cases.map(c=>'| '+c.videoId+' | '+c.videoTitle.replace(/\|/g,' ')
        +' | '+(c.seasonNumber??'–')+'/'+(c.episodeNumber??'–')
        +' | '+(c.canonicalEpisodeProposal?.episodeTmdbId??'–')+' | '+c.status+' |'),
      '',
    ].join('\n'),{mode:0o600}),
  ])
  console.log(JSON.stringify({
    checked:report.processedVideoIds,explicitEpisodes:report.episodeMarkedVideos,
    exactTitleOnlyEpisodes:report.episodeTitleOnlyCandidates,
    episodeReviewCases:report.episodeIdentityReviewCases,
    canonicalEpisodeProposals:report.canonicalEpisodeProposals,
    status:report.reviewStatusCounts,
    verifiedEpisodeOffers:0,publicEpisodeLinks:0,extraApiCalls:0,
  }))
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runYoutubeSeriesEpisodeReview().catch(error=>{
    console.error('YouTube episode candidate review failed safely: '+error.message)
    process.exitCode=1
  })
}
