import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { checkEmailFunction, checkPrivateService, prepareEmailDeployment, disabledEnv,
  names, paths, runtime, builder, events, project, number, region, gcloud } from '../scripts/prepare-profile-email-deploy.mjs'
import { createEmailRetryHandler } from '../server/email/http.mjs'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))

const fixture = (name) => ({
  name: `projects/${project}/locations/europe-west3/functions/${name}`, environment: 'GEN_2', state: 'ACTIVE',
  buildConfig: { runtime: 'nodejs22', entryPoint: name, serviceAccount: `projects/${project}/serviceAccounts/${builder}` },
  serviceConfig: {
    serviceAccountEmail: runtime, environmentVariables: { ...disabledEnv },
    maxInstanceCount: 1, maxInstanceRequestConcurrency: 1, timeoutSeconds: 120, availableMemory: '256Mi',
    service: `projects/${project}/locations/europe-west3/services/${name.toLowerCase()}`,
    uri: `https://${name.toLowerCase()}-synthetic-ew.a.run.app`,
    secretEnvironmentVariables: ['RESEND_API_KEY', 'MOVIE_HUB_EMAIL_TOKEN_KEY'].map((key) =>
      ({ key, secret: key, projectId: number, version: '2' })),
  },
  ...(paths[name] ? { eventTrigger: {
    eventType: 'google.cloud.firestore.document.v1.written', triggerRegion: 'europe-west3',
    serviceAccountEmail: events, retryPolicy: 'RETRY_POLICY_RETRY', eventFilters: [
      { attribute: 'database', value: '(default)' }, { attribute: 'namespace', value: '(default)' },
      { attribute: 'document', value: paths[name], operator: 'match-path-pattern' },
    ],
  } } : {}),
})

class Cloud {
  existing = new Map()
  calls = []
  writes = []
  jobs = [{ name: 'projects/movie-hub-62459/locations/europe-west3/jobs/movie-hub-tv-final-1min' }]
  policy = { bindings: [] }
  service = { metadata: { annotations: {} } }
  deny = () => false
  afterDeploy = () => {}
  run = (args, options) => {
    this.calls.push(args)
    if (this.deny(args)) throw Error('permission-or-authentication')
    const command = args.slice(0, 3).join(' ')
    if (args[0] === 'projects') return { projectId: project, projectNumber: number, lifecycleState: 'ACTIVE' }
    if (args[0] === 'firestore') return { locationId: region, type: 'FIRESTORE_NATIVE' }
    if (command === 'iam service-accounts describe') return { email: args[3] }
    if (command === 'secrets versions describe') {
      const key = args.find((arg) => arg.startsWith('--secret=')).split('=')[1]
      return { name: `projects/${number}/secrets/${key}/versions/2`, state: 'ENABLED' }
    }
    if (command === 'scheduler jobs list') return this.jobs
    if (args[0] === 'functions' && args[1] === 'describe') return this.existing.get(args[2]) ?? null
    if (command === 'run services get-iam-policy') return this.policy
    if (command === 'run services describe') return this.service
    if (args[0] === 'functions' && args[1] === 'deploy') {
      expect(options.format).toBe('none')
      this.writes.push(args)
      const value = fixture(args[2])
      this.afterDeploy(value)
      this.existing.set(args[2], value)
      return null
    }
    throw Error('Unexpected Cloud command')
  }
}
const prepare = (cloud, apply = true) => prepareEmailDeployment({ run: cloud.run, apply, envFile: '/tmp/disabled.json', log: vi.fn() })

