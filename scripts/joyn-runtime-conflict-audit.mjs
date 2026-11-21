/** Aggregate-only quality signal. A short slot can be a split film; do not
 * invalidate cached matches or change an airing, even on severe conflicts. */
import { exactTitleKey } from './tmdb-title-evidence.mjs'

const gapToleranceMs=5*60_000
const validId=value=>Number.isSafeInteger(value)&&value>0
const descriptionKey=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('de').replace(/\s+/g,' ').trim()

export function auditJoynMovieRuntime({envelope,titles,programDiagnostics=new Map(),onSevereRow}={}) {
  if(envelope?.sourceId!=='joyn'||envelope.sourceStatus!=='healthy'||!Array.isArray(envelope.records)||envelope.records.length>200000||
    !Array.isArray(titles)||titles.length>100000||!(programDiagnostics instanceof Map))return {status:'unavailable'}
  const runtimes=new Map()
  for(const entry of titles) {
    if(entry?.type!=='movie')continue
    if(!validId(entry.tmdbId)||runtimes.has(entry.tmdbId))return {status:'unavailable'}
    const runtime=entry.runtimeMinutes
    runtimes.set(entry.tmdbId,typeof runtime==='number'&&Number.isFinite(runtime)&&runtime>0?runtime:null)
  }
  const counts={status:'ready',movieAirings:0,runtimeKnown:0,runtimeMissing:0,invalidSlot:0,overrun5Minutes:0,
    severeRuntimeConflict:0,severeDistinctWorks:0,possibleAdjacentSplitAirings:0,recurringDistinctDescriptionAirings:0,
    severeByOriginalMatchSource:{local:0,searchAssisted:0,otherOrUnavailable:0}}
  const byStationWork=new Map(),severeWorks=new Set(),severeRows=[]
  for(const event of envelope.records) {
    if(event?.titleRef?.mediaType!=='movie')continue
    counts.movieAirings++
    const id=event.titleRef.tmdbId
    if(!runtimes.has(id))return {status:'unavailable'}
    const runtime=runtimes.get(id)
    if(runtime===null){counts.runtimeMissing++;continue}
    counts.runtimeKnown++
    const start=Date.parse(event.startAt),end=Date.parse(event.endAt),duration=(end-start)/60_000
    if(!Number.isFinite(duration)||duration<=0){counts.invalidSlot++;continue}
    if(runtime-duration>5)counts.overrun5Minutes++
    const source=event.extensions?.joyn??{},station=event.channelId,title=exactTitleKey(source.rawTitle)
    const row={start,end,duration,runtime,description:descriptionKey(source.description),title,station,id,severe:false,possibleSplit:false,event}
    if(runtime>=60&&duration<=runtime/2&&runtime-duration>=30) {
      row.severe=true;severeRows.push(row);severeWorks.add(id)
      counts.severeRuntimeConflict++
      const origin=programDiagnostics.get(source.programId)?.decision?.source
      counts.severeByOriginalMatchSource[origin==='local'?'local':String(origin??'').includes('local+tmdb-search')?'searchAssisted':'otherOrUnavailable']++
    }
    if(typeof station==='string'&&station&&title) {
      const key=JSON.stringify([station,id,title]);if(!byStationWork.has(key))byStationWork.set(key,[])
      byStationWork.get(key).push(row)
    }
  }
  for(const rows of byStationWork.values()) {
    rows.sort((a,b)=>a.start-b.start||a.end-b.end)
    // Only flag a possible split: exact same work and source title, adjacent
    // non-overlapping slots whose combined duration could contain the film.
    for(let i=0;i<rows.length;i++) {
      let sum=rows[i].duration
      for(let k=i+1;k<Math.min(i+4,rows.length);k++) {
        const gap=rows[k].start-rows[k-1].end
        if(gap<0||gap>gapToleranceMs)break
        sum+=rows[k].duration
        if(sum>=rows[i].runtime-5)for(let n=i;n<=k;n++)rows[n].possibleSplit=true
      }
    }
    const recurring=rows.filter(row=>row.severe&&!row.possibleSplit&&row.description.length>=40)
    if(new Set(recurring.map(row=>row.description)).size>=3)counts.recurringDistinctDescriptionAirings+=recurring.length
  }
  counts.possibleAdjacentSplitAirings=severeRows.filter(row=>row.possibleSplit).length
  counts.severeDistinctWorks=severeWorks.size
  if(typeof onSevereRow==='function')for(const row of severeRows)onSevereRow(row.event,row.possibleSplit)
  return counts
}
