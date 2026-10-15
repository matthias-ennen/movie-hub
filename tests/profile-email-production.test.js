import { describe, expect, it, vi } from 'vitest'
import { promoteEmailDomain, productionFrom } from '../scripts/promote-profile-email-domain.mjs'
import { builder, events, names, number, paths, project, region, runtime } from '../scripts/prepare-profile-email-deploy.mjs'
import { jobPath, scheduler } from '../scripts/activate-profile-email-test.mjs'

const start = '2026-10-14T12:00:00Z'
const fromOld = 'MovieHub <onboarding@resend.dev>'
const endpoint = (name) => `https://${name.toLowerCase()}-mock.a.run.app`
const validJob = () => ({ name: jobPath, state: 'ENABLED', schedule: '* * * * *', timeZone: 'Etc/UTC',
  attemptDeadline: '120s', retryConfig: { retryCount: 0, maxRetryDuration: '0s' },
  httpTarget: { uri: `${endpoint('profileEmailRetry')}/`, httpMethod: 'POST', body: 'e30=',
    headers: { 'Content-Type': 'application/json' },
    oidcToken: { serviceAccountEmail: scheduler, audience: endpoint('profileEmailRetry') } } })
const info = (name) => ({
  name: `projects/${project}/locations/${region}/functions/${name}`, environment: 'GEN_2', state: 'ACTIVE',
  buildConfig: { runtime: 'nodejs22', entryPoint: name, serviceAccount: `projects/${project}/serviceAccounts/${builder}` },
  serviceConfig: { serviceAccountEmail: runtime,
    environmentVariables: { MOVIE_HUB_EMAIL_ENABLED: 'true', MOVIE_HUB_EMAIL_FROM: fromOld,
      MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256: 'a'.repeat(64), MOVIE_HUB_EMAIL_TEST_RELEASE: 'recipient-v1',
      MOVIE_HUB_EMAIL_LIVE_AFTER: start, MOVIE_HUB_EMAIL_APP_URL: 'https://movie-hub-62459.web.app',
      MOVIE_HUB_EMAIL_ACTION_URL: endpoint('profileEmailAction'), MOVIE_HUB_EMAIL_REGION: region,
      MOVIE_HUB_EMAIL_SERVICE_ACCOUNT: runtime },
    maxInstanceCount: 1, maxInstanceRequestConcurrency: 1, timeoutSeconds: 120, availableMemory: '256Mi',
    allTrafficOnLatestRevision: true, service: `projects/${project}/locations/${region}/services/${name.toLowerCase()}`,
    uri: endpoint(name), secretEnvironmentVariables: ['RESEND_API_KEY', 'MOVIE_HUB_EMAIL_TOKEN_KEY'].map((key) =>
      ({ key, secret: key, projectId: number, version: '1' })) },
  ...(paths[name] ? { eventTrigger: { eventType: 'google.cloud.firestore.document.v1.written',
    triggerRegion: region, serviceAccountEmail: events, retryPolicy: 'RETRY_POLICY_RETRY',
    eventFilters: [{ attribute: 'database', value: '(default)' }, { attribute: 'namespace', value: '(default)' },
      { attribute: 'document', value: paths[name], operator: 'match-path-pattern' }] } } : {}),
})

class Cloud {
  functions = Object.fromEntries(names.map((name) => [name, info(name)]))
  policies = Object.fromEntries(names.map((name) => [name.toLowerCase(), {
    bindings: name === 'profileEmailAction'
      ? [{ role: 'roles/run.invoker', members: ['allUsers'] }]
      : [{ role: 'roles/run.invoker', members: [`serviceAccount:${name === 'profileEmailRetry' ? scheduler : events}`] }],
  }]))
  jobs = [validJob()]
  writes = []
  calls = []
  configs = {}
  badSecret = false
  failAt = ''
  writeEnv = (name, env) => {
    const path = `/tmp/${name}.json`
    this.configs[path] = structuredClone(env)
    return path
  }
  run = (args) => {
    this.calls.push(args)
    const key = args.slice(0, 3).join(' ')
    if (args[0] === 'projects') return { projectId: project, projectNumber: number, lifecycleState: 'ACTIVE' }
    if (key === 'firestore databases describe') return { locationId: region, type: 'FIRESTORE_NATIVE' }
    if (key === 'firestore indexes fields') return { indexConfig: { indexes: [{
      state: 'READY', queryScope: 'COLLECTION_GROUP', fields: [{ fieldPath: 'queueAt', order: 'ASCENDING' }],
    }] } }
    if (key === 'iam service-accounts describe') return { email: args[3] }
    if (key === 'secrets versions describe') {
      const secret = args.find((x) => x.startsWith('--secret='))?.split('=')[1]
      return { name: `projects/${number}/secrets/${secret}/versions/${args[3]}`,
        state: this.badSecret && secret === 'RESEND_API_KEY' ? 'DISABLED' : 'ENABLED' }
    }
    if (args[0] === 'functions' && args[1] === 'describe') return structuredClone(this.functions[args[2]])
    if (key === 'run services get-iam-policy') return structuredClone(this.policies[args[3]])
    if (key === 'run services describe') return { metadata: { annotations: {} } }
    if (key === 'scheduler jobs list') return structuredClone(this.jobs)
    if (key === 'scheduler jobs describe') return structuredClone(this.jobs[0])
    if (key === 'scheduler jobs pause') { this.jobs[0].state = 'PAUSED'; this.writes.push(args); return null }
    if (key === 'scheduler jobs resume') { this.jobs[0].state = 'ENABLED'; this.writes.push(args); return null }
    if (args[0] === 'functions' && args[1] === 'deploy') {
      if (this.failAt === args[2]) throw Error('simulated deploy failure')
      const path = args.find((x) => x.startsWith('--env-vars-file='))?.split('=')[1]
      expect(path).toBeTruthy()
      this.functions[args[2]].serviceConfig.environmentVariables = structuredClone(this.configs[path])
      this.functions[args[2]].serviceConfig.secretEnvironmentVariables.find((x) => x.key === 'RESEND_API_KEY').version = '2'
      this.writes.push(args)
      return null
    }
    throw Error(`Unexpected Cloud command: ${args.join(' ')}`)
  }
}
const run = (cloud, options = {}) => promoteEmailDomain({
  run: cloud.run, newKeyVersion: '2', clock: () => Date.parse(start) + 3600000,
  probe: vi.fn(), quietQueue: vi.fn().mockResolvedValue(true), writeEnv: cloud.writeEnv,
  log: vi.fn(), ...options,
})

