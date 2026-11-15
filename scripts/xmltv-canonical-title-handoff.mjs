/** #336: confirmed XMLTV identities enter the existing canonical title queue.
 * No raw EPG fields, new matcher, network requests or persistent writes.
 * The caller decides whether to execute the queue; G2w only counts demand. */
import { createXmltvAirRouteRegistry, XMLTV_AIR_DEVICE_APPROVALS } from '../src/sources/xmltv/xmltvAirRoutes.js'
import { buildTitleCandidateInventory, canonicalTitleIdentity } from './build-title-candidate-inventory.mjs'
import { buildTitlePriorityPreview } from './build-title-priority-preview.mjs'

export function deriveXmltvCanonicalTitleRefs(events, {now=Date.now()}={}) {
  if (!Array.isArray(events)||events.length>20000||!Number.isFinite(now)) throw new TypeError('Invalid XMLTV title handoff')
  const registry=createXmltvAirRouteRegistry({deviceReceipts:XMLTV_AIR_DEVICE_APPROVALS,now})
  const unique=new Map()
  for (const event of events) {
    const start=Date.parse(event?.startAt), end=Date.parse(event?.endAt)
    if (!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end<=now||start>=now+14*86400000) continue
    if (registry.fieldsForEvent(event).providerIds.length!==1) continue
    const identity=canonicalTitleIdentity(event.titleRef)
    if (!identity||!Number.isSafeInteger(identity.tmdbId)) continue
    const {key,type,tmdbId}=identity
    unique.set(key,{type,tmdbId})
  }
  return [...unique.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,ref])=>ref)
}

/** Actual central queue on just the missing, approved identities and current
 * Waipu/Joyn metadata. Private preview is conservative: the later canonical
 * executor also has restored search shards and personal canonical copies. */
export function prepareXmltvCanonicalTitleDemand(events,catalog,{now=Date.now(),existingSources=[]}={}) {
  if (!Array.isArray(catalog?.titles)||!Array.isArray(existingSources)) throw new TypeError('Invalid XMLTV catalogue context')
  const approved=deriveXmltvCanonicalTitleRefs(events,{now})
  const available=new Set(catalog.titles.filter(x=>x?.source==='tmdb'&&typeof x.title==='string'&&x.title.trim())
    .map(x=>canonicalTitleIdentity(x)?.key).filter(Boolean))
  const missing=approved.filter(x=>!available.has(canonicalTitleIdentity(x).key))
  const missingKeys=new Set(missing.map(x=>canonicalTitleIdentity(x).key))
  const relevant=(providerId)=>({entries:(existingSources.find(s=>s.providerId===providerId)?.entries??[])
    .filter(x=>x?.source==='tmdb'&&missingKeys.has(canonicalTitleIdentity(x)?.key))})
  const generatedAt=new Date(now).toISOString()
  const inventory=buildTitleCandidateInventory({xmltvApprovedTitles:missing,
    waipuTitles:relevant('waipu'),joynTitles:relevant('joyn'),generatedAt})
  const preview=buildTitlePriorityPreview({inventory,capacity:missing.length,generatedAt})
  // Every missing approved title must be queued exactly once; no guesses.
  if(preview.counts.queued!==missing.length||preview.counts.duplicateQueueEntries!==0) throw new Error('XMLTV_CANONICAL_QUEUE_PARITY')
  return {approvedUniqueTitles:approved.length,missingApprovedUniqueTitles:missing.length,
    reusableFromCurrentSources:preview.counts.reusableCanonical,
    fetchNeededFromCurrentSources:preview.counts.fetchRequired}
}
