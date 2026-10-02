import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const responsiveCss = readFileSync(new URL('../src/styles/issue128.css', import.meta.url), 'utf8')
const tokensCss = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const notificationsCss = readFileSync(new URL('../src/styles/notifications.css', import.meta.url), 'utf8')
const heroBoundaryCss = readFileSync(new URL('../src/styles/issue128-hero-boundary.css', import.meta.url), 'utf8')
const tvCss = readFileSync(new URL('../src/styles/tv.css', import.meta.url), 'utf8')

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


describe('einheitlicher Seitenstart unter der Hauptnavigation', () => {
  it('reduziert den bisherigen halben page-block-Abstand um 60 Prozent', () => {
    const root = cssRule(tokensCss, ':root')
    expect(root).toContain('--page-start-gap: calc(var(--page-block) * 0.2)')
  })

  it('wendet den Abstand beim Hero genau einmal am statischen Seitenkopf an', () => {
    expect(cssRule(indexCss, '.hero-first-page > .hero-carousel'))
      .toContain('padding-top: 0')
    expect(cssRule(heroBoundaryCss, '.hero-carousel-eyebrow'))
      .toContain('padding: var(--page-start-gap) var(--page-inline) 0.75rem')
  })

  it('verwendet denselben Seitenstart für Suche, Profil und Über auch in responsiven Overrides', () => {
    expect(cssRule(indexCss, '.search-page'))
      .toContain('padding-top: var(--page-start-gap)')
    expect(cssRule(indexCss, '.profile-page'))
      .toContain('padding-top: var(--page-start-gap)')
    expect(cssRule(indexCss, '.about-page'))
      .toContain('padding-top: var(--page-start-gap)')
    expect(cssRule(responsiveCss, '.search-page'))
      .toContain('padding-top: var(--page-start-gap)')

    const responsiveProfileRules = responsiveCss.match(/\.profile-page,\s*\.about-page\s*\{[^}]*padding-top:\s*var\(--page-start-gap\);[^}]*\}/g) || []
    expect(responsiveProfileRules).toHaveLength(3)

    const responsiveSearchRules = responsiveCss.match(/\.search-page\s*\{[^}]*padding-top:\s*var\(--page-start-gap\);[^}]*\}/g) || []
    expect(responsiveSearchRules).toHaveLength(2)
  })

  it('verhindert zusätzliche harte Hero- und TV-Abstände auf kleineren Viewports', () => {
    expect(heroBoundaryCss).not.toContain('padding-top: 1.25rem')
    expect(heroBoundaryCss).not.toContain('padding: 1rem 1rem 0.65rem')
    expect(tvCss).not.toContain('padding-top: clamp(2rem, 4vh, 3rem)')
    expect(cssRule(tvCss, '.browse-page')).toContain('padding-top: var(--page-start-gap)')
  })

  it('richtet Mitteilungen an derselben linken Seitenkante aus', () => {
    const notifications = cssRule(notificationsCss, '.notification-page')
    expect(notifications).toContain('width: auto')
    expect(notifications).toContain('margin: var(--page-start-gap) var(--page-inline) 6rem')
    expect(notifications).not.toContain('auto 6rem')
  })
})
