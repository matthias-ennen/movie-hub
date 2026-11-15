import {expect,it} from 'vitest'
import { isTrustedCentralNightlyEvent } from '../scripts/trusted-central-nightly-event.mjs'
it('admits only main manual or trusted central scheduled runs',()=>{
  const main={GITHUB_REF:'refs/heads/main'}
  expect(isTrustedCentralNightlyEvent({...main,GITHUB_EVENT_NAME:'workflow_dispatch'})).toBe(true)
  expect(isTrustedCentralNightlyEvent({...main,GITHUB_EVENT_NAME:'schedule',MOVIEHUB_TRUSTED_CENTRAL_NIGHTLY:'true'})).toBe(true)
  for(const e of [
    {...main,GITHUB_EVENT_NAME:'schedule'},
    {...main,GITHUB_EVENT_NAME:'schedule',MOVIEHUB_TRUSTED_CENTRAL_NIGHTLY:'false'},
    {...main,GITHUB_EVENT_NAME:'push',MOVIEHUB_TRUSTED_CENTRAL_NIGHTLY:'true'},
    {GITHUB_REF:'refs/heads/other',GITHUB_EVENT_NAME:'schedule',MOVIEHUB_TRUSTED_CENTRAL_NIGHTLY:'true'},
  ])expect(isTrustedCentralNightlyEvent(e)).toBe(false)
})
