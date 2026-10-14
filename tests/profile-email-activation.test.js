import { describe, expect, it, vi } from 'vitest'
import { activateEmailTest, checkRetryJob, checkTestAccess, jobName, jobPath, probeAction, scheduler } from '../scripts/activate-profile-email-test.mjs'
import { builder, disabledEnv, events, names, number, paths, project, region, runtime } from '../scripts/prepare-profile-email-deploy.mjs'
import { recipientFingerprint } from '../server/email/transport.mjs'
import { emailActionPage } from '../server/email/http.mjs'

const now = Date.parse('2026-10-14T12:00:00Z')
const recipient = 'test@example.org'
const uri = (name) => `https://${name.toLowerCase()}-synthetic-ew.a.run.app`
const fixture = (name) => ({
  name: `projects/${project}/locations/${region}/functions/${name}`, environment: 'GEN_2', state: 'ACTIVE',
  buildConfig: { runtime: 'nodejs22', entryPoint: name, serviceAccount: `projects/${project}/serviceAccounts/${builder}` },
  serviceConfig: { serviceAccountEmail: runtime, environmentVariables: { ...disabledEnv },
    maxInstanceCount: 1, maxInstanceRequestConcurrency: 1, timeoutSeconds: 120, availableMemory: '256Mi', allTrafficOnLatestRevision: true,
    service: `projects/${project}/locations/${region}/services/${name.toLowerCase()}`, uri: uri(name),
    secretEnvironmentVariables: ['RESEND_API_KEY', 'MOVIE_HUB_EMAIL_TOKEN_KEY'].map((key) => ({ key, secret: key, projectId: number, version: '2' })) },
  ...(paths[name] ? { eventTrigger: { eventType: 'google.cloud.firestore.document.v1.written', triggerRegion: region,
    serviceAccountEmail: events, retryPolicy: 'RETRY_POLICY_RETRY', eventFilters: [
      { attribute: 'database', value: '(default)' }, { attribute: 'namespace', value: '(default)' },
      { attribute: 'document', value: paths[name], operator: 'match-path-pattern' },
    ] } } : {}),
})
const validJob = () => ({ name: jobPath, state: 'ENABLED', schedule: '* * * * *', timeZone: 'Etc/UTC',
  attemptDeadline: '120s', retryConfig: { retryCount: 0, maxRetryDuration: '0s' },
  // Real Scheduler readback normalizes the root path but leaves OIDC audience exact.
  httpTarget: { uri: `${uri('profileEmailRetry')}/`, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json' },
    oidcToken: { serviceAccountEmail: scheduler, audience: uri('profileEmailRetry') } } })
