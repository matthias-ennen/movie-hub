import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/seasonal-atmosphere.css', import.meta.url), 'utf8')

function rule(selector) {
  const start = css.indexOf(selector + ' {')
  expect(start, `Missing rule: ${selector}`).toBeGreaterThanOrEqual(0)
  const body = css.slice(start + selector.length + 2)
  return body.slice(0, body.indexOf('}'))
}

const cinematic = ":root[data-season-enabled='true'][data-season-media='cinematic']"
const fixedBackdrop = `${cinematic} .hero-first-page[data-content-page]::before`

describe('#484 viewport-fixed seasonal backdrop without giant poster-row scaling', () => {
  it('prevents each tall poster container from owning the cinematic wallpaper', () => {
    const rows = css.slice(
      css.indexOf(`${cinematic} [data-content-page] > .rows-wrap,`),
    )
    expect(rows.split('}')[0]).toContain('background-image: none;')
    expect(rows.split('}')[0]).not.toMatch(/background-size:\\s*cover/)
  })

  it('uses one fixed pointer-free layer behind the actual content', () => {
    expect(rule(`${cinematic} .hero-first-page[data-content-page]`))
      .toContain('isolation: isolate;')
    const backdrop = rule(fixedBackdrop)
    expect(backdrop).toContain("content: '';")
    expect(backdrop).toContain('position: fixed;')
    expect(backdrop).toContain('z-index: -1;')
    expect(backdrop).toContain('pointer-events: none;')
    expect(backdrop).toContain('var(--season-wallpaper)')
    expect(backdrop).toContain('background-repeat: no-repeat;')
    expect(backdrop).toContain('min(100vw, 1600px) auto;')
    expect(backdrop).not.toMatch(/background-size:\\s*cover/)
    expect(backdrop).not.toMatch(/animation|transition|will-change/)
  })

  it('keeps legacy SVG background behavior and corner artwork unchanged', () => {
    const legacy = css.slice(
      css.indexOf(":root[data-season-enabled='true'] [data-content-page] > .rows-wrap,"),
    ).split('}')[0]
    expect(legacy).toContain('background-image: var(--season-wallpaper);')
    expect(legacy).toContain('background-repeat: repeat-y;')
    expect(css).toContain('.detail-layout-panel::after')
    expect(css).not.toContain('background-attachment: fixed;')
  })
})