describe('disabled mail deployment', () => {
  it('prepares exactly four isolated targets and pins secrets without accessing their payloads', () => {
    const cloud = new Cloud()
    expect(prepare(cloud)).toHaveLength(4)
    expect(cloud.writes.map((args) => args[2]).sort()).toEqual([
      'profileEmailAction', 'profileEmailNotification', 'profileEmailPreferences', 'profileEmailRetry',
    ])
    for (const args of cloud.writes) {
      expect(args).toContain('--source=email-functions')
      expect(args).toContain('--max-instances=1')
      expect(args).toContain('--concurrency=1')
      expect(args).toContain('--set-secrets=RESEND_API_KEY=projects/612913221205/secrets/RESEND_API_KEY:2,MOVIE_HUB_EMAIL_TOKEN_KEY=projects/612913221205/secrets/MOVIE_HUB_EMAIL_TOKEN_KEY:2')
      expect(args).toContain('--build-service-account=projects/movie-hub-62459/serviceAccounts/movie-hub-email-build@movie-hub-62459.iam.gserviceaccount.com')
      if (['profileEmailAction', 'profileEmailRetry'].includes(args[2])) {
        expect(args).toContain('--trigger-http'); expect(args).toContain('--no-allow-unauthenticated')
      } else {
        expect(args).toContain('--trigger-service-account=movie-hub-email-events@movie-hub-62459.iam.gserviceaccount.com')
        expect(args).toContain(`--trigger-event-filters-path-pattern=document=${paths[args[2]]}`)
      }
    }
    expect(disabledEnv.MOVIE_HUB_EMAIL_ENABLED).toBe('false')
    expect(disabledEnv.MOVIE_HUB_EMAIL_LIVE_AFTER).toBe('')
    expect(JSON.stringify(cloud.calls)).not.toMatch(/"access"|"create"|"add-iam-policy-binding"|"delete"|"set-iam-policy"/)
  })

  it('performs no deploy in read-only mode', () => {
    const cloud = new Cloud()
    expect(prepare(cloud, false)).toEqual([])
    expect(cloud.writes).toEqual([])
  })

  it('accepts documented same-project secret defaults but refuses foreign project references', () => {
    const details = fixture('profileEmailAction')
    delete details.serviceConfig.secretEnvironmentVariables[0].projectId
    expect(checkEmailFunction(details, 'profileEmailAction')).toMatchObject({ name: 'profileEmailAction' })
    details.serviceConfig.secretEnvironmentVariables[0].projectId = 'other-project'
    expect(() => checkEmailFunction(details, 'profileEmailAction')).toThrow('secret references')
  })

  it('classifies SDK permission failures without printing credentials or mistaking them for absence', () => {
    spawnSync.mockReturnValue({ status: 1, stderr: "PERMISSION_DENIED NOT_FOUND Permission 'eventarc.triggers.create' denied private-marker" })
    expect(() => gcloud(['functions', 'describe', 'profileEmailAction'], { missing: true }))
      .toThrow('permission-or-authentication: eventarc.triggers.create')
    try { gcloud(['functions', 'describe', 'profileEmailAction'], { missing: true }) }
    catch (error) { expect(error.message).not.toContain('private-marker') }
    expect(spawnSync.mock.calls.at(-1)[2].env.CLOUDSDK_CORE_LOG_HTTP).toBe('false')
    spawnSync.mockReturnValue({ status: 1, stderr: 'NOT_FOUND private-marker' })
    expect(gcloud(['functions', 'describe', 'profileEmailAction'], { missing: true })).toBeNull()
  })

  it('inspects every existing target before any mutation and refuses live or changed configuration', () => {
    for (const change of [
      (v) => { v.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_ENABLED = 'true' },
      (v) => { v.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_ACTION_URL = 'https://live.example.org' },
      (v) => { v.serviceConfig.serviceAccountEmail = 'default-compute@example.org' },
      (v) => { v.serviceConfig.secretEnvironmentVariables[0].version = 'latest' },
      (v) => { v.serviceConfig.environmentVariables.RESEND_API_KEY = 'private-marker' },
    ]) {
      const cloud = new Cloud()
      const last = fixture(names.at(-1)); change(last); cloud.existing.set(names.at(-1), last)
      expect(() => prepare(cloud)).toThrow()
      expect(cloud.writes).toEqual([])
    }
  })

  it('refuses unreadable resources instead of treating them as missing', () => {
    const cloud = new Cloud()
    cloud.deny = (args) => args[0] === 'functions' && args[1] === 'describe'
    expect(() => prepare(cloud)).toThrow('permission-or-authentication')
    expect(cloud.writes).toEqual([])
  })

  it('refuses existing mail schedules while leaving unrelated TV scheduling alone', () => {
    const cloud = new Cloud()
    cloud.jobs.push({ name: 'projects/movie-hub-62459/locations/europe-west3/jobs/firebase-schedule-profileEmailRetry-europe-west3' })
    expect(() => prepare(cloud)).toThrow('scheduler already exists')
    expect(cloud.writes).toEqual([])
  })

  it('stops subsequent deployments when readback detects a bad identity, limit or trigger scope', () => {
    for (const change of [
      (v) => { v.serviceConfig.maxInstanceCount = 5 },
      (v) => { v.buildConfig.serviceAccount = 'projects/other/serviceAccounts/default@example.org' },
      (v) => { if (v.eventTrigger) v.eventTrigger.eventFilters[2].value = 'users/{uid}/**' },
    ]) {
      const cloud = new Cloud(); cloud.afterDeploy = change
      expect(() => prepare(cloud)).toThrow()
      expect(cloud.writes.length).toBeLessThan(4)
    }
  })

  it('can resume a partial disabled deployment after verifying its existing private service', () => {
    const cloud = new Cloud()
    cloud.existing.set('profileEmailAction', fixture('profileEmailAction'))
    expect(prepare(cloud)).toHaveLength(4)
    const failed = fixture('profileEmailAction'); failed.state = 'FAILED'
    delete failed.serviceConfig.uri; delete failed.serviceConfig.service
    expect(checkEmailFunction(failed, 'profileEmailAction', { before: true })).toBeNull()
    expect(() => checkEmailFunction(failed, 'profileEmailAction')).toThrow()
  })

  it('rejects either public IAM members or a disabled Cloud Run Invoker IAM check', () => {
    for (const member of ['allUsers', 'allAuthenticatedUsers']) {
      expect(() => checkPrivateService({ bindings: [{ members: [member] }] }, {})).toThrow('public')
    }
    for (const metadata of [{ invokerIamDisabled: true }, { invoker_iam_disabled: true },
      { metadata: { annotations: { 'run.googleapis.com/invoker-iam-disabled': 'true' } } }]) {
      expect(() => checkPrivateService({ bindings: [] }, metadata)).toThrow('IAM check')
    }
    const cloud = new Cloud(); cloud.existing.set('profileEmailAction', fixture('profileEmailAction'))
    cloud.policy = { bindings: [{ members: ['allUsers'] }] }
    expect(() => prepare(cloud)).toThrow('public')
    expect(cloud.writes).toEqual([])
  })

  it('cannot be triggered by a push or normal hosting deployment and packages generated source', () => {
    const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    const workflow = read('.github/workflows/profile-email-prepare.yml')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).not.toMatch(/\n  (push|pull_request|schedule):/)
    const handler = read('email-functions/index.mjs')
    expect(handler).not.toContain('onSchedule')
    expect(handler).not.toContain("invoker: 'public'")
    const ignored = read('email-functions/.gcloudignore').split('\n').filter((line) => !line.startsWith('#'))
    expect(ignored).toContain('node_modules/')
    expect(ignored).not.toContain('server/')
    expect(ignored).not.toContain('src/')
    expect(read('.github/workflows/deploy-firebase.yml')).toContain('--only hosting,firestore:rules')
  })
})