class Cloud {
  functions = Object.fromEntries(names.map((name) => [name, fixture(name)]))
  policies = Object.fromEntries(names.map((name) => [name.toLowerCase(), { bindings: name === 'profileEmailAction' ? [] :
    [{ role: 'roles/run.invoker', members: [`serviceAccount:${name === 'profileEmailRetry' ? scheduler : events}`] }] }]))
  jobs = [{ name: 'projects/movie-hub-62459/locations/europe-west3/jobs/movie-hub-tv-final-1min' }]
  indexState = 'READY'
  calls = []
  writes = []
  failDeploy = ''
  env = null
  run = (args) => {
    this.calls.push(args)
    const command = args.slice(0, 3).join(' ')
    if (args[0] === 'projects') return { projectId: project, projectNumber: number, lifecycleState: 'ACTIVE' }
    if (command === 'firestore databases describe') return { locationId: region, type: 'FIRESTORE_NATIVE' }
    if (command === 'firestore indexes fields') return { indexConfig: { indexes: [{ queryScope: 'COLLECTION_GROUP', state: this.indexState, fields: [{ fieldPath: 'queueAt', order: 'ASCENDING' }] }] } }
    if (command === 'iam service-accounts describe') return { email: args[3] }
    if (command === 'secrets versions describe') return { name: `projects/${number}/secrets/${args[4].split('=')[1]}/versions/2`, state: 'ENABLED' }
    if (args[0] === 'functions' && args[1] === 'describe') return structuredClone(this.functions[args[2]])
    if (command === 'run services get-iam-policy') return structuredClone(this.policies[args[3]])
    if (command === 'run services describe') return { metadata: { annotations: {} } }
    if (command === 'scheduler jobs list') return structuredClone(this.jobs)
    if (args[0] === 'functions' && args[1] === 'deploy') {
      if (this.failDeploy === args[2]) throw Error('Simulated deployment failure')
      if (args.some((arg) => arg.startsWith('--env-vars-file='))) {
        this.functions[args[2]].serviceConfig.environmentVariables = structuredClone(this.env)
      }
    } else if (command === 'run services add-iam-policy-binding') {
      expect(args[3]).toBe('profileemailaction')
      this.policies[args[3]].bindings.push({ role: 'roles/run.invoker', members: ['allUsers'] })
    } else if (command === 'scheduler jobs create') {
      expect(args[3]).toBe('http'); expect(args[4]).toBe(jobName)
      this.jobs.push(validJob())
    } else if (command === 'scheduler jobs resume') {
      this.jobs.find((job) => job.name === jobPath).state = 'ENABLED'
    } else throw Error('Unexpected Cloud command')
    this.writes.push(args)
  }
}
const activate = (cloud, options = {}) => activateEmailTest({ recipient, apply: true, run: cloud.run,
  clock: () => now, writeEnv: (env) => { cloud.env = env; return '/tmp/synthetic-env.json' },
  probe: vi.fn(), log: vi.fn(), ...options })

