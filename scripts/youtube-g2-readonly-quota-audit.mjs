/**
 * Google Cloud Service Usage quota metadata inspection for YouTube Data API.
 * No calls to YouTube, search.list, credential materialization into reports,
 * quota updates, Monitoring conclusions, or production data writes.
 * Only authentic caller inputs from an explicit read-only REST workflow.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

export const YT_SERVICE='youtube.googleapis.com'
const HTTP_CODES=new Set([0,200,400,401,403,404,429,500,502,503,504])
const safeString=(value,max=120)=>typeof value==='string'
  &&/^[A-Za-z0-9 _./:()%{}-]+$/.test(value)
  ?value.slice(0,max):null
const limitInt=(x)=>typeof x==='string'&&/^-?\d{1,20}$/.test(x)?x:null
const parsedResponse=(status,response)=>{
  if(!Number.isInteger(status)||!HTTP_CODES.has(status))
    throw Error('YOUTUBE_QUOTA_UNKNOWN_HTTP_STATUS')
  if(status===200&&(response===null||typeof response!=='object'
    ||Array.isArray(response)))throw Error('YOUTUBE_QUOTA_INVALID_RESPONSE')
  if(status!==200)return null
  return response
}
export function summarizeYoutubeQuotaMetadata({
  serviceHttp,serviceResponse,metricsHttp,metricsResponse,
  checkedAt=new Date().toISOString(),
}={}){
  if(!Number.isFinite(Date.parse(checkedAt)))throw Error('YOUTUBE_QUOTA_BAD_TIMESTAMP')
  const service=parsedResponse(serviceHttp,serviceResponse)
  const quotas=parsedResponse(metricsHttp,metricsResponse)
  const serviceState=service===null?'not-readable'
    :service.state==='ENABLED'?'enabled'
      :service.state==='DISABLED'?'disabled':'not-disclosed'
  if(service!==null&&service.name!==undefined
    &&!['projects/612913221205/services/youtube.googleapis.com',
      'projects/movie-hub-62459/services/youtube.googleapis.com'].includes(service.name))
    throw Error('YOUTUBE_QUOTA_SERVICE_IDENTITY_MISMATCH')
  const result={
    kind:'moviehub-youtube-g2-serviceusage-readonly-diagnostic',
    checkedAt,
    projectId:'movie-hub-62459',
    service:YT_SERVICE,
    serviceUsageHttp:serviceHttp,
    quotaMetadataHttp:metricsHttp,
    serviceState,
    quotaMetadataState:quotas===null?'not-readable'
      :!Array.isArray(quotas.metrics)?'missing-metrics'
        :quotas.nextPageToken?'incomplete-pagination':'readable',
    metricCount:0,limits:[],
    currentUsage:null,actualSearchCallsRemaining:null,
    perKeyRateLimit:null,rateLimit429RootCause:'not-established',
    futureSearchAutomaticallyPermitted:false,
    newYouTubeApiCalls:0,quotaChanges:0,firestoreWrites:0,
    privateArtifact:true,publicationPermitted:false,
  }
  if(quotas!==null&&quotas.metrics!==undefined&&!Array.isArray(quotas.metrics))
    throw Error('YOUTUBE_QUOTA_METRICS_MALFORMED')
  if(quotas!==null&&Array.isArray(quotas.metrics)){
    if(quotas.metrics.length>200)throw Error('YOUTUBE_QUOTA_TOO_MANY_METRICS')
    result.metricCount=quotas.metrics.length
    for(const metric of quotas.metrics){
      if(!metric||typeof metric!=='object'||Array.isArray(metric)
        ||!Array.isArray(metric.consumerQuotaLimits))
        throw Error('YOUTUBE_QUOTA_METRIC_SHAPE_INVALID')
      const metricName=safeString(metric.metric)
      if(!metricName||!metricName.startsWith('youtube.googleapis.com/'))
        throw Error('YOUTUBE_QUOTA_FOREIGN_METRIC')
      if(metric.consumerQuotaLimits.length>50)
        throw Error('YOUTUBE_QUOTA_EXCESSIVE_LIMITS')
      for(const lim of metric.consumerQuotaLimits){
        const unit=safeString(lim?.unit,160)
        if(!unit||!Array.isArray(lim.quotaBuckets)
          ||lim.quotaBuckets.length>50)
          throw Error('YOUTUBE_QUOTA_LIMIT_SHAPE_INVALID')
        for(const bucket of lim.quotaBuckets){
          const effectiveLimit=limitInt(bucket?.effectiveLimit)
          const defaultLimit=limitInt(bucket?.defaultLimit)
          if(effectiveLimit===null||defaultLimit===null
            ||bucket.dimensions&&
              (typeof bucket.dimensions!=='object'||Array.isArray(bucket.dimensions)))
            throw Error('YOUTUBE_QUOTA_BUCKET_INVALID')
          result.limits.push({
            metric:metricName,unit,
            effectiveLimit,defaultLimit,
            dimensioned:!!(bucket.dimensions
              &&Object.keys(bucket.dimensions).length),
            overridden:effectiveLimit!==defaultLimit,
          })
        }
      }
    }
  }
  return result
}
/**
 * Whitelisted effective search.list limit configuration only.
 * A configured ceiling is NOT remaining quota, a Pacific-day reservation,
 * proof of no external consumers, or automatic 95-call approval.
 * Never emit unfiltered Google quota labels, dimensions or credentials.
 */
