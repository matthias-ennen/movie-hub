import { SaxesParser } from 'saxes'

function valueOfAttribute(tag, localName) {
  for (const attribute of Object.values(tag?.attributes || {})) {
    if (attribute?.local === localName || attribute?.name === localName) return attribute.value
  }
  return null
}

function trimmed(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function parseDvbiServiceListXml(xml) {
  if (!String(xml || '').trim()) throw new TypeError('DVB-I service list XML is required.')

  const parser = new SaxesParser({ xmlns: true })
  const stack = []
  const textStack = []
  const lcnByService = new Map()
  const services = []
  const contentGuides = []

  let serviceList = {
    id: null,
    version: null,
    language: null,
    name: null,
    providerName: null,
    services,
    contentGuides,
  }
  let currentService = null
  let currentInstance = null
  let currentGuide = null

  const pathHas = (local) => stack.some((entry) => entry === local)
  const parent = () => stack[stack.length - 2] || null

  parser.on('opentag', (tag) => {
    const local = tag.local || tag.name
    stack.push(local)
    textStack.push('')

    if (local === 'ServiceList') {
      serviceList = {
        ...serviceList,
        id: valueOfAttribute(tag, 'id'),
        version: valueOfAttribute(tag, 'version'),
        language: valueOfAttribute(tag, 'lang'),
      }
    } else if (local === 'LCN') {
      const serviceRef = valueOfAttribute(tag, 'serviceRef')
      const channelNumber = numberOrNull(valueOfAttribute(tag, 'channelNumber'))
      if (serviceRef && channelNumber !== null) lcnByService.set(serviceRef, channelNumber)
    } else if (local === 'ContentGuideSource') {
      currentGuide = {
        id: valueOfAttribute(tag, 'CGSID'),
        providerName: null,
        scheduleInfoEndpoint: null,
        programInfoEndpoint: null,
        moreEpisodesEndpoint: null,
      }
    } else if (local === 'Service') {
      currentService = {
        uniqueIdentifier: null,
        version: valueOfAttribute(tag, 'version'),
        serviceNames: [],
        providerNames: [],
        lcn: null,
        contentGuideRefs: [],
        instances: [],
      }
    } else if (local === 'ServiceInstance' && currentService) {
      currentInstance = {
        priority: numberOrNull(valueOfAttribute(tag, 'priority')),
        deliveryType: null,
        contentType: null,
        uri: null,
        targetCountry: null,
      }
    } else if (currentInstance) {
      if (local === 'DASHDeliveryParameters') currentInstance.deliveryType = 'dvb-dash'
      if (local === 'DVBTDeliveryParameters') currentInstance.deliveryType = 'dvb-t'
      if (local === 'DVBSDeliveryParameters') currentInstance.deliveryType = 'dvb-s'
      if (local === 'DVBCDeliveryParameters') currentInstance.deliveryType = 'dvb-c'
      if (local === 'SATIPDeliveryParameters') currentInstance.deliveryType = currentInstance.deliveryType || 'satip'
      if (local === 'UriBasedLocation') {
        currentInstance.contentType = valueOfAttribute(tag, 'contentType')
      }
    }
  })

  parser.on('text', (value) => {
    if (!textStack.length) return
    textStack[textStack.length - 1] += value
  })

  parser.on('closetag', (tag) => {
    const local = tag.local || tag.name
    const value = trimmed(textStack[textStack.length - 1])

    if (local === 'Name' && !currentService && !currentGuide && stack.length === 2) {
      serviceList.name = value
    } else if (local === 'ProviderName') {
      if (currentGuide && pathHas('ContentGuideSource')) currentGuide.providerName = value
      else if (currentService) currentService.providerNames.push(value)
      else if (stack.length === 2) serviceList.providerName = value
    } else if (currentService && local === 'UniqueIdentifier') {
      currentService.uniqueIdentifier = value
    } else if (currentService && local === 'ServiceName') {
      currentService.serviceNames.push(value)
    } else if (currentService && local === 'ContentGuideServiceRef') {
      currentService.contentGuideRefs.push(value)
    } else if (currentInstance && local === 'TargetCountry') {
      currentInstance.targetCountry = value
    } else if (local === 'URI' && value) {
      const p = parent()
      if (currentInstance && p === 'UriBasedLocation') currentInstance.uri = value
      else if (currentGuide && p === 'ScheduleInfoEndpoint') currentGuide.scheduleInfoEndpoint = value
      else if (currentGuide && p === 'ProgramInfoEndpoint') currentGuide.programInfoEndpoint = value
      else if (currentGuide && p === 'MoreEpisodesEndpoint') currentGuide.moreEpisodesEndpoint = value
    } else if (local === 'ServiceInstance' && currentService && currentInstance) {
      currentService.instances.push(currentInstance)
      currentInstance = null
    } else if (local === 'Service' && currentService) {
      currentService.serviceNames = currentService.serviceNames.filter(Boolean)
      currentService.providerNames = currentService.providerNames.filter(Boolean)
      currentService.contentGuideRefs = currentService.contentGuideRefs.filter(Boolean)
      currentService.lcn = lcnByService.get(currentService.uniqueIdentifier) ?? null
      services.push(currentService)
      currentService = null
    } else if (local === 'ContentGuideSource' && currentGuide) {
      contentGuides.push(currentGuide)
      currentGuide = null
    }

    stack.pop()
    textStack.pop()
  })

  parser.on('error', (error) => {
    throw error
  })

  parser.write(String(xml)).close()

  if (!serviceList.id) throw new TypeError('DVB-I ServiceList.id is required.')
  if (!services.length) throw new TypeError('DVB-I service list contains no services.')

  return {
    schemaVersion: 1,
    kind: 'dvbi-service-list-probe',
    serviceList,
    metrics: {
      serviceCount: services.length,
      contentGuideCount: contentGuides.length,
      dashServiceCount: services.filter((service) => service.instances.some((instance) => instance.deliveryType === 'dvb-dash')).length,
      servicesWithLcn: services.filter((service) => Number.isFinite(service.lcn)).length,
    },
  }
}

export function dvbiPlaybackCandidates(parsed) {
  const services = parsed?.serviceList?.services || []
  return services.flatMap((service) => service.instances
    .filter((instance) => instance.deliveryType === 'dvb-dash' && instance.uri)
    .map((instance) => ({
      serviceId: service.uniqueIdentifier,
      serviceName: service.serviceNames[0] || service.uniqueIdentifier,
      providerName: service.providerNames[0] || parsed?.serviceList?.providerName || null,
      lcn: service.lcn,
      mode: 'DIRECT_STREAM',
      streamFormat: 'DVB-DASH',
      target: instance.uri,
      contentType: instance.contentType || 'application/dash+xml',
      targetCountry: instance.targetCountry,
      priority: instance.priority,
    })))
}
