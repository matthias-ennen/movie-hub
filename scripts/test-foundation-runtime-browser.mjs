import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modulePath = process.env.MOVIE_HUB_PLAYWRIGHT_MODULE
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright')
const epoch = Date.parse('2026-10-31T10:00:00Z')
const ui = `import {useEffect} from 'react';
export default function View(p){window.__tvProps=p;
useEffect(()=>{if(p.heroReadyEnabled)p.onHeroReady()},[p.heroReadyEnabled,p.onHeroReady]);
return <><button id="all-days" onClick={()=>p.onPeriodChange('14-days')}>14 Tage</button>
<button id="today" onClick={()=>p.onPeriodChange('day:2026-10-31')}>Heute</button>
<button id="tomorrow" onClick={()=>p.onPeriodChange('day:2026-11-01')}>Morgen</button>
<div id="status">{p.status}</div><div id="rows" data-count={p.rows.length}>{p.rows.map(r=><section key={r.id}>{r.items.map(i=><span key={i.id} data-title={i.tmdbId} data-soon={String(i.tvAiringSoon)} data-on-air={String(i.tvAiringOnAir)}>{i.title}</span>)}</section>)}</div></>}`
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import TvFeature from '/src/tv/TvFeature.jsx';import {ProgressiveRows} from '/src/components/ProgressiveContent.jsx';
import {useDpadNavigation} from '/src/hooks/useDpadNavigation.js';
import {runtimeClock} from '/src/performance/runtimeClock.js';
import {capturePosterAnchor,restorePosterAnchor} from '/src/navigation/posterFocus.js';
const empty=[],station={id:'zdf',name:'ZDF'},catalog={status:'ready',stations:[station]},providers=['waipu'];
window.advance=t=>{window.__now=t;runtimeClock.refresh('test')};
window.captureAnchor=()=>capturePosterAnchor(document.activeElement);window.restoreAnchor=restorePosterAnchor;
const item=id=>({id,tmdbId:id.charCodeAt(0),type:'movie',title:id,posterUrl:'/fixture.svg',providerIds:[]});
const row=(id,ids)=>({id,title:id,variant:'tv',items:ids.map(item)});
function Rows(){const [rows,setRows]=useState([row('first',['a','b','c']),row('second',['d','e','f'])]);
window.changeRows=spec=>setRows(spec.map(([id,ids])=>row(id,ids)));useDpadNavigation({onBack:()=>false});
return <><button id="outside">Außerhalb</button><ProgressiveRows rows={rows} heroReady={true} onOpen={()=>{}} /></>}
const mode=new URL(location.href).searchParams.get('mode');
createRoot(document.getElementById('root')).render(mode==='focus'?<Rows/>:<TvFeature waipuStationCatalog={catalog} joynStationCatalog={catalog}
 disabledWaipuStationIds={empty} disabledJoynStationIds={empty} enabledProviderIds={providers}
 stationSelectionLoading={false} joynStationSelectionLoading={false} liveAvailabilityEntries={empty}/>);`
const mocks = new Map([
  [resolve(root, 'src/components/TvView.jsx'), ui],
  [resolve(root, 'src/settings/useProviderSelection.js'), `const state={enabledProviderIds:['waipu'],loading:false,isProviderEnabled:()=>true};export const useProviderSelection=()=>state;`],
  [resolve(root, 'src/library/useSharedMediaCatalog.js'), `const state={entries:[],hasTitle:()=>false,loading:false};export const useSharedMediaCatalog=()=>state;`],
])
const server = await createServer({ root, configFile: false,
  plugins: [{ name: 'foundation-runtime-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/foundation-probe.jsx') return resolve(root, 'foundation-probe.jsx') },
    load(id) { return id === resolve(root, 'foundation-probe.jsx') ? entry : mocks.get(id.split('?')[0]) ?? null },
    configureServer(s) { s.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/foundation-probe') return next()
      s.transformIndexHtml('/foundation-probe', `<div id="root"></div>
