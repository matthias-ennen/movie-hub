// HTTP transport only. Authentication is enforced by Cloud Run IAM, never by a client token.
// No provider imports, personal data in responses, or background schedule in this module.
export function createTvFinalHttpHandler({ run, getDb, clock = Date.now, logger = console } = {}) {
  if (typeof run !== 'function' || typeof getDb !== 'function' || typeof clock !== 'function') {
    throw new TypeError('TV final HTTP handler requires a runner and Firestore factory')
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    try {
      const summary = await run({ db: getDb(), now: clock() })
      logger.info('moviehub_tv_final_reminders', JSON.stringify(summary))
      res.statusCode = 204
      res.end()
    } catch (error) {
      logger.error('moviehub_tv_final_reminders_failed', error)
      // Do not expose Firestore, watch IDs, or other internals to the caller.
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }
}
