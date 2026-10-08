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

  it('isolates personal alert failures from confirmed publication and saved checkpoints', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')
    const checkpoint = workflow.indexOf('name: Commit successful TMDB change checkpoint')
    const alerts = workflow.indexOf('name: Check observed titles for personal in-app notifications')
    const iamProbe = workflow.indexOf('name: Probe title-alert Firestore IAM transaction')
    const report = workflow.indexOf('name: Report independent alert failure')
    expect(checkpoint).toBeGreaterThan(0)
    expect(alerts).toBeGreaterThan(checkpoint)
    expect(iamProbe).toBeGreaterThan(alerts)
    expect(report).toBeGreaterThan(iamProbe)
    expect(workflow.slice(alerts, iamProbe)).toContain('continue-on-error: true')
    expect(workflow.slice(iamProbe, report)).toContain('continue-on-error: true')
    expect(workflow.slice(iamProbe, report)).toContain("[alert-iam-probe]")
    expect(workflow).toContain('SUMMARY_TITLE_ALERTS: ${{ steps.title_alerts.outcome }}')
    expect(workflow).toContain('SUMMARY_ALERT_IAM_PROBE: ${{ steps.title_alert_iam_probe.outcome }}')
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
