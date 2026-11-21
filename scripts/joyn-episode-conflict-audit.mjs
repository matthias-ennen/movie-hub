/** #885: private, count-only recheck of severe movie/series conflicts.
 * Peer and description agreement are evidence, not authorization to rematch.
 * In particular, possible split films are excluded from actionable evidence.
 */
import { buildJoynWaipuPeerIndex } from './joyn-peer-airing-audit.mjs'
import { exactTitleKey } from './tmdb-title-evidence.mjs'
import { descriptionEvidence } from './joyn-tmdb-matcher.mjs'
import { seriesSeasonBucket, SERIES_SEASON_DATA_VERSION } from '../src/catalog/seriesNavigation.js'

const positive=value=>Number.isSafeInteger(value)&&value>0
const strong=e=>e.overlap>=6&&e.score>=0.22

export async function auditJoynEpisodeConflicts({severeRows,stationMapping,waipuTitles,waipuIndex,now,
  readSeasonShard,programDiagnostics=new Map(),cachedProgramIds}={}) {
  if(!Array.isArray(severeRows)||severeRows.length>200000||typeof readSeasonShard!=='function'||
    !(programDiagnostics instanceof Map))return {status:'unavailable'}
  const index=buildJoynWaipuPeerIndex({stationMapping,waipuTitles,waipuIndex,now})
  if(index.status!=='ready')return {status:'unavailable'}
  const counts={status:'ready',severeRows:severeRows.length,exactPeerSeries:0,possibleSplit:0,
    missingOrAmbiguousEpisodeRef:0,missingOrInvalidEpisodeMetadata:0,missingDescription:0,
    weakDescription:0,strongDescription:0,uniqueStrongDescription:0,competingOrCloseDescription:0,
    originalClassification:{movie:0,series:0,unknown:0,unavailable:0},originalDecision:{cache:0,fresh:0,unavailable:0},
    uniqueStrongByOriginalDecision:{cache:0,fresh:0,unavailable:0}}
  const shards=new Map(),episodesBySeries=new Map()
  async function episodesFor(id) {
    if(episodesBySeries.has(id))return episodesBySeries.get(id)
    const bucket=seriesSeasonBucket(id)
    if(!shards.has(bucket)){
      let shard
      try { shard=await readSeasonShard(bucket) } catch { shard=null }
      shards.set(bucket,shard?.kind==='series-season-shard'&&shard.version===SERIES_SEASON_DATA_VERSION&&shard.bucket===bucket&&
        Array.isArray(shard.entries)&&shard.entries.length<=10000?shard.entries:[])
    }
    const episodes=new Map()
    let valid=true
    const episodeIds=new Set()
    for(const season of shards.get(bucket)){
      if(season?.seriesTmdbId!==id)continue
      if(!positive(season.seasonNumber)||!Array.isArray(season.episodes)||season.episodes.length>10000){valid=false;break}
      for(const episode of season.episodes){
        const key=`${season.seasonNumber}:${episode?.episodeNumber}`
        if(episode?.seriesTmdbId!==id||episode.seasonNumber!==season.seasonNumber||!positive(episode.episodeNumber)||
          !positive(episode.tmdbId)||episodeIds.has(episode.tmdbId)||episodes.has(key)||episodes.size>=10000){valid=false;break}
        episodeIds.add(episode.tmdbId);episodes.set(key,episode)
      }
      if(!valid)break
    }
    episodesBySeries.set(id,valid?episodes:new Map())
    return episodesBySeries.get(id)
  }
  for(const {event,possibleSplit} of severeRows){
    if(event?.titleRef?.mediaType!=='movie')continue
    const source=event.extensions?.joyn??{},title=exactTitleKey(source.rawTitle)
    const peers=index.find(event.channelId,event.startAt,event.endAt)
    if(!title||!peers.length||new Set(peers.map(p=>`${p.type}:${p.tmdbId}`)).size!==1||
      peers[0].type!=='series'||!peers.some(p=>p.aliases.has(title)))continue
    counts.exactPeerSeries++
    const classification=programDiagnostics.get(source.programId)?.joynClassification
    const type=classification?.type
    counts.originalClassification[!classification?'unavailable':type==='movie'?'movie':type==='series'||type==='tv'?'series':'unknown']++
    const origin=cachedProgramIds instanceof Set&&programDiagnostics.has(source.programId)?
      cachedProgramIds.has(source.programId)?'cache':'fresh':'unavailable'
    counts.originalDecision[origin]++
    if(possibleSplit){counts.possibleSplit++;continue}
    if(peers.some(p=>!positive(p.seasonNumber)||!positive(p.episodeNumber))){counts.missingOrAmbiguousEpisodeRef++;continue}
    const keys=new Set(peers.map(p=>`${p.seasonNumber}:${p.episodeNumber}`))
    if(keys.size!==1){counts.missingOrAmbiguousEpisodeRef++;continue}
    const episodes=await episodesFor(peers[0].tmdbId),episode=episodes.get([...keys][0])
    if(!episode){counts.missingOrInvalidEpisodeMetadata++;continue}
    if(typeof source.description!=='string'||!source.description.trim()||typeof episode.description!=='string'||!episode.description.trim()){
      counts.missingDescription++;continue
    }
    const evidence=descriptionEvidence(source.description,episode.description)
    if(!strong(evidence)){counts.weakDescription++;continue}
    counts.strongDescription++
    // Distinctive only among available canonical descriptions, not proof that
    // every possible episode was fetched or that the peer is independent.
    const competitors=[...episodes.values()].filter(e=>e!==episode&&typeof e.description==='string'&&e.description.trim())
    if(!competitors.length||competitors.some(e=>evidence.score-descriptionEvidence(source.description,e.description).score<0.12)){
      counts.competingOrCloseDescription++;continue
    }
    counts.uniqueStrongDescription++
    counts.uniqueStrongByOriginalDecision[origin]++
  }
  return counts
}
