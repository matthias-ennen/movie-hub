// Local browser regression of the actual rendered poster markup and styles.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
let browser
try {
  const { default: PosterCard } = await vite.ssrLoadModule('/src/components/PosterCard.jsx')
  const { default: ProviderBadges } = await vite.ssrLoadModule('/src/components/ProviderBadges.jsx')
  const { resolvePosterProviderModel } = await vite.ssrLoadModule('/src/providers/posterProviderModel.js')
  const css = [readFileSync('src/styles/tokens.css', 'utf8'), ...Array.from(
    readFileSync('src/main.jsx', 'utf8').matchAll(/^import ['"]\.\/(.*\.css)['"]/gm),
    ([, path]) => readFileSync(`src/${path}`, 'utf8').replace(/^@import.*?;\s*/m, ''),
  )].join('\n')
  const airing = {
    stationId: 'zdf', stationName: 'ZDF', providerIds: ['air-zdf', 'waipu', 'joyn'],
    startTime: new Date(Date.now() + 3600000).toISOString(),
    stopTime: new Date(Date.now() + 7200000).toISOString(),
  }
  const movie = { type: 'movie', tmdbId: 42, id: 'movie-42', title: 'Testfilm', year: 2026, tvAiring: airing }
  const cases = [0, 1, 2, 4].map(extra => ({ ...movie, tmdbProviderOffers: [
    { id: 'joyn', offerTypes: ['flatrate'] }, { id: 'netflix', offerTypes: ['flatrate'] },
    { id: 'prime', offerTypes: ['buy'] }, { id: 'disney', offerTypes: ['flatrate'] },
  ].slice(0, extra) }))
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox'] })
  const page = await browser.newPage()
  for (const theme of ['midnight', 'compact', 'bright']) {
    for (const width of [360, 768, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      const cards = cases.map((item, i) => `<div class="fixture"><p>${i === 3 ? '7' : i + 3} Angebote</p>${renderToStaticMarkup(
        createElement(PosterCard, { item, onOpen: () => {}, rank: null }),
      )}</div>`).join('')
      const collection = renderToStaticMarkup(createElement(ProviderBadges,
        { item: cases[2], model: resolvePosterProviderModel(cases[2]) }))
      await page.setContent(`<html data-theme="${theme}"><style>${css}\n.fixture{width:var(--poster-track-width);margin:16px;display:inline-block}.collection-part-card{width:var(--poster-track-width);height:160px;position:relative;margin:16px}</style><body>${cards}<div class="collection-part-card"><div class="collection-part-art">${collection}</div></div></body></html>`)
      const results = await page.locator('.poster-card').evaluateAll(cards => cards.map(card => {
        const row = card.querySelector('.provider-badges')
        const stack = row.querySelector('.provider-badge-stack')
        const b = stack?.getBoundingClientRect()
        const bounds = card.getBoundingClientRect()
        const before = stack ? getComputedStyle(stack, '::before') : null
        const after = stack ? getComputedStyle(stack, '::after') : null
        const matrix = after?.content !== 'none' ? after?.transform : before?.transform
        const dx = matrix && matrix !== 'none' ? new DOMMatrixReadOnly(matrix).m41 : 0
        return { badges: row.querySelectorAll('.provider-badge').length,
          layers: stack ? Number(stack.dataset.stackDepth) : 0,
          before: before?.content === '""', after: after?.content === '""',
          overflow: b ? Math.max(0, b.right + dx - bounds.right) : 0,
          focusTargets: card.querySelectorAll('button, [tabindex], [data-focusable]').length,
        }
      }))
      assert.deepEqual(results.map(r => [r.badges, r.layers, r.before, r.after, r.focusTargets]), [
        [3, 0, false, false, 0], [3, 1, true, false, 0], [3, 2, true, true, 0], [3, 2, true, true, 0],
      ])
      assert.equal(await page.locator('.collection-part-card [data-stack-depth="2"]').count(), 1)
      assert.ok(results.every(r => r.overflow < 1), `Stack outside poster in ${theme} ${width}: ${JSON.stringify(results)}`)
      console.log(theme, width, results.map(r => Number(r.overflow.toFixed(1))))
      if (theme === 'midnight' && width === 1920 && process.env.BADGE_STACK_SCREENSHOT) {
        await page.screenshot({ path: process.env.BADGE_STACK_SCREENSHOT })
      }
    }
  }
} finally {
  await browser?.close()
  await vite.close()
}
