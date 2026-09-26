import { FIELD_DECISIONS } from '../fieldDiscovery.js'

export const JOYN_EPG_UPSTREAM_FIELD_POLICY = Object.freeze({
  'liveStreams': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.id': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.title': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.type': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'joyn' },
  'liveStreams.quality': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'joyn' },
  'liveStreams.logo': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'joyn' },
  'liveStreams.logo.url': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'joyn' },
  'liveStreams.brand': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'joyn' },
  'liveStreams.brand.brand_id': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents.startDate': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents.endDate': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents.program': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents.program.id': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents.program.title': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents.program.startDate': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents.program.endDate': { decision: FIELD_DECISIONS.CORE },
  'liveStreams.epgEvents.program.__typename': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'joyn' },
})
