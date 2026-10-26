/** Synthetic DVB-I A177 service-list probe, no network or publication. */
import {SaxesParser} from 'saxes'
import {inspectSourceSchema,FIELD_DECISIONS} from '../src/sources/fieldDiscovery.js'
const NS=new Set(['urn:dvb:metadata:servicediscovery:2020','urn:dvb:metadata:servicediscovery:2019'])
const DELIVERIES=new Set(['DASHDeliveryParameters','HLSDeliveryParameters',
  'DVBTDeliveryParameters','DVBSDeliveryParameters','DVBCDeliveryParameters',
  'MulticastTSDeliveryParameters','ApplicationDeliveryParameters'])
const KNOWN=new Set(['ServiceList','Name','ProviderName','Service','ServiceName',
  'UniqueIdentifier','ServiceInstance','LCNTableList','LCNTable','LCN',
  'UriBasedLocation','URI','DVBTriplet','TargetCountry','ServiceType',
  'RelatedMaterial','HowRelated','MediaLocator','ContentGuide',
  'ContentGuideServiceRef','ContentGuideSource','ContentProtection',
  'Availability','TargetRegion','RegionList','Logo','ServiceDescription',
  'Language',...DELIVERIES])
const fail=()=>{throw Error('DVBI_FIXTURE_XML_NOT_TRUSTED')}
const trimmed=s=>String(s||'').trim().replace(/\s+/g,' ').slice(0,140)
export function parseDvbiServiceList(xml,{source='synthetic-fixture'}={}){
  if(typeof xml!=='string'||Buffer.byteLength(xml)>512000
    ||!/^[a-z][a-z-]{0,39}$/.test(source)
    ||/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml))fail()
  const parser=new SaxesParser({xmlns:true}),stack=[],services=[],unknown=new Set()
  let current=null,instance=null,listName=null,rootSeen=false
  parser.on('opentag',tag=>{
    const name=tag.local
    if(stack.length>=32||!/^[A-Za-z][A-Za-z0-9-]{0,39}$/.test(name))fail()
    if(!stack.length){
      if(rootSeen||name!=='ServiceList'||!NS.has(tag.uri))fail()
      rootSeen=true
    }
    stack.push({name,uri:tag.uri,text:''})
    if(!KNOWN.has(name)&&unknown.size<100)unknown.add(name)
    if(name==='Service'&&stack.length===2){
      if(current||services.length>=250)fail()
      current={serviceId:null,name:null,provider:null,serviceInstanceCount:0,
        deliveryKinds:[],targetCountries:[],hasLocatorSignal:false,
        hasContentGuideSignal:false,hasDrmSignal:false}
    }
    if(name==='ServiceInstance'&&current&&stack.length===3){
      if(instance)fail()
      instance={kinds:new Set(),countries:new Set(),locator:false}
    }
    if(instance&&DELIVERIES.has(name))instance.kinds.add(name)
    if(instance&&name==='UriBasedLocation')instance.locator=true
    if(current&&name.startsWith('ContentGuide'))current.hasContentGuideSignal=true
    if(current&&name==='ContentProtection')current.hasDrmSignal=true
  })
  parser.on('text',part=>{
    const n=stack.at(-1)
    // URI elements are never read or buffered; credentials remain in input.
    if(n&&['Name','ServiceName','ProviderName','UniqueIdentifier','TargetCountry'].includes(n.name)){
      if(n.text.length+part.length>300)fail()
      n.text+=part
    }
  })
  parser.on('closetag',()=>{
    const n=stack.pop(),parent=stack.at(-1)?.name
    if(!n)fail()
    const value=trimmed(n.text)
    if(current&&parent==='Service'){
      if(n.name==='UniqueIdentifier')current.serviceId=value
      if(n.name==='ServiceName')current.name=value
      if(n.name==='ProviderName')current.provider=value||null
    }
    if(n.name==='TargetCountry'&&instance&&/^[A-Za-z]{2,3}$/.test(value))
      instance.countries.add(value.toUpperCase())
    if(n.name==='Name'&&parent==='ServiceList')listName=value
    if(n.name==='ServiceInstance'&&current&&instance){
      current.serviceInstanceCount++
      for(const kind of instance.kinds)if(!current.deliveryKinds.includes(kind))
        current.deliveryKinds.push(kind)
      for(const country of instance.countries)
        if(!current.targetCountries.includes(country))current.targetCountries.push(country)
      current.hasLocatorSignal ||= instance.locator
      instance=null
    }
    if(n.name==='Service'&&current){
      if(!current.serviceId||!current.name||!current.serviceInstanceCount
        ||services.some(e=>e.serviceId===current.serviceId))fail()
      services.push(current);current=null
    }
  })
  parser.on('error',fail)
  try{parser.write(xml).close()}catch{fail()}
  if(!rootSeen||stack.length||current||instance||!services.length)fail()
  const policy=Object.fromEntries(['serviceId','name','provider','serviceInstanceCount',
    'deliveryKinds','targetCountries','hasLocatorSignal',
    'hasContentGuideSignal','hasDrmSignal']
    .map(k=>[k,{decision:FIELD_DECISIONS.CORE}]))
  const fieldDiscovery=inspectSourceSchema(services,{
    sourceId:'dvbi-'+source,policy,
  })
  return {kind:'moviehub-dvbi-a177-fixture-probe',productionApproved:false,
    source,serviceListName:listName,serviceCount:services.length,
    services,fieldDiscovery,unknownElementNames:[...unknown].sort(),
    epgEvents:0,verifiedPlaybackRoutes:0,publishedServices:0,
    playbackTargetsStored:0,streamUrlStored:false,
    sourceEnvelopePublished:false,networkRequests:0}
}