export function configuredSearchLimitReadback(audit){
  if(audit?.kind!=='moviehub-youtube-g2-serviceusage-readonly-diagnostic'
    ||audit.projectId!=='movie-hub-62459'
    ||audit.service!==YT_SERVICE
    ||audit.currentUsage!==null
    ||audit.actualSearchCallsRemaining!==null
    ||audit.futureSearchAutomaticallyPermitted!==false
    ||audit.newYouTubeApiCalls!==0||audit.quotaChanges!==0
    ||audit.firestoreWrites!==0||audit.publicationPermitted!==false
    ||!Array.isArray(audit.limits)||audit.limits.length>10000)
    throw Error('YOUTUBE_SEARCH_CONFIG_READBACK_UNTRUSTED')
  const readable=audit.serviceUsageHttp===200
    &&audit.quotaMetadataHttp===200
    &&audit.serviceState==='enabled'
    &&audit.quotaMetadataState==='readable'
  const rows=[]
  if(readable){
    for(const lim of audit.limits){
      if(lim?.metric!=='youtube.googleapis.com/search_list')continue
      if(!safeString(lim.unit,160)
        ||limitInt(lim.effectiveLimit)===null
        ||limitInt(lim.defaultLimit)===null
        ||typeof lim.dimensioned!=='boolean'
        ||typeof lim.overridden!=='boolean'
        ||lim.overridden!==(lim.effectiveLimit!==lim.defaultLimit))
        throw Error('YOUTUBE_SEARCH_CONFIG_LIMIT_INVALID')
      rows.push({
        unit:lim.unit,effectiveLimit:lim.effectiveLimit,
        defaultLimit:lim.defaultLimit,
        dimensioned:lim.dimensioned,overridden:lim.overridden,
      })
    }
  }
  return {
    kind:'moviehub-youtube-search-config-readonly-v1',
    projectId:'movie-hub-62459',service:YT_SERVICE,
    configurationComplete:readable&&rows.length>0,
    visibleSearchLimitBuckets:rows.length,searchLimits:rows,
    actualSearchCallsRemaining:null,actualPacificDayUsage:null,
    allExternalConsumersVerified:false,authorizedSearchCalls:0,
    futureSearchAutomaticallyPermitted:false,
    quotaChanges:0,youtubeApiCalls:0,publicationPermitted:false,
  }
}

