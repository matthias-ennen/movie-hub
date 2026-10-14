import { isValidEmailAddress } from '../../src/notifications/profileEmailModel.js'

export class EmailTransportError extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable }
}

export function createResendTransport(env = {}, fetchImpl = globalThis.fetch) {
  const liveAfter = Date.parse(env.MOVIE_HUB_EMAIL_LIVE_AFTER || '')
  const from = String(env.MOVIE_HUB_EMAIL_FROM || '')
  const address = from.match(/^MovieHub <([^<>]+)>$/)?.[1]
  const key = String(env.RESEND_API_KEY || '')
  const enabled = env.MOVIE_HUB_EMAIL_ENABLED === 'true' && isValidEmailAddress(address)
    && key.startsWith('re_') && Number.isFinite(liveAfter)
    && String(env.MOVIE_HUB_EMAIL_TOKEN_KEY || '').length >= 32
  return {
    enabled: Boolean(enabled), liveAfter, from,
    async send({ to, subject, html, text, idempotencyKey, sender = from }) {
      if (!enabled) throw new EmailTransportError('mail-disabled')
      if (!isValidEmailAddress(to) || typeof subject !== 'string' || /[\r\n]/.test(subject)
        || subject.length > 240 || typeof html !== 'string' || typeof text !== 'string'
        || html.length > 50000 || text.length > 12000 || sender !== from
        || !/^[a-zA-Z0-9:_-]{1,256}$/.test(idempotencyKey || '')) {
        throw new EmailTransportError('invalid-mail')
      }
      let response
      try {
        response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ from, to: [to], subject, html, text }),
        })
      } catch { throw new EmailTransportError('mail-network', true) }
      // Never log/return provider bodies: they may contain recipients or keys.
      if (!response.ok) throw new EmailTransportError(`mail-http-${response.status}`,
        response.status === 409 || response.status === 429 || response.status >= 500)
      let data
      try { data = await response.json() } catch { throw new EmailTransportError('mail-response', true) }
      if (typeof data.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(data.id)) {
        throw new EmailTransportError('mail-response', true)
      }
      return { providerId: data.id } // Accepted by provider, NOT proof of delivery.
    },
  }
}
