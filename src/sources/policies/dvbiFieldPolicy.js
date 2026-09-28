import { FIELD_DECISIONS } from '../fieldDiscovery.js'

export const DVBI_SERVICE_FIELD_POLICY = Object.freeze({
  'uniqueIdentifier': { decision: FIELD_DECISIONS.CORE, reason: 'Stable DVB-I service identity.' },
  'version': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'dvbi' },
  'serviceNames': { decision: FIELD_DECISIONS.CORE, reason: 'Channel/service display name.' },
  'providerNames': { decision: FIELD_DECISIONS.CORE, reason: 'Source-declared provider identity.' },
  'lcn': { decision: FIELD_DECISIONS.CAPABILITY, capability: 'channelNumber', reason: 'Logical channel number from the service list.' },
  'contentGuideRefs': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'dvbi', reason: 'References DVB-I content-guide service identifiers.' },
  'instances': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'dvbi', reason: 'Delivery alternatives remain source-specific during the pilot.' },
})
