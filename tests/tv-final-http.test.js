import { describe, it, expect, vi } from 'vitest'
import { createTvFinalHttpHandler } from '../functions/tv-final-http.mjs'
import { checkTvFunction } from '../scripts/tv-final-deploy-guard.mjs'

const mock = (method = 'POST') => {
  const res = { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v },
    end(body = '') { this.body = body } }
  return { req: { method }, res }
}
const validFunction = {
  name: 'projects/movie-hub-62459/locations/europe-west3/functions/movieHubTvFinalReminder',
  buildConfig: { runtime: 'nodejs22',
    serviceAccount: 'projects/movie-hub-62459/serviceAccounts/movie-hub-tv-build@movie-hub-62459.iam.gserviceaccount.com' },
  serviceConfig: {
    serviceAccountEmail: 'movie-hub-tv-final@movie-hub-62459.iam.gserviceaccount.com',
    service: 'projects/movie-hub-62459/locations/europe-west3/services/moviehubtvfinalreminder',
    uri: 'https://moviehubtvfinalreminder-12345-ew.a.run.app',
  },
}
describe('#382 private HTTP transport and deploy safety', () => {
  it('rejects unneeded HTTP methods without querying Firestore', async () => {
    const run = vi.fn()
    const { req, res } = mock('GET')
    await createTvFinalHttpHandler({ run, getDb: () => ({}) })(req, res)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(run).not.toHaveBeenCalled()
  })
  it('runs exactly one bounded worker, without using request payload', async () => {
    const run = vi.fn().mockResolvedValue({ considered: 1, finalCreated: 1, failed: 0 })
    const getDb = vi.fn().mockReturnValue({ marker: 'db' })
    const logger = { info: vi.fn(), error: vi.fn() }
    const { req, res } = mock()
    req.body = { project: 'untrusted', time: -1 }
    await createTvFinalHttpHandler({ run, getDb, clock: () => 123, logger })(req, res)
    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith({ db: { marker: 'db' }, now: 123 })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
    expect(logger.info).toHaveBeenCalledOnce()
  })
  it('returns a generic error on Firestore failure and does not claim success', async () => {
    const { req, res } = mock()
    const logger = { info: vi.fn(), error: vi.fn() }
    await createTvFinalHttpHandler({
      run: async () => { throw Error('secret private watch id') },
      getDb: () => ({}), logger,
    })(req, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toBe('Internal Server Error')
    expect(res.body).not.toContain('watch id')
    expect(logger.error).toHaveBeenCalledOnce()
  })
  it('checks the private function target, identities, and bound URL before scheduling', () => {
    expect(checkTvFunction(validFunction)).toMatchObject({
      runService: 'moviehubtvfinalreminder', uri: validFunction.serviceConfig.uri,
    })
    expect(() => checkTvFunction({ ...validFunction, buildConfig: { runtime: 'nodejs22' } })).toThrow()
    expect(() => checkTvFunction({ ...validFunction, serviceConfig: {
      ...validFunction.serviceConfig, serviceAccountEmail: '612913221205-compute@developer.gserviceaccount.com',
    } })).toThrow()
    expect(() => checkTvFunction({ ...validFunction, serviceConfig: {
      ...validFunction.serviceConfig, uri: 'http://untrusted.invalid/',
    } })).toThrow()
    expect(() => checkTvFunction({ ...validFunction, serviceConfig: {
      ...validFunction.serviceConfig, uri: 'https://untrusted.example',
    } })).toThrow()
    expect(() => checkTvFunction({ ...validFunction, serviceConfig: {
      ...validFunction.serviceConfig, uri: validFunction.serviceConfig.uri + '/unexpected-path',
    } })).toThrow()
    expect(() => checkTvFunction({ ...validFunction, serviceConfig: {
      ...validFunction.serviceConfig,
      service: 'projects/another-project/locations/europe-west3/services/moviehubtvfinalreminder',
    } })).toThrow()
  })
})
