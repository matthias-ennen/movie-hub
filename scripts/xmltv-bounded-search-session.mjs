/**
 * #838 A2: bounded XMLTV exact-search session for the shared durable store.
 * This is a library only. No CLI, environment opt-in or Nightly activation.
 * The caller still decides identity and confirms a completed generation.
 */
import { WaipuTmdbSearchClient } from './waipu-tmdb-matcher.mjs'
import { xmltvExactTmdbSearchKey } from './shared-tmdb-g2n-private-response-replay.mjs'
import { sharedTmdbRequestPath } from './shared-tmdb-search-response-cache.mjs'
import { openOptionalSharedTmdbCapture, g2vPersistentObservation } from './shared-tmdb-adapter-capture-stage.mjs'

export const XMLTV_MAX_SEARCH_STARTS = 100

export async function openXmltvBoundedSearchSession({
  projectRoot, token, fetchImpl, now=Date.now(), runStartedAt,
  maxStarts=XMLTV_MAX_SEARCH_STARTS, paceMs=250, sleep,
}={}) {
  if (!Number.isSafeInteger(maxStarts) || maxStarts<1 || maxStarts>XMLTV_MAX_SEARCH_STARTS ||
      !Number.isSafeInteger(paceMs) || paceMs<250 || typeof fetchImpl!=='function' ||
      !String(token||'').trim()) throw new TypeError('Invalid bounded XMLTV search context')
  const session=await openOptionalSharedTmdbCapture({sourceId:'xmltv',enabled:true,
    projectRoot,now,runStartedAt,reuse:true,persistent:true})
  if (!session?.responseCache) throw new Error('XMLTV_SHARED_CACHE_NOT_AVAILABLE')
  const client=new WaipuTmdbSearchClient({token,language:'de-DE',maxRequests:maxStarts,
    paceMs,maxRetries:0,responseCache:session.responseCache,
    ...(sleep ? {sleep} : {}),
    fetchImpl:(url,options)=>fetchImpl(url,{...options,signal:AbortSignal.timeout(15000)})})
  const pending=new Map()
  let queue=Promise.resolve(),closed=false,transportFailure=false
  const counts={distinctKeys:0,repeatedKeys:0,invalidKeys:0,budgetMisses:0,failedRequests:0,stoppedMisses:0}
  return Object.freeze({
    lookup(row,type) {
      if(closed) throw new Error('XMLTV_SEARCH_SESSION_CLOSED')
      const key=xmltvExactTmdbSearchKey(row,type)
      if(!sharedTmdbRequestPath(key)){counts.invalidKeys++;return Promise.resolve(null)}
      if(pending.has(key)){counts.repeatedKeys++;return pending.get(key)}
      counts.distinctKeys++
      // Serialize new keys, including pacing; identical keys share the same promise.
      const task=queue.then(async()=>{
        if(transportFailure || client.requestsStarted>=maxStarts) {
          // Preserve read access even when the network budget is gone.
          const cached=session.responseCache.get(key)
          if(cached!==null) return cached
          if(transportFailure) counts.stoppedMisses++
          else counts.budgetMisses++
          return null
        }
        try { return await client.searchExactSharedResponse(key) }
        catch { counts.failedRequests++;transportFailure=true;return null }
      })
      pending.set(key,task)
      queue=task.then(()=>undefined)
      return task
    },
    counts(){return {...counts,requestsStarted:client.requestsStarted,...session.summary()}},
    async complete({sourceGenerationComplete=false}={}) {
      if(closed) throw new Error('XMLTV_SEARCH_SESSION_CLOSED')
      closed=true
      await queue
      const done=await session.complete({sourceGenerationComplete})
      return g2vPersistentObservation('xmltv',session,done,client.requestsStarted)
    },
  })
}
