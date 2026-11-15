/** Private cache/handoff gates: scheduled work is allowed only in the verified
 * central reusable deploy job; manual opt-in retains its original main guard. */
export function isTrustedCentralNightlyEvent(env=process.env){
  return env.GITHUB_REF==='refs/heads/main' &&
    (env.GITHUB_EVENT_NAME==='workflow_dispatch' ||
      (env.GITHUB_EVENT_NAME==='schedule' && env.MOVIEHUB_TRUSTED_CENTRAL_NIGHTLY==='true'))
}
