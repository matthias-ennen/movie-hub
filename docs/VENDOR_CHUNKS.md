# Vendor chunk strategy

Movie Hub uses long-lived immutable caching for Vite's content-hashed assets. To make that cache useful across normal application deploys, large stable third-party runtimes are emitted separately from the frequently changing application chunk.

Current explicit vendor chunks:

- `vendor-react`: React, React DOM and Scheduler;
- `vendor-firebase`: Firebase and `@firebase/*` runtime modules;
- `vendor-tanstack`: TanStack virtualisation packages.

The application bundle and small unrelated dependencies remain under Rollup/Vite's normal chunking. This avoids a single catch-all vendor bundle that would be invalidated by any small dependency change.

This split is a cache/deploy optimisation, not a claim that the initial cold-start byte count disappears: React and Firebase are still required during startup. The benefit is that unchanged framework chunks keep the same content hash and can be reused from the immutable Hosting cache across application-only deploys.
