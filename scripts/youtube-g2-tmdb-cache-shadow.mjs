/** Observation-only bridge. Every matcher request still goes to live TMDB.
 * Cache candidates are compared to fresh answers; only aggregates leave this
 * private session. No matcher decisions or public availability are cached. */
import {isDeepStrictEqual} from 'node:util'
import {readSharedYoutubeTmdbResponse,loadYoutubeTmdbCache,saveYoutubeTmdbCache} from './youtube-g2-adaptive-tmdb-cache.mjs'

const endpoint=p=>p==='/search/movie'?'searchMovie':p==='/search/tv'?'searchTv':'movieDetail'
const counters=()=>({lookups:0,persistentWouldHit:0,sharedWouldHit:0,
  persistentCompared:0,sharedCompared:0,persistentEqual:0,sharedEqual:0,admitted:0,rejected:0})

export function createYoutubeTmdbShadowCollector({cache,sharedResponseCache=null}={}){
  const groups={searchMovie:counters(),searchTv:counters(),movieDetail:counters()}
  // The existing membership runner makes sequential requests. Keep only one
  // pending comparison; after a transport failure the next lookup discards it.
  let pending=null
  const adapter={
    get(path,params){
      const group=groups[endpoint(path)]
      group.lookups++
      const persisted=cache.get(path,params)
      const shared=readSharedYoutubeTmdbResponse(sharedResponseCache,path,params)
      if(persisted!==null)group.persistentWouldHit++
      if(shared!==null)group.sharedWouldHit++
      pending={group,persisted,shared,path,params}
      return null // never serve cached data in shadow mode
    },
    recordFresh(path,params,live){
      const before=pending
      pending=null
      const group=groups[endpoint(path)]
      const admitted=cache.recordFresh(path,params,live)
      if(admitted)group.admitted++
      else group.rejected++
      if(!admitted||before?.path!==path||!isDeepStrictEqual(before.params,params))return admitted
      for(const [source,value] of [['persistent',before.persisted],['shared',before.shared]]){
        if(value===null)continue
        group[source+'Compared']++
        if(isDeepStrictEqual(value,live))group[source+'Equal']++
      }
      return admitted
    },
  }
  return {adapter,counts:()=>({mode:'shadow',byEndpoint:structuredClone(groups),cache:cache.counts()})}
}

// Only the scheduled trusted central chain is allowed to create this private
// snapshot. Standalone QA, PR builds and direct deploys are never admitted.
export function youtubeTmdbShadowAllowed(env=process.env){
  return env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_EVENT_NAME==='schedule'
    &&env.MOVIEHUB_TRUSTED_CENTRAL_NIGHTLY==='true'
    &&env.DATA_CHECKPOINT_ENABLED==='true'
    &&env.DATA_CHECKPOINT_BUCKET==='movie-hub-62459-nightly-checkpoints'
    &&env.MOVIEHUB_YOUTUBE_TMDB_SHADOW==='private-shadow-v1'
}

// Inject the bucket for offline tests. An unreadable, invalid or contested
// checkpoint never blocks (or changes any answer of) the live matcher.
export async function openYoutubeTmdbShadowSession({bucket,sharedResponseCache=null,now=Date.now}={}){
  let loaded
  try{loaded=await loadYoutubeTmdbCache(bucket,{now})}
  catch{return {adapter:null,finish:async()=>({mode:'shadow',status:'restore_unavailable'})}}
  const collector=createYoutubeTmdbShadowCollector({cache:loaded.cache,sharedResponseCache})
  let healthy=true,finished=false
  const adapter={
    get(path,params){
      if(healthy&&!finished)try{collector.adapter.get(path,params)}catch{healthy=false}
      return null
    },
    recordFresh(path,params,response){
      if(healthy&&!finished)try{return collector.adapter.recordFresh(path,params,response)}catch{healthy=false}
      return false
    },
  }
  return {adapter,async finish(){
    if(finished)throw Error('YOUTUBE_SHADOW_SESSION_FINISHED')
    finished=true
    const counts=collector.counts()
    if(!healthy)return {...counts,status:'observation_unavailable'}
    if(counts.cache.recorded===0)return {...counts,status:'no_new_evidence'}
    try{
      await saveYoutubeTmdbCache(bucket,loaded.cache,{now,expectedGeneration:loaded.generation})
      return {...counts,status:'saved_verified'}
    }catch{return {...counts,status:'save_unavailable'}}
  }}
}
