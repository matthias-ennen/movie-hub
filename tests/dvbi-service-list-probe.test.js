import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {parseDvbiServiceList} from '../scripts/dvbi-service-list-probe.mjs'
const xml=readFileSync(new URL('./fixtures/dvbi-service-list-synthetic.xml',
  import.meta.url),'utf8')
describe('DVB-I #336 synthetic and offline ServiceList probe',()=>{
  it('extracts source identities and delivery signals without publishing routes',()=>{
    const p=parseDvbiServiceList(xml)
    expect(p).toMatchObject({kind:'moviehub-dvbi-a177-fixture-probe',
      productionApproved:false,serviceCount:2,epgEvents:0,
      verifiedPlaybackRoutes:0,publishedServices:0,playbackTargetsStored:0,
      streamUrlStored:false,networkRequests:0,sourceEnvelopePublished:false})
    expect(p.services[0]).toMatchObject({
      serviceId:'tag:example.test,2026:channel-alpha',name:'Demo A',
      deliveryKinds:['DASHDeliveryParameters'],targetCountries:['DEU'],
      hasLocatorSignal:true,hasContentGuideSignal:true})
    expect(p.services[1].deliveryKinds).toEqual(['DVBSDeliveryParameters'])
    expect(p.unknownElementNames).toContain('MysteryGuideSignal')
    expect(p.fieldDiscovery.summary.breaking).toBe(0)
    expect(p.fieldDiscovery.summary.review).toBe(0)
    const data=JSON.stringify(p)
    for(const secret of ['NEVER_PUBLISH_ME','.mpd','https://',
      'review-on-first-schema-discovery'])
      expect(data).not.toContain(secret)
  })
  it('fails closed on namespace confusion, duplicate identity, XXE and invalid XML',()=>{
    const samples=[
      xml.replace('urn:dvb:metadata:servicediscovery:2020','urn:other'),
      xml.replace('channel-beta','channel-alpha'),
      xml.replace('</ServiceList>',''),
      xml.replace('Demo B',''),
      '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY stolen SYSTEM "file:///etc/passwd">]>'+xml,
      '<ServiceList xmlns="urn:dvb:metadata:servicediscovery:2020"/>',
      xml+'x',
    ]
    for(const input of samples)
      expect(()=>parseDvbiServiceList(input)).toThrow('DVBI_FIXTURE_XML_NOT_TRUSTED')
  })
  it('bounds input and refuses arbitrary remote-source identity',()=>{
    expect(()=>parseDvbiServiceList(xml+' '.repeat(512000)))
      .toThrow('DVBI_FIXTURE_XML_NOT_TRUSTED')
    expect(()=>parseDvbiServiceList(xml,{source:'https://example.com'}))
      .toThrow('DVBI_FIXTURE_XML_NOT_TRUSTED')
  })
})
