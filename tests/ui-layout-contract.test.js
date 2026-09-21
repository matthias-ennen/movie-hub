import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const responsiveCss = readFileSync(new URL('../src/styles/issue128.css', import.meta.url), 'utf8')

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || ''
}

describe('responsiver Hero-Aktionsbereich', () => {
  it('verwendet drei gleich große, nicht umbrechende Spalten', () => {
    const actions = cssRule(indexCss, '.hero-actions')
    const buttons = cssRule(indexCss, '.hero-actions .action-button')

    expect(actions).toContain('display: grid')
    expect(actions).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(actions).toContain('width: min(100%, 36rem)')
    expect(buttons).toContain('width: 100%')
    expect(buttons).toContain('white-space: nowrap')
  })

  it('reduziert auf schmalen Ansichten Abstand, Polster und Schrift kontrolliert', () => {
    const buttons = cssRule(responsiveCss, '.hero-carousel .action-button')

    expect(buttons).toContain('min-height: 44px')
    expect(buttons).toContain('padding: 0.7rem clamp(0.3rem, 1.6vw, 0.8rem)')
    expect(buttons).toContain('font-size: clamp(0.76rem, 2.2vw, 0.9rem)')
  })
})
