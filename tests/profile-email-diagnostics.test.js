import { expect, test, vi } from 'vitest'
import { diagnoseEmailDeployment, summarizeFailure } from '../scripts/profile-email-diagnostics.mjs'

const root = 'projects/movie-hub-62459/locations/europe-west3'
const secret = 'private-token-never-print'
const operation = (name, created, message) => ({ metadata: { target: `${root}/functions/${name}`, createTime: created },
  done: true, error: { code: 7, message } })
function execute(_command, args, options) {
  expect(args.some((arg) => ['deploy', 'create', 'access', 'set-iam-policy', 'add-iam-policy-binding', 'delete'].includes(arg))).toBe(false)
  expect(options.env.CLOUDSDK_CORE_LOG_HTTP).toBe('false')
  if (args[0] === 'auth') return { status: 0, stdout: secret }
  if (args[0] === 'logging') return { status: 0, stdout: '[]' }
  if (args[0] === 'projects') return { status: 0, stdout: JSON.stringify({ bindings: [
    { role: 'roles/eventarc.serviceAgent', members: ['serviceAccount:service-612913221205@gcp-sa-eventarc.iam.gserviceaccount.com'] },
    { role: 'roles/owner', members: ['user:private@example.invalid'] },
  ] }) }
  return { status: 0, stdout: JSON.stringify({ name: `${root}/functions/${args[2]}`, state: 'FAILED',
    stateMessages: [{ message: `Permission 'iam.serviceAccounts.actAs' denied ${secret}` }],
    serviceConfig: { environmentVariables: { MOVIE_HUB_EMAIL_ENABLED: 'false', private: secret } } }) }
}

test('reports recognized failure identifiers without provider messages, private values or arbitrary roles', () => {
  const summary = summarizeFailure(`Permission denied while using the Eventarc Service Agent. ${secret}
    roles/eventarc.serviceAgent private@example.invalid movie-hub-email-events@movie-hub-62459.iam.gserviceaccount.com`)
  expect(summary).toEqual({ permissions: [], roles: ['roles/eventarc.serviceAgent'], identities: ['eventReceiver'],
    hints: ['eventarc-service-agent-denied', 'permission-or-authentication'] })
  expect(JSON.stringify(summary)).not.toContain(secret)
})

test('reads only metadata, follows pagination and reports only the latest three operations for exact mail targets', async () => {
  const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ operations: [
    operation('unrelatedTvService', '2026-10-14T08:00:00Z', 'private-other-service'),
    operation('profileEmailPreferences', '2026-10-14T08:00:00Z', 'Permission eventarc.triggers.create denied'),
    operation('profileEmailPreferences', '2026-10-14T09:00:00Z', 'Permission eventarc.triggers.create denied'),
  ], nextPageToken: 'page-private-token' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ operations: [
    operation('profileEmailPreferences', '2026-10-14T10:00:00Z', 'Permission denied while using the Eventarc Service Agent.'),
    operation('profileEmailPreferences', '2026-10-14T11:00:00Z', 'Permission eventarc.events.receiveEvent denied'),
  ] }) })
  const report = await diagnoseEmailDeployment({ execute, request })
  expect(report.functions).toHaveLength(4)
  expect(report.functions.every((item) => item.disabled)).toBe(true)
  expect(report.roles.assignments.find((item) => item.identity === 'eventarcAgent').roles).toEqual(['roles/eventarc.serviceAgent'])
  expect(report.operations).toMatchObject({ state: 'read', truncated: false })
  expect(report.operations.latest).toHaveLength(3)
  expect(report.operations.latest[0]).toMatchObject({ name: 'profileEmailPreferences', created: '2026-10-14T11:00:00Z', code: 7 })
  const text = JSON.stringify(report)
  for (const value of [secret, 'private@example.invalid', 'private-other-service', 'page-private-token', 'roles/owner']) expect(text).not.toContain(value)
  for (const [url, options] of request.mock.calls) {
    expect(new URL(url).origin).toBe('https://cloudfunctions.googleapis.com')
    expect(new URL(url).searchParams.get('fields')).toBe('operations(name,metadata,done,error),nextPageToken')
    expect(options).toMatchObject({ method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${secret}` } })
  }
})

test('does not treat denied metadata as absent and never prints authentication or HTTP error bodies', async () => {
  const request = vi.fn().mockResolvedValue({ ok: false, status: 403, json: vi.fn(() => { throw Error(secret) }) })
  const denied = (_command, args) => args[0] === 'auth' ? { status: 0, stdout: secret }
    : { status: 1, stderr: `PERMISSION_DENIED NOT_FOUND ${secret}` }
  const report = await diagnoseEmailDeployment({ execute: denied, request })
  expect(report.functions.every((item) => item.state === 'unreadable')).toBe(true)
  expect(report.operations).toEqual({ state: 'unreadable', httpStatus: 403 })
  expect(JSON.stringify(report)).not.toContain(secret)
  const withoutAuth = await diagnoseEmailDeployment({ execute: () => ({ status: 1, stderr: secret }), request })
  expect(withoutAuth.operations).toEqual({ state: 'unreadable', reason: 'authentication' })
  expect(request).toHaveBeenCalledTimes(1)
})

test('bounds operation pagination and refuses mismatched function identities', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ operations: [], nextPageToken: 'next' }) })
  const report = await diagnoseEmailDeployment({ execute: (_command, args, options) => args[0] === 'functions'
    ? { status: 0, stdout: JSON.stringify({ name: 'other-target', state: 'ACTIVE' }) } : execute(_command, args, options), request })
  expect(report.functions.every((item) => item.reason === 'identity-mismatch')).toBe(true)
  expect(request).toHaveBeenCalledTimes(5)
  expect(report.operations.truncated).toBe(true)
})

test('reports a rejected create request even when no operation was created, without logging audit payloads', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ operations: [] }) })
  const report = await diagnoseEmailDeployment({ execute: (_command, args, options) => {
    if (args[0] !== 'logging') return execute(_command, args, options)
    expect(args).toContain('--freshness=1d'); expect(args).toContain('--limit=30')
    expect(args[2]).toContain('protoPayload.status.code>0')
    return { status: 0, stdout: JSON.stringify([{ protoPayload: { serviceName: 'eventarc.googleapis.com',
      status: { code: 7, message: secret }, request: { private: secret },
      authorizationInfo: [{ permission: 'eventarc.triggers.create', granted: false },
        { permission: 'eventarc.triggers.get', granted: true }] } }]) }
  }, request })
  expect(report.deniedRequests.entries[0]).toMatchObject({ code: 7, failure: { permissions: ['eventarc.triggers.create'] } })
  expect(JSON.stringify(report)).not.toContain(secret)
})
