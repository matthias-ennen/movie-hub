import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Firebase workflow data separation', () => {
  it('keeps the Joyn first-build reserve limited to explicitly marked pushes', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')
    const expressions = [...workflow.matchAll(/JOYN_(ALGOLIA|SERIES_DETAIL)_REQUEST_BUDGET:\s*\$\{\{\s*([^\n]+?)\s*\}\}/g)]
    expect(expressions).toHaveLength(2)
    for (const [, kind, expression] of expressions) {
      const evaluate = (event, message) => Function('github', 'contains', 'return ' + expression)(
        { event_name: event, event: { head_commit: { message } } },
        (text, value) => text.includes(value),
      )
      const regular = kind === 'ALGOLIA' ? '3600' : '100'
      const bootstrap = kind === 'ALGOLIA' ? '18000' : '500'
      expect(evaluate('schedule', '[joyn-refresh] [joyn-bootstrap]')).toBe(regular)
      expect(evaluate('push', '[joyn-refresh]')).toBe(regular)
      expect(evaluate('push', '[joyn-refresh] [joyn-bootstrap]')).toBe(bootstrap)
    }
  })

  it('reuses validated live TMDB data on ordinary pushes', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')

    expect(workflow).toContain('Restore validated live TMDB data for code deploy')
    expect(workflow).toContain("github.event_name == 'push' && !contains(github.event.head_commit.message, '[waipu-refresh]')")
    expect(workflow).toContain('run: npm run tmdb:restore')
    expect(workflow).not.toContain('Generate fresh TMDB catalog for code deploy')
    expect(workflow).not.toContain('id: push_catalog')
  })

  it('keeps live generation and the canonical executor on data runs', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')

    expect(workflow).toContain('id: tmdb_catalog_strict')
    expect(workflow).toContain("github.event_name != 'push' || contains(github.event.head_commit.message, '[waipu-refresh]')")
    expect(workflow).toMatch(/name: Execute canonical title priority queue[\s\S]*?if:.*github\.event_name != 'push'/)
    expect(workflow).toContain('run: npm run title:priority:execute')
    expect(workflow).not.toContain('name: Enrich personal Movie-Hub provider metadata')
    expect(workflow).not.toContain('name: Enrich personal TMDB catalog metadata')
  })
})
