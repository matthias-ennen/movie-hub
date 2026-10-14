import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret, defineString } from 'firebase-functions/params'
import { cloudEvent, http } from '@google-cloud/functions-framework'
import { createResendTransport } from './server/email/transport.mjs'
import { createEmailTokens } from './server/email/tokens.mjs'
import { createEmailService } from './server/email/service.mjs'
import { createEmailActionHandler, createEmailRetryHandler } from './server/email/http.mjs'
import { mailEventIdentity } from './server/email/eventIdentity.mjs'

initializeApp()
const apiKey = defineSecret('RESEND_API_KEY')
const tokenKey = defineSecret('MOVIE_HUB_EMAIL_TOKEN_KEY')
// Dedicated least-privilege service account must be provisioned before deploy.
const identity = defineString('MOVIE_HUB_EMAIL_SERVICE_ACCOUNT')
const region = defineString('MOVIE_HUB_EMAIL_REGION', { default: 'europe-west3' })
const options = { region, serviceAccount: identity, secrets: [apiKey, tokenKey],
  maxInstances: 1, concurrency: 1, timeoutSeconds: 120, memory: '256MiB' }
function service() {
  const env = { ...process.env, RESEND_API_KEY: apiKey.value(), MOVIE_HUB_EMAIL_TOKEN_KEY: tokenKey.value() }
  const transport = createResendTransport(env)
  return createEmailService({ db: getFirestore(), auth: getAuth(), transport,
    tokens: transport.enabled ? createEmailTokens(env.MOVIE_HUB_EMAIL_TOKEN_KEY) : null,
    appUrl: env.MOVIE_HUB_EMAIL_APP_URL, actionUrl: env.MOVIE_HUB_EMAIL_ACTION_URL })
}
export const profileEmailPreferences = onDocumentWritten({ ...options, retry: true,
  document: 'users/{uid}/profiles/{profileId}/emailPreferences/current' },
async (event) => {
  const { uid, profileId } = mailEventIdentity(event, 'preferences')
  await service().reconcile(uid, profileId)
})
export const profileEmailNotification = onDocumentWritten({ ...options, retry: true,
  document: 'users/{uid}/profiles/{profileId}/notifications/{eventId}' },
async (event) => {
  const { uid, profileId, eventId } = mailEventIdentity(event, 'notification')
  await service().enqueueNotification(uid, profileId, eventId)
})
// Scheduler and per-service invocation grants are provisioned separately.
export const profileEmailRetry = onRequest({ ...options, invoker: 'private', cors: false },
createEmailRetryHandler(service))
export const profileEmailAction = onRequest({ ...options, invoker: 'private', cors: false },
async (req, res) => createEmailActionHandler(service())(req, res))

// gcloud's Functions Framework loader does not infer Firebase __endpoint metadata.
// Explicit signatures make the HTTP envelope become a CloudEvent before the SDK
// extracts document captures. Keep HTTP action/retry handlers explicitly HTTP.
cloudEvent('profileEmailPreferences', profileEmailPreferences)
cloudEvent('profileEmailNotification', profileEmailNotification)
http('profileEmailRetry', profileEmailRetry)
http('profileEmailAction', profileEmailAction)
