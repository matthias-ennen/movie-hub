import { describe, expect, it } from 'vitest'
import { buildFieldDiscoveryMarkdown } from '../src/sources/fieldDiscoveryReport.js'

describe('field discovery report', () => {
  it('renders breaking and review items compactly for human review', () => {
    const markdown = buildFieldDiscoveryMarkdown({
      sourceId: 'waipu',
      generatedAt: '2026-09-26T10:00:00.000Z',
      summary: { breaking: 1, review: 1, info: 0 },
      fields: [
        {
          path: 'programId',
          severity: 'BREAKING',
          status: 'type-changed',
          decision: 'extension',
          types: ['object'],
        },
        {
          path: 'audioTracks',
          severity: 'REVIEW',
          status: 'new',
          decision: 'review',
          types: ['array'],
          reason: 'Potential subtitle/audio capability.',
        },
      ],
    })

    expect(markdown).toContain('# Source schema report – waipu')
    expect(markdown).toContain('BREAKING: 1')
    expect(markdown).toContain('`programId`')
    expect(markdown).toContain('`audioTracks`')
    expect(markdown).toContain('Potential subtitle/audio capability.')
  })
})