describe('controlled mail activation', () => {
  it('deploys four bounded test functions, only opens action and creates one exact OIDC job', async () => {
    const cloud = new Cloud(); const probe = vi.fn(); const log = vi.fn()
    const result = await activate(cloud, { probe, log })
    expect(result.active).toBe(true)
    expect(cloud.env.MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256).toBe(recipientFingerprint(recipient))
    expect(JSON.stringify(cloud.env)).not.toContain(recipient)
    expect(cloud.writes.filter((a) => a[0] === 'functions').map((a) => a[2])).toEqual(names)
    for (const args of cloud.writes.filter((a) => a[0] === 'functions')) {
      expect(args).toContain('--source=email-functions')
      expect(args).not.toContain('--allow-unauthenticated')
      expect(args).not.toContain('--no-allow-unauthenticated')
    }
    expect(cloud.writes.filter((a) => a.includes('add-iam-policy-binding'))).toHaveLength(1)
    const job = cloud.writes.find((a) => a.includes('create'))
    expect(job).toContain(`--oidc-token-audience=${uri('profileEmailRetry')}`)
    expect(job).toContain(`--oidc-service-account-email=${scheduler}`)
    expect(job).toContain('--schedule=* * * * *')
    expect(job).toContain('--message-body={}')
    expect(cloud.jobs).toHaveLength(2)
    expect(probe).toHaveBeenCalledWith(uri('profileEmailAction'))
    expect(JSON.stringify(log.mock.calls)).not.toContain(recipient)
    expect(JSON.stringify(cloud.calls)).not.toMatch(/"access"|"delete"|"set-iam-policy"|"documents"/)
  })
  it('read-only mode inspects without opening, deploying, probing or scheduling', async () => {
    const cloud = new Cloud(); const probe = vi.fn()
    expect((await activate(cloud, { apply: false, probe })).active).toBe(false)
    expect(cloud.writes).toEqual([]); expect(probe).not.toHaveBeenCalled()
  })
  it('accepts only the optional root slash while keeping the OIDC audience exact', () => {
    for (const expected of [uri('profileEmailRetry'), `${uri('profileEmailRetry')}/`]) {
      for (const actual of [uri('profileEmailRetry'), `${uri('profileEmailRetry')}/`]) {
        const job = validJob(); job.httpTarget.uri = actual; job.httpTarget.oidcToken.audience = expected
        expect(() => checkRetryJob(job, expected)).not.toThrow()
      }
    }
    const job = validJob(); job.httpTarget.oidcToken.audience += '/'
    expect(() => checkRetryJob(job, uri('profileEmailRetry'))).toThrow()
  })
  it('rejects other targets rather than broadly normalizing their URLs', () => {
    const root = uri('profileEmailRetry')
    for (const actual of [`${root}//`, `${root}/other`, `${root}/?x=1`, `${root}/#x`, `${root}/.`,
      `${root}:443/`, root.replace('https:', 'http:'), root.replace('https://', 'https://user@'),
      `${root}.example.org/`, 'https://another.run.app/']) {
      const job = validJob(); job.httpTarget.uri = actual
      expect(() => checkRetryJob(job, root)).toThrow()
    }
  })
  it('verifies the active setup with normalized Scheduler target without any mutations', async () => {
    const cloud = new Cloud(); await activate(cloud)
    cloud.calls = []; cloud.writes = []
    const probe = vi.fn(); const writeEnv = vi.fn()
    const result = await activate(cloud, { apply: false, verifyActive: true, probe, writeEnv, clock: () => now + 3600000 })
    expect(result).toMatchObject({ active: true, verified: true, liveAfter: new Date(now).toISOString() })
    expect(cloud.writes).toEqual([]); expect(writeEnv).not.toHaveBeenCalled()
    expect(probe).toHaveBeenCalledExactlyOnceWith(uri('profileEmailAction'))
    expect(cloud.calls.every((args) => args.includes('describe') || args.includes('get-iam-policy') || args.includes('list'))).toBe(true)
  })
  it('does not repair or approve an incomplete active setup in verification mode', async () => {
    for (const change of [
      (c) => { c.functions.profileEmailPreferences.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_ENABLED = 'false' },
      (c) => { c.functions.profileEmailRetry.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256 = '0'.repeat(64) },
      (c) => { c.jobs.find((j) => j.name === jobPath).state = 'PAUSED' },
      (c) => { c.jobs = c.jobs.filter((j) => j.name !== jobPath) },
      (c) => { c.policies.profileemailaction.bindings = [] },
    ]) {
      const cloud = new Cloud(); await activate(cloud); change(cloud); cloud.writes = []
      const probe = vi.fn(); const writeEnv = vi.fn()
      await expect(activate(cloud, { apply: false, verifyActive: true, probe, writeEnv })).rejects.toThrow()
      expect(cloud.writes).toEqual([]); expect(writeEnv).not.toHaveBeenCalled(); expect(probe).not.toHaveBeenCalled()
    }
  })
  it('fails read-only verification when the action page is unavailable', async () => {
    const cloud = new Cloud(); await activate(cloud); cloud.writes = []
    await expect(activate(cloud, { apply: false, verifyActive: true,
      probe: vi.fn().mockRejectedValue(Error('Page unavailable')) })).rejects.toThrow('Page unavailable')
    expect(cloud.writes).toEqual([])
  })
  it('refuses simultaneous activation and verification before calling Cloud', async () => {
    const cloud = new Cloud()
    await expect(activate(cloud, { verifyActive: true })).rejects.toThrow('Choose only one mode')
    expect(cloud.calls).toEqual([])
  })
  it('refreshes only Preferences, keeping environment, secret pins, IAM and schedules', async () => {
    const cloud = new Cloud(); await activate(cloud)
    cloud.functions.profileEmailPreferences.serviceConfig.environmentVariables.LOG_EXECUTION_ID = 'true'
    const before = structuredClone({ functions: cloud.functions, policies: cloud.policies, jobs: cloud.jobs })
    cloud.calls = []; cloud.writes = []; cloud.env = null
    const writeEnv = vi.fn(); const probe = vi.fn()
    const result = await activate(cloud, { apply: false, refreshPreferences: true, writeEnv, probe, clock: () => now + 3600000 })
    expect(result).toMatchObject({ active: true, refreshed: 'profileEmailPreferences', liveAfter: new Date(now).toISOString() })
    expect(writeEnv).not.toHaveBeenCalled()
    expect(probe).toHaveBeenCalledExactlyOnceWith(uri('profileEmailAction'))
    expect(cloud.writes).toHaveLength(1)
    expect(cloud.writes[0].slice(0, 3)).toEqual(['functions', 'deploy', 'profileEmailPreferences'])
    expect(cloud.writes[0]).toContain(`--set-secrets=RESEND_API_KEY=projects/${number}/secrets/RESEND_API_KEY:2,MOVIE_HUB_EMAIL_TOKEN_KEY=projects/${number}/secrets/MOVIE_HUB_EMAIL_TOKEN_KEY:2`)
    expect(cloud.writes[0].join(' ')).not.toMatch(/env-vars|allow-unauthenticated/)
    expect({ functions: cloud.functions, policies: cloud.policies, jobs: cloud.jobs }).toEqual(before)
    for (const name of names) {
      expect(cloud.calls.filter((a) => a[0] === 'functions' && a[1] === 'describe' && a[2] === name)).toHaveLength(2)
    }
  })
  it('refuses a Preferences refresh if activation is incomplete or the recipient differs', async () => {
    for (const mutate of [
      (c) => { c.functions.profileEmailPreferences.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_ENABLED = 'false' },
      (c) => { c.functions.profileEmailRetry.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256 = '0'.repeat(64) },
      (c) => { c.jobs.find((j) => j.name === jobPath).state = 'PAUSED' },
      (c) => { c.policies.profileemailpreferences.bindings = [] },
      (c) => { c.policies.profileemailaction.bindings = [] },
    ]) {
      const cloud = new Cloud(); await activate(cloud); mutate(cloud); cloud.writes = []
      await expect(activate(cloud, { apply: false, refreshPreferences: true })).rejects.toThrow()
      expect(cloud.writes).toEqual([])
    }
  })
  it('does not refresh Preferences when the active action page cannot be verified', async () => {
    const cloud = new Cloud(); await activate(cloud); cloud.writes = []
    await expect(activate(cloud, { apply: false, refreshPreferences: true,
      probe: vi.fn().mockRejectedValue(Error('Page unavailable')) })).rejects.toThrow('Page unavailable')
    expect(cloud.writes).toEqual([])
  })
  it('rejects a changed configuration in the post-refresh readback', async () => {
    const cloud = new Cloud(); await activate(cloud); cloud.writes = []
    const run = (args) => {
      const result = cloud.run(args)
      if (args[0] === 'functions' && args[1] === 'deploy') {
        cloud.functions.profileEmailPreferences.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_LIVE_AFTER = new Date(now - 1).toISOString()
      }
      return result
    }
    await expect(activate(cloud, { apply: false, refreshPreferences: true, run })).rejects.toThrow('Refresh profileEmailPreferences')
    expect(cloud.writes).toHaveLength(1)
  })
  it('does not deploy more functions or mutate IAM/jobs after a failed Preferences refresh', async () => {
    const cloud = new Cloud(); await activate(cloud); cloud.writes = []; cloud.calls = []
    cloud.failDeploy = 'profileEmailPreferences'
    await expect(activate(cloud, { apply: false, refreshPreferences: true })).rejects.toThrow('Refresh profileEmailPreferences')
    expect(cloud.writes).toEqual([])
    expect(cloud.calls.filter((a) => a[0] === 'functions' && a[1] === 'deploy')).toHaveLength(1)
  })
  it('refuses to combine a Preferences refresh with another mode', async () => {
    for (const options of [{ apply: true }, { apply: false, verifyActive: true }]) {
      const cloud = new Cloud()
      await expect(activate(cloud, { refreshPreferences: true, ...options })).rejects.toThrow('Choose only one mode')
      expect(cloud.calls).toEqual([])
    }
  })
  it('stops before writes for an incomplete index, missing invocation grant or foreign function', async () => {
    for (const mutate of [(c) => { c.indexState = 'CREATING' },
      (c) => { c.policies.profileemailnotification.bindings = [] },
      (c) => { c.functions.profileEmailNotification.serviceConfig.serviceAccountEmail = 'other' }]) {
      const cloud = new Cloud(); mutate(cloud)
      await expect(activate(cloud)).rejects.toThrow()
      expect(cloud.writes).toEqual([])
    }
  })
  it('resumes a partial activation without changing recipient or historical start', async () => {
    const cloud = new Cloud(); cloud.failDeploy = 'profileEmailPreferences'
    await expect(activate(cloud)).rejects.toThrow('Activate profileEmailPreferences')
    const originalStart = cloud.env.MOVIE_HUB_EMAIL_LIVE_AFTER
    expect(cloud.jobs).toHaveLength(1)
    cloud.failDeploy = ''
    await activate(cloud, { clock: () => now + 3600000 })
    expect(cloud.env.MOVIE_HUB_EMAIL_LIVE_AFTER).toBe(originalStart)
    await activate(cloud, { clock: () => now + 7200000 })
    expect(cloud.jobs).toHaveLength(2)
    expect(cloud.writes.filter((a) => a.includes('create'))).toHaveLength(1)
  })
  it('refuses to switch the recipient of an existing test activation', async () => {
    const cloud = new Cloud(); await activate(cloud)
    const count = cloud.writes.length
    await expect(activate(cloud, { recipient: 'another@example.org' })).rejects.toThrow()
    expect(cloud.writes).toHaveLength(count)
  })
  it('does not start the event functions if the public action page fails inspection', async () => {
    const cloud = new Cloud()
    await expect(activate(cloud, { probe: vi.fn().mockRejectedValue(Error('Page unavailable')) })).rejects.toThrow()
    expect(cloud.writes.filter((a) => a[0] === 'functions').map((a) => a[2])).toEqual(['profileEmailAction'])
    expect(cloud.jobs).toHaveLength(1)
  })
  it('rejects a conflicting or differently authenticated scheduler before any mutation', async () => {
    for (const change of [(j) => { j.name += '-other' }, (j) => { j.name = j.name.replace(jobName, 'unrelated-job') },
      (j) => { j.httpTarget.oidcToken.audience = 'other' },
      (j) => { j.httpTarget.headers.Authorization = 'unexpected' }, (j) => { j.retryConfig.retryCount = 2 }]) {
      const cloud = new Cloud(); const job = validJob(); change(job); cloud.jobs.push(job)
      await expect(activate(cloud)).rejects.toThrow()
      expect(cloud.writes).toEqual([])
    }
  })
  it('allows public access only on action with the unconditional invoker role', () => {
    const policy = { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] }
    expect(() => checkTestAccess(policy, {}, 'profileEmailAction')).not.toThrow()
    expect(() => checkTestAccess(policy, {}, 'profileEmailRetry')).toThrow()
    expect(() => checkTestAccess(policy, { invokerIamDisabled: true }, 'profileEmailAction')).toThrow()
    policy.bindings[0].condition = { expression: 'true' }
    expect(() => checkTestAccess(policy, {}, 'profileEmailAction')).toThrow()
  })
  it('checks anonymous action HTML exactly and never POSTs or follows redirects', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, text: async () => emailActionPage })
    await probeAction(uri('profileEmailAction'), fetch)
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' })
    fetch.mockResolvedValue({ status: 200, text: async () => 'unexpected page' })
    await expect(probeAction(uri('profileEmailAction'), fetch)).rejects.toThrow('could not be verified')
  })
  it('waits for public invocation propagation using only bounded inert requests', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ status: 403 }).mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200, text: async () => emailActionPage })
    const sleep = vi.fn()
    await probeAction(uri('profileEmailAction'), fetch, sleep)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    fetch.mockResolvedValue({ status: 403 })
    fetch.mockClear(); sleep.mockClear()
    await expect(probeAction(uri('profileEmailAction'), fetch, sleep)).rejects.toThrow('could not be verified')
    expect(fetch).toHaveBeenCalledTimes(7)
    expect(sleep).toHaveBeenCalledTimes(6)
  })
})
