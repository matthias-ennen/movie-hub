import { describe, expect, it } from 'vitest'
import { stableVendorChunk } from '../vite.config.js'

describe('stable vendor chunking', () => {
  it('separates React runtime into a stable chunk', () => {
    expect(stableVendorChunk('/repo/node_modules/react/index.js')).toBe('vendor-react')
    expect(stableVendorChunk('/repo/node_modules/react-dom/client.js')).toBe('vendor-react')
    expect(stableVendorChunk('/repo/node_modules/scheduler/index.js')).toBe('vendor-react')
  })

  it('separates Firebase and TanStack dependencies', () => {
    expect(stableVendorChunk('/repo/node_modules/firebase/auth/dist/index.esm.js')).toBe('vendor-firebase')
    expect(stableVendorChunk('/repo/node_modules/@firebase/firestore/dist/index.esm.js')).toBe('vendor-firebase')
    expect(stableVendorChunk('/repo/node_modules/@tanstack/react-virtual/dist/esm/index.js')).toBe('vendor-tanstack')
  })

  it('leaves application and unrelated modules to Rollup', () => {
    expect(stableVendorChunk('/repo/src/App.jsx')).toBeUndefined()
    expect(stableVendorChunk('/repo/node_modules/saxes/saxes.js')).toBeUndefined()
  })
})
