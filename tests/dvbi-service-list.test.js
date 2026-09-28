import { describe, expect, it } from 'vitest'
import { inspectSourceSchema } from '../src/sources/fieldDiscovery.js'
import { DVBI_SERVICE_FIELD_POLICY } from '../src/sources/policies/dvbiFieldPolicy.js'
import { dvbiPlaybackCandidates, parseDvbiServiceListXml } from '../src/sources/dvbi/dvbiServiceList.js'

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<ServiceList xml:lang="de" version="8" id="tag:movie-hub.test,2026:dvbi"
  xmlns="urn:dvb:metadata:servicediscovery:2026"
  xmlns:dvbi-types="urn:dvb:metadata:servicediscovery-types:2026">
  <Name>Movie Hub DVB-I Test</Name>
  <ProviderName>Fixture Provider</ProviderName>
  <LCNTableList>
    <LCNTable version="1">
      <LCN channelNumber="4" serviceRef="tag:movie-hub.test,2026:service-1"/>
    </LCNTable>
  </LCNTableList>
  <ContentGuideSource CGSID="cg-1">
    <ProviderName>Fixture Guide</ProviderName>
    <ScheduleInfoEndpoint contentType="application/xml">
      <dvbi-types:URI>https://example.invalid/schedule</dvbi-types:URI>
    </ScheduleInfoEndpoint>
    <ProgramInfoEndpoint contentType="application/xml">
      <dvbi-types:URI>https://example.invalid/program</dvbi-types:URI>
    </ProgramInfoEndpoint>
  </ContentGuideSource>
  <Service version="1">
    <UniqueIdentifier>tag:movie-hub.test,2026:service-1</UniqueIdentifier>
    <ServiceInstance priority="1">
      <DASHDeliveryParameters>
        <UriBasedLocation contentType="application/dash+xml">
          <dvbi-types:URI>https://example.invalid/live/manifest.mpd</dvbi-types:URI>
        </UriBasedLocation>
        <TargetCountry>DEU</TargetCountry>
      </DASHDeliveryParameters>
    </ServiceInstance>
    <ServiceName>Testkanal</ServiceName>
    <ProviderName>Fixture Provider</ProviderName>
    <ContentGuideServiceRef>cg-1</ContentGuideServiceRef>
  </Service>
</ServiceList>`

describe('DVB-I service-list pilot', () => {
  it('parses services, LCNs, content-guide endpoints and DASH delivery', () => {
    const parsed = parseDvbiServiceListXml(fixture)

    expect(parsed.metrics).toEqual({
      serviceCount: 1,
      contentGuideCount: 1,
      dashServiceCount: 1,
      servicesWithLcn: 1,
    })
    expect(parsed.serviceList).toMatchObject({
      id: 'tag:movie-hub.test,2026:dvbi',
      version: '8',
      name: 'Movie Hub DVB-I Test',
      providerName: 'Fixture Provider',
    })
    expect(parsed.serviceList.contentGuides[0]).toMatchObject({
      id: 'cg-1',
      providerName: 'Fixture Guide',
      scheduleInfoEndpoint: 'https://example.invalid/schedule',
      programInfoEndpoint: 'https://example.invalid/program',
    })
    expect(parsed.serviceList.services[0]).toMatchObject({
      uniqueIdentifier: 'tag:movie-hub.test,2026:service-1',
      lcn: 4,
      serviceNames: ['Testkanal'],
      providerNames: ['Fixture Provider'],
      contentGuideRefs: ['cg-1'],
      instances: [{
        priority: 1,
        deliveryType: 'dvb-dash',
        contentType: 'application/dash+xml',
        uri: 'https://example.invalid/live/manifest.mpd',
        targetCountry: 'DEU',
      }],
    })
  })

  it('projects DVB-DASH service instances as direct-stream candidates without publishing them', () => {
    const candidates = dvbiPlaybackCandidates(parseDvbiServiceListXml(fixture))
    expect(candidates).toEqual([expect.objectContaining({
      serviceId: 'tag:movie-hub.test,2026:service-1',
      serviceName: 'Testkanal',
      lcn: 4,
      mode: 'DIRECT_STREAM',
      streamFormat: 'DVB-DASH',
      target: 'https://example.invalid/live/manifest.mpd',
      targetCountry: 'DEU',
    })])
  })

  it('feeds normalized service fields through field discovery', () => {
    const parsed = parseDvbiServiceListXml(fixture)
    const report = inspectSourceSchema(parsed.serviceList.services, {
      sourceId: 'dvbi-service-list',
      policy: DVBI_SERVICE_FIELD_POLICY,
    })

    expect(report.summary.breaking).toBe(0)
    expect(report.fields.find((field) => field.path === 'uniqueIdentifier'))
      .toMatchObject({ severity: 'INFO', status: 'core' })
    expect(report.fields.find((field) => field.path === 'instances.uri'))
      .toMatchObject({ severity: 'INFO', status: 'extension', extensionNamespace: 'dvbi' })
  })

  it('rejects malformed or empty service lists', () => {
    expect(() => parseDvbiServiceListXml('')).toThrow(/XML is required/)
    expect(() => parseDvbiServiceListXml('<ServiceList id="x"></ServiceList>'))
      .toThrow(/contains no services/)
  })
})
