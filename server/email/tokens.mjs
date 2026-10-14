import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const tokenHash = (token) => createHash('sha256').update(token).digest('hex')
export function createEmailTokens(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('mail-token-key-missing')
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url')
  return {
    issue(data) {
      const payload = Buffer.from(JSON.stringify({ version: 1, ...data })).toString('base64url')
      return `${payload}.${sign(payload)}`
    },
    read(token, now) {
      if (typeof token !== 'string' || token.length > 1800) throw new Error('invalid-link')
      const parts = token.split('.')
      const [payload, signature] = parts
      if (parts.length !== 2 || !/^[a-zA-Z0-9_-]+$/.test(payload || '')
        || !/^[a-zA-Z0-9_-]+$/.test(signature || '')) throw new Error('invalid-link')
      const expected = Buffer.from(sign(payload))
      const received = Buffer.from(signature)
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('invalid-link')
      let data
      try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch { throw new Error('invalid-link') }
      if (data.version !== 1 || !['confirm', 'unsubscribe'].includes(data.purpose)
        || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.uid || '')
        || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.profileId || '')
        || !Number.isSafeInteger(data.addressVersion) || data.addressVersion < 1
        || !Number.isSafeInteger(data.revision) || data.revision < 1
        || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now) throw new Error('invalid-link')
      return data
    },
  }
}
