import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Firebase workflow data separation', () => {
  it('reuses validated live TMDB data on ordinary pushes', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')

    expect(workflow).toContain('Restore validated live TMDB data for code deploy')
    expect(workflow).toContain("github.event_name == 'push' && !contains(github.event.head_commit.message, '[waipu-refresh]')")
    expect(workflow).toContain('run: npm run tmdb:restore')
    expect(workflow).not.toContain('Generate fresh TMDB catalog for code deploy')
    expect(workflow).not.toContain('id: push_catalog')
  })

  it('keeps live generation and personal metadata maintenance on data runs', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')

    expect(workflow).toContain('id: tmdb_catalog_strict')
    expect(workflow).toContain("github.event_name != 'push' || contains(github.event.head_commit.message, '[waipu-refresh]')")
    expect(workflow).toMatch(/name: Enrich personal Movie-Hub provider metadata[\s\S]*?if:.*github\.event_name != 'push'/)
  })
})