describe('verified-domain production mail cutover', () => {
  it('performs a read-only preflight with no deployment or changes', async () => {
    const cloud = new Cloud()
    expect(await run(cloud)).toMatchObject({ ready: true, states: Object.fromEntries(names.map((x) => [x, 'provisional'])) })
    expect(cloud.writes).toEqual([])
  })
  it('upgrades exactly four functions with key v2, removes recipient restriction and resumes the private job', async () => {
    const cloud = new Cloud()
    const result = await run(cloud, { apply: true })
    expect(result.active).toBe(true)
    expect(cloud.writes.map((x) => x.slice(0, 3))).toEqual([
      ['scheduler', 'jobs', 'pause'], ...['profileEmailPreferences', 'profileEmailNotification',
        'profileEmailRetry', 'profileEmailAction'].map((x) => ['functions', 'deploy', x]),
      ['scheduler', 'jobs', 'resume'],
    ])
    expect(cloud.jobs[0].state).toBe('ENABLED')
    for (const name of names) {
      const env = cloud.functions[name].serviceConfig.environmentVariables
      expect(env.MOVIE_HUB_EMAIL_FROM).toBe(productionFrom)
      expect(env.MOVIE_HUB_EMAIL_TEST_RECIPIENT_SHA256).toBeUndefined()
      expect(env.MOVIE_HUB_EMAIL_TEST_RELEASE).toBeUndefined()
      expect(env.MOVIE_HUB_EMAIL_LIVE_AFTER).toBe(start)
      expect(env.MOVIE_HUB_EMAIL_ENABLED).toBe('true')
    }
    for (const deploy of cloud.writes.filter((x) => x[0] === 'functions')) {
      expect(deploy.join(' ')).toContain(`RESEND_API_KEY=projects/${number}/secrets/RESEND_API_KEY:2`)
      expect(deploy.join(' ')).toContain(`MOVIE_HUB_EMAIL_TOKEN_KEY=projects/${number}/secrets/MOVIE_HUB_EMAIL_TOKEN_KEY:1`)
      expect(deploy.join(' ')).not.toMatch(/allow-unauthenticated|set-iam-policy|scheduler|TEST_RECIPIENT/)
    }
  })
  it('refuses an absent or disabled secret v2 and unexpected function/IAM without writes', async () => {
    for (const mutate of [
      (c) => { c.badSecret = true },
      (c) => { c.functions.profileEmailNotification.serviceConfig.serviceAccountEmail = 'other' },
      (c) => { c.policies.profileemailnotification.bindings = [] },
      (c) => { c.functions.profileEmailRetry.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_LIVE_AFTER = '2026-10-15T12:00:00Z' },
      (c) => { c.jobs[0].httpTarget.oidcToken.audience = 'https://other.example' },
    ]) {
      const cloud = new Cloud(); mutate(cloud)
      await expect(run(cloud, { apply: true })).rejects.toThrow()
      expect(cloud.writes).toEqual([])
    }
  })
  it('refuses attempted old sender jobs before pausing the scheduler', async () => {
    const cloud = new Cloud()
    await expect(run(cloud, { apply: true, quietQueue: async () => false })).rejects.toThrow('older sender')
    expect(cloud.writes).toEqual([])
  })
  it('does not deploy if the private scheduler could not pause', async () => {
    const cloud = new Cloud()
    const original = cloud.run
    const guarded = (args) => args.slice(0, 3).join(' ') === 'scheduler jobs pause' ? null : original(args)
    await expect(run(cloud, { apply: true, run: guarded })).rejects.toThrow('did not pause')
    expect(cloud.writes).toEqual([])
  })
  it('leaves the job safely paused on a partial failure, then resumes the same cutover', async () => {
    const cloud = new Cloud(); cloud.failAt = 'profileEmailNotification'
    await expect(run(cloud, { apply: true })).rejects.toThrow('Promote profileEmailNotification')
    expect(cloud.jobs[0].state).toBe('PAUSED')
    expect(cloud.functions.profileEmailPreferences.serviceConfig.environmentVariables.MOVIE_HUB_EMAIL_FROM).toBe(productionFrom)
    cloud.failAt = ''
    const result = await run(cloud, { apply: true })
    expect(result.active).toBe(true)
    expect(cloud.jobs[0].state).toBe('ENABLED')
    expect(cloud.writes.filter((x) => x[0] === 'functions' && x[2] === 'profileEmailPreferences')).toHaveLength(1)
  })
  it('is idempotent and does not deploy or pause when already in production', async () => {
    const cloud = new Cloud(); await run(cloud, { apply: true })
    cloud.writes = []
    const result = await run(cloud, { apply: true })
    expect(result.active).toBe(true)
    expect(cloud.writes).toEqual([])
  })
})
