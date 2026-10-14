// Firebase SDK errors may carry account records, response bodies and credentials.
// Emit only constants from these allowlists; never attach the original as cause.
const codes = new Set([
  'auth/insufficient-permission', 'auth/internal-error', 'auth/invalid-credential',
  'auth/invalid-uid', 'auth/invalid-argument', 'auth/argument-error', 'auth/project-not-found',
  'auth/invalid-project-id', 'auth/quota-exceeded', 'auth/too-many-requests', 'auth/configuration-not-found',
  'app/invalid-credential', 'app/network-error', 'app/network-timeout',
])
const reasons = ['SERVICE_DISABLED', 'USER_PROJECT_DENIED', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
  'IAM_PERMISSION_DENIED', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'RESOURCE_EXHAUSTED']
const permissions = ['firebaseauth.users.get', 'serviceusage.services.use']
const statuses = new Set([400, 401, 403, 404, 408, 429, 500, 502, 503, 504])

export function accountFailure(error) {
  const response = error?.httpResponse
  const remote = response?.data?.error
  const details = Array.isArray(remote?.details) ? remote.details : []
  const message = [error?.message, remote?.message].filter((value) => typeof value === 'string').join(' ')
  const hints = [
    ...reasons.filter((reason) => remote?.status === reason || details.some((item) => item?.reason === reason)
      || message.includes(reason)),
    ...permissions.filter((permission) => message.includes(permission)
      || details.some((item) => item?.metadata?.permission === permission)),
  ]
  return new Error(`mail-account-unavailable sdk=${codes.has(error?.code) ? error.code : 'unknown'}`
    + ` http=${statuses.has(response?.status) ? response.status : 'unknown'} hints=${hints.join(',') || 'unknown'}`)
}
