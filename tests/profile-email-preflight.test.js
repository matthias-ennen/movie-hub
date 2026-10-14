import { afterEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('node:fs', () => ({ appendFileSync: vi.fn() }))
const originalExitCode = process.exitCode
afterEach(() => { process.exitCode = originalExitCode; vi.restoreAllMocks(); vi.resetModules() })

async function inspect(reply) {
  spawnSync.mockImplementation((command, args) => {
    expect(command).toBe('gcloud')
    expect(args.some((arg) => ['access', 'create', 'deploy', 'add-iam-policy-binding', 'delete'].includes(arg))).toBe(false)
    const supplied = reply(args)
    if (supplied?.error) return { status: 1, stderr: supplied.error }
    return { status: 0, stdout: args.some((arg) => arg.startsWith('--format=json'))
      ? JSON.stringify(supplied ?? null) : String(supplied ?? '') }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await import('../scripts/profile-email-preflight.mjs')
  const report = JSON.parse(output.mock.calls[0][0])
  expect(report.checks.filter((item) => item.name.startsWith('Isolated function:'))).toHaveLength(4)
  expect(process.exitCode).toBe(1)
  return report
}

test('active accounts with omitted disabled=false retain their identity; null index does not abort report', async () => {
  const report = await inspect((args) => args[0] === 'iam' && args[1] === 'service-accounts'
    ? { email: args[3] } : null)
  expect(report.checks.filter((item) => item.name.startsWith('Dedicated account:')).every((item) => item.state === 'ready')).toBe(true)
  expect(report.checks.find((item) => item.name.startsWith('Email retry')).state).toBe('needs-setup')
  expect(spawnSync.mock.calls.some(([, args]) => args.includes('--format=json(email,disabled)'))).toBe(true)
})

test('null, disabled or mismatched account metadata never counts as a verified identity', async () => {
  const report = await inspect((args) => {
    if (args[1] !== 'service-accounts') return null
    if (args[3].startsWith('movie-hub-email-build@')) return { email: args[3], disabled: true }
    if (args[3].startsWith('movie-hub-email-events@')) return { email: 'other-account@example.invalid' }
    return null
  })
  expect(report.checks.filter((item) => item.name.startsWith('Dedicated account:')).every((item) => item.state === 'needs-setup')).toBe(true)
})

test('unexpected metadata shape produces an unreadable check without losing the remaining report', async () => {
  const report = await inspect((args) => args[0] === 'projects' ? { bindings: 42 } : null)
  expect(report.checks.find((item) => item.name === 'Runtime role assigned to dedicated account')).toMatchObject({
    state: 'unreadable', reason: 'metadata-format',
  })
})

test('permission failures remain distinct from missing resources and raw errors stay hidden', async () => {
  const report = await inspect((args) => ({ error: args[0] === 'secrets'
    ? 'PERMISSION_DENIED NOT_FOUND private-provider-detail' : 'NOT_FOUND' }))
  expect(report.checks.find((item) => item.name.includes('RESEND_API_KEY'))).toMatchObject({
    state: 'unreadable', reason: 'permission-or-authentication',
  })
  expect(report.checks.find((item) => item.name === 'Isolated function: profileEmailAction').state).toBe('missing')
  expect(JSON.stringify(report)).not.toContain('private-provider-detail')
})
