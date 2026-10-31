import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modulePath = process.env.MOVIE_HUB_PLAYWRIGHT_MODULE
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright')
const epoch = Date.parse('2026-10-31T10:00:00Z')
const checks = Object.fromEntries(['details','artwork','ageRating','credits','keywords','videos','providers','collection'].map(key => [key, 'present']))
const titles = Array.from({ length: 200 }, (_, i) => ({
  id: `movie-${i + 1}`, key: `movie:${i + 1}`, tmdbId: i + 1, type: 'movie',
  title: `Testfilm ${i + 1}`, description: 'Synthetischer Film für den Renderingtest.',
  genreIds: [28, 35], genreNames: ['Action', 'Komödie'], popularity: 200 - i,
  metadataVersion: 3, metadataComplete: true, metadataChecks: checks, collectionChecked: true,
  providerIds: ['waipu'], tvLive: { providerIds: ['waipu'] },
  posterUrl: `https://image.test/images/poster-${i}.svg`, backdropUrl: `https://image.test/images/hero-${i}.svg`,
  airings: [{ providerIds: ['waipu'], providerStationIds: { waipu: 'zdf' },
    providerProgramIds: { waipu: `program-${i}` }, programId: `program-${i}`, stationId: 'zdf', stationName: 'ZDF',
    startTime: '2026-10-31T09:00:00Z', stopTime: '2026-10-31T12:00:00Z',
    playbackRoutes: [{ providerId: 'waipu', mode: 'APP_DEEP_LINK', target: `waipu://program-${i}` }],
  }],
}))
const css = [...readFileSync(resolve(root, 'src/main.jsx'), 'utf8').matchAll(/import '(\.\/[^']+\.css)'/g)]
  .map(match => `import '/src/${match[1].slice(2)}';`).join('\n')
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import HeroFirstPage from '/src/components/HeroFirstPage.jsx';import {ProgressiveRows} from '/src/components/ProgressiveContent.jsx';
import TvFeature from '/src/tv/TvFeature.jsx';import SearchView from '/src/components/SearchView.jsx';
import ManagedImage from '/src/components/ManagedImage.jsx';
import {imageAdmission} from '/src/performance/imageAdmission.js';
import {useDpadNavigation} from '/src/hooks/useDpadNavigation.js';
import {installPerformanceDiagnostics} from '/src/performance/performanceDiagnostics.js';
${css}
installPerformanceDiagnostics();window.budget=imageAdmission.snapshot;
const titles=${JSON.stringify(titles)},empty=[],states={},providers=['waipu'];
const catalog={status:'ready',stations:[{id:'zdf',name:'ZDF'}]};
const labels={home:'Heute im Fokus',movies:'Filme',series:'Serien',library:'Meine Inhalte',tv:'TV'};
const rows=Array.from({length:12},(_,i)=>({id:'test-row-'+i,title:'Testreihe '+i,variant:'tv',items:titles}));
const activation={id:1,viewId:'tv',source:'nav'};
function Root(){const [mode,setMode]=useState(new URL(location.href).searchParams.get('mode')||'home');
const [ready,setReady]=useState(false),[image,setImage]=useState('a');
window.changePage=next=>{setReady(false);setMode(next)};window.setReady=setReady;window.changeImage=setImage;
useDpadNavigation({onBack:()=>false});
if(mode==='off')return <button id="off">Navigation</button>;
if(mode==='images')return <>{[image,'b','c'].map((id,i)=><ManagedImage key={i} id={'managed-'+i} src={'/images/stalled-'+id+'.svg'} loading="eager" onLoad={()=>{window.loaded=(window.loaded||[]).concat(id)}} />)}</>;
if(mode==='search')return <SearchView metadataTitles={titles} personalTitles={empty} statesByKey={states} actorNames={empty} fullTitles={titles} onOpen={()=>{}}/>;
if(mode==='real-tv')return <TvFeature waipuStationCatalog={catalog} joynStationCatalog={catalog}
 disabledWaipuStationIds={empty} disabledJoynStationIds={empty} enabledProviderIds={providers}
 stationSelectionLoading={false} joynStationSelectionLoading={false} liveAvailabilityEntries={empty}
 activationRequest={activation} onOpen={()=>{}}/>;
return <HeroFirstPage key={mode} pageId={mode} heroEyebrow={labels[mode]} heroItems={ready?[titles[0]]:empty} readyEnabled={ready} onOpen={()=>{}}>
{({heroReady})=><ProgressiveRows rows={rows} heroReady={heroReady} onOpen={()=>{}}/>}</HeroFirstPage>}
createRoot(document.getElementById('root')).render(<Root/>);
window.samples=[];let previous=-1;function sample(){const cards=document.querySelectorAll('.poster-card').length;
if(cards!==previous){window.samples.push({cards,at:performance.now()});previous=cards}requestAnimationFrame(sample)}requestAnimationFrame(sample);`
const mocks = new Map([
  [resolve(root, 'src/settings/useProviderSelection.js'), `const state={enabledProviderIds:['waipu'],loading:false,isProviderEnabled:()=>true};export const useProviderSelection=()=>state;`],
  [resolve(root, 'src/library/useSharedMediaCatalog.js'), `const state={entries:[],hasTitle:()=>false,loading:false};export const useSharedMediaCatalog=()=>state;`],
])
const server = await createServer({ root, configFile: false,
  plugins: [{ name: 'shared-rendering-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/render-probe.jsx') return resolve(root, 'render-probe.jsx') },
    load(id) { return id === resolve(root, 'render-probe.jsx') ? entry : mocks.get(id.split('?')[0]) ?? null },
    configureServer(s) { s.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/render-probe') return next()
      s.transformIndexHtml('/render-probe', '<div id="root"></div><script type="module" src="/render-probe.jsx"></script>')
        .then(html => { res.setHeader('Content-Type', 'text/html'); res.end(html) })
    }) },
  }, react()], server: { host: '127.0.0.1', port: 0 },
})
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, args: JSON.parse(process.env.MOVIE_HUB_BROWSER_ARGS || '[]'),
    ...(process.env.MOVIE_HUB_CHROMIUM_PATH ? { executablePath: process.env.MOVIE_HUB_CHROMIUM_PATH } : {}),
  })
  for (const mode of ['home', 'movies', 'series', 'library', 'tv', 'real-tv', 'search', 'images']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    const errors = [], pending = new Set(), imageRoutes = []
    let maxImages = 0, dayRequests = 0
    page.on('pageerror', error => { errors.push(error.message); console.error(mode, error.message) })
    page.on('request', request => { if (request.resourceType() === 'image') { pending.add(request); maxImages = Math.max(maxImages, pending.size) } })
    page.on('requestfinished', request => pending.delete(request))
    page.on('requestfailed', request => pending.delete(request))
    await page.addInitScript(time => { Date.now = () => time }, epoch)
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/images/')) {
        const fulfill = () => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513"><rect width="342" height="513" fill="navy"/></svg>' }).catch(() => {})
        if (url.pathname.includes('hero') || mode === 'images') { imageRoutes.push({ path: url.pathname, fulfill }); return }
        await new Promise(resolve => setTimeout(resolve, 70)); return fulfill()
      }
      if (url.origin !== origin) return route.abort()
      const generatedAt = new Date(epoch).toISOString()
      if (url.pathname === '/tv-runtime/hero.json') {
        await new Promise(resolve => setTimeout(resolve, 250))
        return route.fulfill({ json: { schemaVersion:1, kind:'moviehub-tv-runtime-hero', generatedAt, entries:titles.slice(0, 10) } })
      }
      if (url.pathname === '/tv-runtime/index.json') return route.fulfill({ json: { schemaVersion:1, kind:'moviehub-tv-runtime-index', generatedAt, days:[{key:'2026-10-31'}] } })
      if (url.pathname.startsWith('/tv-runtime/days/')) { dayRequests++; return route.fulfill({ json: { schemaVersion:1, kind:'moviehub-tv-runtime-day', generatedAt, key:'2026-10-31', entries:titles } }) }
      if (url.pathname === '/search-index.json') return route.fulfill({ json: { entries: titles } })
      if (url.pathname.startsWith('/youtube-curated-')) return route.fulfill({ json: { entries: [] } })
      return route.continue()
    })
    await page.goto(`${origin}/render-probe?mode=${mode}`)
    await page.waitForFunction(() => Boolean(window.changePage))
    if (mode === 'images') {
      await page.waitForFunction(() => window.budget().active === 2 && window.budget().pending === 1)
      await page.evaluate(() => window.changeImage('replacement'))
      await page.waitForFunction(() => window.budget().pending === 1)
      await page.evaluate(() => window.changePage('off'))
      await page.waitForFunction(() => window.budget().active === 0 && window.budget().pending === 0)
      for (const route of imageRoutes) await route.fulfill()
      await page.waitForTimeout(80)
      assert.deepEqual(await page.evaluate(() => window.loaded || []), [], 'late image completion after navigation is ignored')
    } else if (mode === 'search') {
      await page.locator('input').fill('Testfilm')
      await page.waitForFunction(() => document.querySelectorAll('.poster-card').length >= 12)
      assert.ok(await page.locator('.poster-card').count() < 200, 'search renders a bounded window')
      await page.locator('input').fill('Testfilm 199')
      await page.waitForFunction(() => document.querySelectorAll('.poster-card').length === 1)
    } else {
      if (mode !== 'real-tv') {
        await page.waitForTimeout(100)
        assert.equal(await page.locator('.poster-card').count(), 0)
        await page.evaluate(() => window.setReady(true))
      }
      await page.locator('.hero-art-image').waitFor()
      await page.waitForTimeout(150)
      assert.equal(await page.locator('.poster-card').count(), 0, `${mode}: no stale no-hero readiness`)
      if (mode === 'real-tv') assert.equal(dayRequests, 0, 'schedule loading waits for actual hero readiness')
      for (const route of imageRoutes.splice(0)) await route.fulfill()
      await page.waitForFunction(() => document.querySelectorAll('.poster-card').length > 0)
      await page.waitForTimeout(250)
      const samples = await page.evaluate(() => window.samples.filter(sample => sample.cards > 0))
      assert.ok(samples[0].cards <= 12, `${mode}: first card batch ${JSON.stringify(samples)}`)
      assert.ok(await page.locator('.poster-card').count() <= 36, `${mode}: initial virtual window remains small`)
      if (mode === 'real-tv') {
        assert.equal(dayRequests, 1)
        await page.waitForFunction(() => document.activeElement?.classList.contains('hero-carousel'))
      }
      assert.ok(maxImages <= 2, `${mode}: actual concurrent image requests ${maxImages}`)
      const events = await page.evaluate(() => window.__movieHubPerformance.snapshot().events)
      assert.ok(events.filter(e => e.name === 'images:budget').every(e => e.detail.active <= 2))
      assert.ok(events.some(e => e.name === 'hero:ready' && e.detail.reason !== 'no-hero'))
    }
    await page.evaluate(() => window.changePage('off'))
    await page.waitForFunction(() => window.budget().active === 0 && window.budget().pending === 0)
    assert.deepEqual(errors, [], `${mode}: browser errors`)
    console.log(`PASS ${mode}: shared render/image admission`)
    await page.close()
  }
} finally { await browser?.close(); await server.close() }