export function quotaAuditMarkdown(result){
  if(result?.kind!=='moviehub-youtube-g2-serviceusage-readonly-diagnostic'
    ||result.projectId!=='movie-hub-62459'
    ||result.service!==YT_SERVICE
    ||result.newYouTubeApiCalls!==0||result.quotaChanges!==0
    ||result.firestoreWrites!==0||result.publicationPermitted!==false
    ||result.currentUsage!==null||result.actualSearchCallsRemaining!==null
    ||result.futureSearchAutomaticallyPermitted!==false
    ||result.rateLimit429RootCause!=='not-established')
    throw Error('YOUTUBE_QUOTA_REPORT_UNSAFE')
  return [
    '# MovieHub – YouTube Data API: Google-Cloud-Quotadaten (rein lesend)',
    '',
    '- Google-Cloud-Projekt: '+result.projectId,
    '- Google-Cloud-Dienst: '+result.service,
    '- Pruefzeitpunkt: '+result.checkedAt,
    '- Service-Status HTTP: '+result.serviceUsageHttp+'; Dienst: '+result.serviceState,
    '- Service-Usage-Quota-Metadaten HTTP: '+result.quotaMetadataHttp,
    '- Lesestatus: '+result.quotaMetadataState,
    '- Sichtbare Metriken: '+result.metricCount+'; sichtbare Limit-Buckets: '+result.limits.length,
    '- **Wichtig:** Konfigurierte Limitwerte sind keine tatsaechliche API-Nutzung.',
    '- Aktuell verbrauchte Einheiten, pro-Key-Limit, Restkontingent und Ursache der Google-429-Sperre: **nicht nachgewiesen**.',
    '- Google Console: https://console.cloud.google.com/iam-admin/quotas?project=movie-hub-62459',
    '- **0 YouTube-API-Aufrufe, 0 Quota-Aenderungen, 0 produktive Writes, 0 neue Linkfreigaben.**',
    '',
    '| Google Quota-Metrik | Einheit | Eff. Limit | Default | Dimensions-Subset | Override? |',
    '| --- | --- | ---: | ---: | --- | --- |',
    ...result.limits.map(x=>'| '+x.metric+' | '+x.unit+
      ' | '+x.effectiveLimit+' | '+x.defaultLimit+
      ' | '+(x.dimensioned?'ja':'nein')+' | '+(x.overridden?'ja':'nein')+' |'),
    '',
  ].join('\n')
}
export async function writeQuotaAudit({
  serviceHttp,servicePath,metricsHttp,metricsPath,output,
}={}){
  if(process.env.YOUTUBE_G2_WRITE_MODE||!output||!servicePath||!metricsPath)
    throw Error('YOUTUBE_QUOTA_READONLY_INPUTS_REQUIRED')
  const response=async(code,path)=>{
    if(Number(code)!==200)return null
    return JSON.parse(await readFile(path,'utf8'))
  }
  const result=summarizeYoutubeQuotaMetadata({
    serviceHttp:Number(serviceHttp),
    metricsHttp:Number(metricsHttp),
    serviceResponse:await response(serviceHttp,servicePath),
    metricsResponse:await response(metricsHttp,metricsPath),
  })
  await mkdir(output,{recursive:true})
  await Promise.all([
    writeFile(output+'/summary.json',JSON.stringify(result,null,2)+'\n',{mode:0o600}),
    writeFile(output+'/report.md',quotaAuditMarkdown(result)+'\n',{mode:0o600}),
  ])
  console.log(JSON.stringify({
    kind:result.kind,checkedAt:result.checkedAt,
    serviceUsageHttp:result.serviceUsageHttp,quotaMetadataHttp:result.quotaMetadataHttp,
    serviceState:result.serviceState,quotaMetadataState:result.quotaMetadataState,
    metricCount:result.metricCount,limitBuckets:result.limits.length,
    currentUsage:result.currentUsage,
    rateLimit429RootCause:result.rateLimit429RootCause,
    newYouTubeApiCalls:result.newYouTubeApiCalls,quotaChanges:result.quotaChanges,
  }))
  return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  writeQuotaAudit({
    serviceHttp:process.argv[2],servicePath:process.argv[3],
    metricsHttp:process.argv[4],metricsPath:process.argv[5],output:process.argv[6],
  }).catch(e=>{console.error('YOUTUBE_QUOTA_READONLY_FAIL_CLOSED: '+e.message);process.exitCode=1})
}
