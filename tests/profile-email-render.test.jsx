import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ProfileEmailForm } from '../src/components/ProfileEmailSettings.jsx'

vi.mock('../src/lib/firebase.js', () => ({ firebaseReady: Promise.resolve({}) }))

const render = (props = {}) => renderToStaticMarkup(<ProfileEmailForm
  profile={{ role: 'primary', id: 'main' }} accountEmail="owner@example.org"
  ready={true} preferences={null} verification={null} error="" save={async () => {}} {...props} />)

describe('actual email profile form rendering', () => {
  it('renders an email input, off switch and TV-focusable save control', () => {
    const html = render()
    expect(html).toContain('type="email"')
    expect(html).toContain('value="owner@example.org"')
    expect(html).toContain('role="switch" aria-checked="false"')
    expect(html).toContain('Mitteilungen auch per E-Mail erhalten')
    expect(html).toMatch(/type="submit" data-focusable="true"/)
  })
  it('keeps member profiles empty and preserves deliberately cleared primary addresses', () => {
    expect(render({ profile: { role: 'member' } })).toContain('value=""')
    expect(render({ preferences: { email: '', enabled: false, revision: 1 } })).toContain('value=""')
  })
  it('keeps controls focusable but guarded on load/error and never claims an unsent confirmation arrived', () => {
    const loading = render({ ready: false })
    expect(loading).toContain('readOnly=""')
    expect(loading).toContain('aria-disabled="true"')
    expect(loading).not.toContain(' disabled=""')
    expect(render({ error: 'Ladefehler' })).toContain('Ladefehler')
    const preferences = { schemaVersion: 1, email: 'owner@example.org', enabled: true, revision: 1, addressVersion: 1 }
    expect(render({ preferences })).toContain('Die Bestätigung steht noch aus')
    expect(render({ preferences, verification: { status: 'pending', revision: 1, addressVersion: 1, expiresAt: Date.now() + 86400000 } })).toContain('wird vorbereitet')
    expect(render({ preferences, verification: { status: 'pending', revision: 0, addressVersion: 1, sentAt: Date.now(), expiresAt: Date.now() + 86400000 } })).not.toContain('zugesandten Link')
  })
})
