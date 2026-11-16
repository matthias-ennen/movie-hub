import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Firebase workflow data separation', () => {
  it('stages XMLTV independently of Waipu, Joyn and checkpoint results without enabling light or code-only runs', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')
    const expression = workflow.match(/id: g2w_stage\s+if: \$\{\{ ([^\n]+?) \}\}/)?.[1]
    expect(expression).toBeTruthy()
    const evaluate = Function('github', 'inputs', 'steps', 'return ' + expression)
    const github = {event_name: 'schedule', ref: 'refs/heads/main'}
    const inputs = {nightly_chain: true, data_mode: 'standard', shared_tmdb_cache: 'private-persistent', xmltv_private_preview: true}
    for (const outcome of ['success', 'failure', 'skipped']) {
      const steps = Object.fromEntries(['waipu_catalog', 'joyn_catalog', 'g2v_save', 'g2v_restore'].map(k => [k, {outcome}]))
      expect(evaluate(github, inputs, steps)).toBe(true)
      expect(evaluate({...github, event_name: 'push'}, inputs, steps)).toBe(false)
      expect(evaluate({...github, ref: 'refs/heads/test'}, inputs, steps)).toBe(false)
      expect(evaluate(github, {...inputs, data_mode: 'accelerated'}, steps)).toBe(false)
      expect(evaluate(github, {...inputs, xmltv_private_preview: false}, steps)).toBe(false)
      expect(evaluate(github, {...inputs, nightly_chain: false}, steps)).toBe(false)
    }
    const preview = workflow.match(/id: g2w_preview\s+if: \$\{\{ ([^\n]+?) \}\}/)?.[1]
    const previewAllowed = Function('steps', 'return ' + preview)
    const steps = {g2w_stage:{outcome:'success'}, waipu_catalog:{outcome:'success'}, joyn_catalog:{outcome:'success'}, g2v_save:{outcome:'failure'}}
    expect(previewAllowed(steps)).toBe(true)
    for (const waipu of ['success','failure','skipped']) {
      for (const joyn of ['success','failure','skipped']) {
        const peers={...steps,waipu_catalog:{outcome:waipu},joyn_catalog:{outcome:joyn}}
        expect(previewAllowed(peers)).toBe(true)
        expect(previewAllowed({...peers,g2w_stage:{outcome:'failure'}})).toBe(false)
      }
    }
  })

  it('generates seasons once after current TV imports and before both TV publications', async () => {
    const workflow = await readFile('.github/workflows/deploy-firebase.yml', 'utf8')
    expect(workflow).toContain("TMDB_SERIES_DETAILS_DEFER: '1'")
    const seasons = workflow.indexOf('name: Complete series seasons including current TV source titles')
    expect(seasons).toBeGreaterThan(workflow.indexOf('id: joyn_catalog'))
    expect(seasons).toBeGreaterThan(workflow.indexOf('id: canonical_executor'))
    expect(seasons).toBeLessThan(workflow.indexOf('id: live_availability_index'))
    expect(workflow).toContain('SUMMARY_SERIES_DETAILS: ${{ steps.series_details.outcome }}')
  })
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
    expect(workflow).toContain("(github.event_name != 'push' && env.MOVIEHUB_LIGHT_MODE != 'true')")
    expect(workflow).toContain("contains(github.event.head_commit.message, '[waipu-refresh]')")
    expect(workflow).toMatch(/name: Execute canonical title priority queue[\s\S]*?if:.*env\.MOVIEHUB_LIGHT_MODE != 'true'/)
    expect(workflow).toContain('run: npm run title:priority:execute')
    expect(workflow).not.toContain('name: Enrich personal Movie-Hub provider metadata')
    expect(workflow).not.toContain('name: Enrich personal TMDB catalog metadata')
  })
})

describe('YouTube read-only membership same-run episode handoff', () => {
  it('recovers both exact source QA and its private episode review before film matching', async () => {
    const workflow = await readFile('.github/workflows/youtube-g2-curated-tmdb-membership.yml', 'utf8')
    const handoff = workflow.slice(
      workflow.indexOf('name: Recover original read-only audit'),
      workflow.indexOf('name: Live read-only TMDB research'),
    )
    expect(handoff).toContain('curated-production-sync/qa.json')
    expect(handoff).toContain('production-download/artifacts/youtube-g2/series-episode-review/qa.json')
    expect(handoff).toContain('test -s "$episode_path"')
    expect(handoff).toContain('cp "$episode_path" artifacts/youtube-g2/series-episode-review/qa.json')
    expect(handoff.indexOf('cp "$episode_path"')).toBeLessThan(handoff.length)
    // The review is validated against source QA in the matcher, not re-created
    // from the current checkout or a different Firebase run.
    const matcher = await readFile('scripts/youtube-g2-curated-tmdb-membership-live.mjs', 'utf8')
    expect(matcher).toContain("const episodeReview = JSON.parse(await readFile(EPISODE_REVIEW, 'utf8'))")
    expect(matcher).toContain('audit,publicIndex: index,episodeReview,')
  })
})
