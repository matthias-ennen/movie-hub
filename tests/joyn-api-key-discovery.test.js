import { describe, expect, it } from 'vitest'
import { extractJoynGraphqlApiKey } from '../scripts/joyn-adapter-diagnostic.mjs'

describe('Joyn public webclient GraphQL key discovery', () => {
  it('extracts x-api-key from public client text', () => {
    expect(extractJoynGraphqlApiKey('"x-api-key":"4f0fd9f18abbe3cf0e87fdb556bc39c8"'))
      .toBe('4f0fd9f18abbe3cf0e87fdb556bc39c8')
  })

  it('extracts camelCase client configuration', () => {
    expect(extractJoynGraphqlApiKey("xApiKey = '1234567890abcdef1234567890abcdef'"))
      .toBe('1234567890abcdef1234567890abcdef')
  })

  it('does not accept unrelated 32-character values', () => {
    expect(extractJoynGraphqlApiKey('assetHash="1234567890abcdef1234567890abcdef"'))
      .toBeNull()
  })
})
