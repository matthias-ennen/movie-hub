import { describe, expect, it, vi } from 'vitest'
import { inspect } from 'node:util'
import { accountFailure } from '../server/email/accountFailure.mjs'
import { createEmailService } from '../server/email/service.mjs'

describe('private Firebase account failure diagnostics', () => {
  it('retains a recognized SDK code, HTTP status and structured reason without the response', () => {
    const error = Object.assign(Error('Request for private-uid / private@example.org failed'), {
      code: 'auth/internal-error',
      httpResponse: { status: 403, headers: { Authorization: 'secret-header' }, data: {
        error: { status: 'PERMISSION_DENIED', message: 'Permission serviceusage.services.use denied for private-uid',
          details: [{ reason: 'USER_PROJECT_DENIED', metadata: { consumer: 'private-project' } }] },
        privateAccount: 'private@example.org',
      } },
      cause: Error('secret-cause'), toJSON: () => { throw Error('Must not serialize the SDK error') },
    })
    const safe = accountFailure(error)
    expect(safe.message).toBe('mail-account-unavailable sdk=auth/internal-error http=403 hints=USER_PROJECT_DENIED,PERMISSION_DENIED,serviceusage.services.use')
    expect(inspect(safe)).not.toMatch(/private-|private@|secret-/)
    expect(safe.cause).toBeUndefined()
    expect(safe.httpResponse).toBeUndefined()
  })
  it('identifies API, scope and known permission hints even when SDK messages are generic', () => {
    for (const reason of ['SERVICE_DISABLED', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'IAM_PERMISSION_DENIED']) {
      const error = { code: 'auth/insufficient-permission', httpResponse: { status: 403, data: { error: {
        details: [{ reason, metadata: { permission: 'firebaseauth.users.get' } }],
      } } } }
      expect(accountFailure(error).message).toBe(`mail-account-unavailable sdk=auth/insufficient-permission http=403 hints=${reason},firebaseauth.users.get`)
    }
  })
  it('keeps credential and network failures distinguishable without echoing their messages', () => {
    for (const code of ['auth/invalid-credential', 'auth/invalid-uid', 'auth/project-not-found', 'app/network-error']) {
      expect(accountFailure({ code, message: 'secret-token' }).message)
        .toBe(`mail-account-unavailable sdk=${code} http=unknown hints=unknown`)
    }
  })
  it('fails closed for unknown codes, unexpected response shapes and absent errors', () => {
    const circular = { code: 'private@example.org', message: 'secret-token', httpResponse: {
      status: '403 secret-token', data: { error: { status: 'private-status', details: 'private-details' } },
    } }
    circular.cause = circular
    for (const error of [circular, undefined, null, 'private@example.org']) {
      expect(accountFailure(error).message).toBe('mail-account-unavailable sdk=unknown http=unknown hints=unknown')
    }
  })
})

describe('account validation before confirmation work', () => {
  const setup = (getUser) => {
    const db = { doc: vi.fn(), runTransaction: vi.fn() }
    const transport = { enabled: true, send: vi.fn() }
    const service = createEmailService({ db, auth: { getUser }, transport, tokens: {},
      appUrl: 'https://app.example.org', actionUrl: 'https://action.example.org' })
    return { service, db, transport }
  }
  it('throws only the safe diagnostic and does not create or send a confirmation on Auth failure', async () => {
    const getUser = vi.fn().mockRejectedValue(Object.assign(Error('private@example.org secret-token'), {
      code: 'auth/insufficient-permission', httpResponse: { status: 403 },
    }))
    const { service, db, transport } = setup(getUser)
    await expect(service.reconcile('private-uid', 'main')).rejects
      .toThrow('mail-account-unavailable sdk=auth/insufficient-permission http=403 hints=unknown')
    expect(getUser).toHaveBeenCalledExactlyOnceWith('private-uid')
    expect(db.doc).not.toHaveBeenCalled(); expect(db.runTransaction).not.toHaveBeenCalled()
    expect(transport.send).not.toHaveBeenCalled()
  })
  it('continues to skip missing and disabled accounts without a confirmation', async () => {
    for (const getUser of [vi.fn().mockRejectedValue({ code: 'auth/user-not-found' }),
      vi.fn().mockResolvedValue({ disabled: true })]) {
      const { service, db, transport } = setup(getUser)
      expect(await service.reconcile('private-uid', 'main')).toBeNull()
      expect(db.doc).not.toHaveBeenCalled(); expect(db.runTransaction).not.toHaveBeenCalled()
      expect(transport.send).not.toHaveBeenCalled()
    }
  })
})