<style>body{margin:0}.content-row{height:390px}.poster-track{display:flex;overflow:auto;gap:20px;width:900px}.poster-card{flex:0 0 180px;height:270px}.poster-image{width:160px;height:180px}.poster-copy{display:block}.row-heading{height:50px}</style>
<script type="module" src="/foundation-probe.jsx"></script>`).then((html) => { res.setHeader('Content-Type', 'text/html'); res.end(html) })
    }) },
  }, react()], server: { host: '127.0.0.1', port: 0 },
})
const airing = { providerIds: ['waipu'], providerStationIds: { waipu: 'zdf' }, stationId: 'zdf', stationName: 'ZDF',
  startTime: new Date(epoch + 3600000 + 10000).toISOString(), stopTime: new Date(epoch + 7200000).toISOString() }
const summary = { schemaVersion: 1, kind: 'moviehub-tv-14-day-summary', generatedAt: new Date(epoch).toISOString(),
  entries: [{ tmdbId: 1, type: 'movie', title: 'Zeitgrenze', genreIds: [28], airingOptions: [airing], primeTimeOptions: [] }] }
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, args: JSON.parse(process.env.MOVIE_HUB_BROWSER_ARGS || '[]'),
    ...(process.env.MOVIE_HUB_CHROMIUM_PATH ? { executablePath: process.env.MOVIE_HUB_CHROMIUM_PATH } : {}),
  })
  for (const mode of ['unavailable', 'summary-clock', 'day-clock', 'focus']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    const errors = []; let summaryRequests = 0; let dayRequests = 0
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript((time) => { window.__now = time; Date.now = () => window.__now }, epoch)
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      if (url.pathname === '/fixture.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="270"><rect width="180" height="270" fill="blue"/></svg>' })
      if (url.pathname === '/tv-runtime/hero.json') return route.fulfill({ json: { schemaVersion: 1, kind: 'moviehub-tv-runtime-hero', generatedAt: new Date(epoch).toISOString(), entries: [] } })
      if (url.pathname === '/tv-runtime/index.json') return route.fulfill({ json: { schemaVersion: 1, kind: 'moviehub-tv-runtime-index', generatedAt: new Date(epoch).toISOString(), days: mode === 'day-clock' ? [{key:'2026-10-31'}, {key:'2026-11-01'}] : [] } })
      if (url.pathname.startsWith('/tv-runtime/days/')) {
        dayRequests += 1
        const key = url.pathname.split('/').pop().slice(0, 10)
        if (key === '2026-11-01') await new Promise(resolve => setTimeout(resolve, 300))
        const nextDay = key === '2026-11-01'
        const dayAiring = nextDay ? { ...airing, startTime:'2026-11-01T11:00:00Z', stopTime:'2026-11-01T12:00:00Z' } : airing
        return route.fulfill({ json: { schemaVersion:1, kind:'moviehub-tv-runtime-day', key,
          generatedAt:new Date(epoch).toISOString(), entries:[{key:`movie:${nextDay ? 2 : 1}`, tmdbId:nextDay ? 2 : 1,
            type:'movie', title:nextDay ? 'Morgenfilm' : 'Heute im TV', genreIds:[28], airings:[dayAiring]}] } })
      }
      if (url.pathname === '/tv-14-days-summary.json') {
        summaryRequests += 1
        await new Promise(resolve => setTimeout(resolve, 25))
        return mode === 'unavailable' ? route.fulfill({ status: 503, body: 'fixture unavailable' }) : route.fulfill({ json: summary })
      }
      return route.continue()
    })
    await page.goto(`${origin}/foundation-probe?mode=${mode}`)
    if (mode === 'unavailable') {
      await page.locator('#all-days').click()
      await page.waitForFunction(() => document.getElementById('status')?.textContent === 'unavailable')
      await page.waitForTimeout(1500)
      assert.equal(summaryRequests, 1, '503 must settle without a status-triggered retry loop')
      await page.locator('#today').click(); await page.locator('#all-days').click()
      await page.waitForFunction(() => document.getElementById('status')?.textContent === 'unavailable')
      assert.equal(summaryRequests, 2, 'explicitly reopening can retry once')
    } else if (mode === 'summary-clock') {
      await page.locator('#all-days').click()
      await page.waitForFunction(() => document.querySelector('[data-title="1"]')?.dataset.soon === 'false')
      await page.evaluate(time => window.advance(time), epoch + 11000)
      await page.waitForFunction(() => document.querySelector('[data-title="1"]')?.dataset.soon === 'true')
      await page.evaluate(time => window.advance(time), epoch + 3600000 + 11000)
      await page.waitForFunction(() => document.querySelector('[data-title="1"]')?.dataset.onAir === 'true')
      await page.evaluate(time => window.advance(time), epoch + 7200001)
      await page.waitForFunction(() => document.getElementById('rows')?.dataset.count === '0')
    } else if (mode === 'day-clock') {
      await page.waitForFunction(() => document.querySelector('[data-title="1"]')?.dataset.soon === 'true')
      await page.locator('#tomorrow').click()
      await page.waitForFunction(() => document.getElementById('status')?.textContent === 'loading')
      await page.locator('#today').click()
      await page.waitForTimeout(400)
      assert.equal(await page.locator('[data-title="2"]').count(), 0, 'late obsolete day must not replace current selection')
      await page.evaluate(time => window.advance(time), epoch + 3600000 + 11000)
      await page.waitForFunction(() => document.querySelector('[data-title="1"]')?.dataset.onAir === 'true')
      await page.evaluate(time => window.advance(time), epoch + 7200001)
      await page.waitForFunction(() => document.getElementById('rows')?.dataset.count === '0')
      await page.evaluate(time => window.advance(time), Date.parse('2026-11-01T05:00:00.001Z'))
      await page.waitForFunction(() => window.__tvProps.periodId === 'day:2026-11-01' || window.__tvProps.selectedPeriodId === 'day:2026-11-01')
      await page.waitForFunction(() => Boolean(document.querySelector('[data-title="2"]')))
      assert.ok(dayRequests <= 4, `unexpected request loop: ${dayRequests}`)
    } else {
      await page.locator('[data-poster-id="b"]').focus()
      await page.evaluate(() => window.changeRows([['first',['x','a','b','c']],['second',['d','e','f']]]))
      await page.waitForFunction(() => document.activeElement?.dataset.posterId === 'b' && document.activeElement.dataset.posterIndex === '2')
      await page.evaluate(() => window.changeRows([['first',['x','a','c']],['second',['d','e','f']]]))
      await page.waitForFunction(() => document.activeElement?.dataset.posterId === 'c')
      await page.keyboard.press('ArrowLeft')
      await page.waitForFunction(() => document.activeElement?.dataset.posterId === 'a')
      await page.evaluate(() => { window.savedAnchor=window.captureAnchor(); document.getElementById('outside').focus(); window.changeRows([['first',['x','c']],['second',['d','e','f']]]) })
      await page.waitForFunction(() => document.querySelectorAll('[data-row-id="first"] .poster-card').length === 2)
      assert.equal(await page.evaluate(() => document.activeElement.id), 'outside', 'updates must not steal focus from other controls')
      await page.evaluate(() => window.restoreAnchor(window.savedAnchor))
      await page.waitForFunction(() => document.activeElement?.dataset.posterId === 'c')
      await page.evaluate(() => window.changeRows([['second',['d','e','f']]]))
      await page.waitForFunction(() => ['d','e','f'].includes(document.activeElement?.dataset.posterId))
      await page.evaluate(() => window.changeRows([['second',Array.from({length:65},(_,i)=>`item-${i}`)]]))
      for (const index of [7, 19, 31]) {
        await page.locator(`[data-poster-id="item-${index}"]`).focus()
      }
      await page.locator('[data-poster-id="item-45"]').waitFor()
      await page.locator('[data-poster-id="item-45"]').focus()
      await page.evaluate(() => window.changeRows([['second',Array.from({length:64},(_,i)=>`item-${i+1}`)]]))
      await page.waitForFunction(() => document.activeElement?.dataset.posterId === 'item-45' && document.activeElement.dataset.posterIndex === '44')
    }
    assert.deepEqual(errors, [], `${mode}: browser errors`)
    console.log(`PASS ${mode}${mode === 'unavailable' ? ` (${summaryRequests} requests, including explicit retry)` : ''}`)
    await page.close()
  }
} finally { await browser?.close(); await server.close() }