describe('private retry HTTP boundary', () => {
  const response = () => {
    const res = { set: vi.fn(), status: vi.fn(), json: vi.fn(), send: vi.fn() }
    res.status.mockReturnValue(res); return res
  }
  it('rejects GET before constructing the service and never processes when disabled', async () => {
    const service = { enabled: false, retryDue: vi.fn() }; const factory = vi.fn(() => service)
    const handler = createEmailRetryHandler(factory); const res = response()
    await handler({ method: 'GET' }, res)
    expect(res.status).toHaveBeenLastCalledWith(405); expect(factory).not.toHaveBeenCalled()
    await handler({ method: 'POST' }, res)
    expect(res.status).toHaveBeenLastCalledWith(503); expect(service.retryDue).not.toHaveBeenCalled()
  })
  it('processes POST once when enabled and never exposes an internal failure', async () => {
    const retryDue = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(Error('private-recipient-and-token'))
    const handler = createEmailRetryHandler(() => ({ enabled: true, retryDue })); const res = response()
    await handler({ method: 'POST' }, res)
    expect(retryDue).toHaveBeenCalledTimes(1); expect(res.status).toHaveBeenLastCalledWith(204)
    await handler({ method: 'POST' }, res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(res.json).toHaveBeenLastCalledWith({ error: 'retry-unavailable' })
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-recipient')
  })
})
