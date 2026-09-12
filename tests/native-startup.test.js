import { describe, expect, it, vi } from 'vitest'
import { notifyNativeStartupReady } from '../src/performance/nativeStartup.js'

describe('nativer Kaltstart-Handshake', () => {
  it('meldet die fertige Home-Oberfläche an die Android-Hülle', () => {
    const notifyStartupReady = vi.fn()

    expect(notifyNativeStartupReady({ notifyStartupReady })).toBe(true)
    expect(notifyStartupReady).toHaveBeenCalledOnce()
  })

  it('bleibt in normalen Browsern wirkungslos', () => {
    expect(notifyNativeStartupReady({})).toBe(false)
  })
})
