import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Exercise the real App, Hero, virtual rows and native-ready signal. Replace
// only account services; never connect this test to production or real users.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modulePath = process.env.MOVIE_HUB_PLAYWRIGHT_MODULE
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright')
const mocks = {
  'src/hooks/useAuth.js': `const user={uid:'synthetic',email:'test@example.invalid'};
    export const useAuth=()=>({user:window.__holdAuth?null:user,loading:Boolean(window.__holdAuth),error:null});`,
  'src/lib/firebase.js': `export const firebaseReady=Promise.resolve({});`,
  'src/profiles/ProfileProvider.jsx': `import {DEFAULT_THEME_SETTINGS} from '/src/theme/themeConfig.js';
    const activeProfile={id:'main',displayName:'Testprofil',themeSettings:DEFAULT_THEME_SETTINGS};
    const state={activeProfile,profiles:[activeProfile],loading:false,error:null,
      selectProfile:()=>{},updateActiveProfileThemeSettings:async()=>{}};
    export const useProfiles=()=>state;
    export const ProfileProvider=({children})=>children;`,
  'src/tmdb/TmdbCatalogProvider.jsx': `const state={personalTitles:[],loading:false};
    export const useTmdbCatalog=()=>state;
    export const TmdbCatalogProvider=({children})=>children;`,
  'src/library/LibraryProvider.jsx': `import {EMPTY_TITLE_STATE} from '/src/library/libraryState.js';
    const state={statesByKey:{},loading:false,error:null,getTitleState:()=>EMPTY_TITLE_STATE};
    export const useLibrary=()=>state;
    export const LibraryProvider=({children})=>children;`,
  'src/library/useSharedMediaCatalog.js': `const state={entries:[],hasTitle:()=>false,loading:false};
    export const useSharedMediaCatalog=()=>state;`,
  'src/settings/useProviderSelection.js': `import {useSyncExternalStore} from 'react';
    const enabledProviderIds=['youtube','waipu','joyn','moviehub'],listeners=new Set();
    const isProviderEnabled=id=>enabledProviderIds.includes(id);let loading=Boolean(window.__holdSettings);
    window.__releaseSettings=()=>{loading=false;for(const listener of listeners)listener()};
    const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};
    export const useProviderSelection=()=>({enabledProviderIds,isProviderEnabled,
      loading:useSyncExternalStore(subscribe,()=>loading,()=>loading)});`,
  'src/settings/useWaipuStationSelection.js': `const state={disabledStationIds:[],loading:false};
    export const useWaipuStationSelection=()=>state;`,
  'src/settings/useJoynStationSelection.js': `const state={disabledStationIds:[],loading:false};
    export const useJoynStationSelection=()=>state;`,
  'src/notifications/useAnnouncements.js': `const state={items:[],readIds:new Set(),unreadCount:0,
    ready:true,error:null,markRead:async()=>{}};
    export const useAnnouncements=()=>state;`,
}
const replacements = new Map(Object.entries(mocks).map(([path, source]) => [resolve(root, path), source]))
const server = await createServer({
  root, configFile: false,
  plugins: [{ name: 'synthetic-startup-services', enforce: 'pre',
    load(id) { return replacements.get(id.split('?')[0]) ?? null },
  }, react()],
  define: { __MOVIE_HUB_WEB_BUILD__: JSON.stringify('startup-test'), __MOVIE_HUB_WEB_BUILT_AT__: JSON.stringify('test') },
  server: { host: '127.0.0.1', port: 0 },
})
const film = (id, title) => ({
  id: `tmdb-movie-${id}`, tmdbId: id, type: 'movie', source: 'tmdb', title,
  description: 'Synthetischer Testfilm.', metadataComplete: true,
  year: 2026, popularity: id, voteAverage: 7, voteCount: 100,
  posterUrl: '/fixture.svg', backdropUrl: '/fixture.svg',
  providerIds: ['youtube'], tmdbProviderIds: ['youtube'],
  tmdbProviderOffers: [{ id: 'youtube', tmdbProviderId: 192, offerTypes: ['rent'] }],
  genres: [{ id: 28, name: 'Action' }],
})
const baseFilm = film(1, 'Startfilm')
const newFilm = film(2, 'Nachgeladener Film')
const catalog = {
  source: 'tmdb', generatedAt: new Date().toISOString(), titles: [baseFilm],
  rowDefinitions: [{ id: 'startup-test', title: 'Testreihe', ids: [baseFilm.id] }],
  providerCatalogs: { youtube: { id: 'youtube', movieIds: [baseFilm.id], homeIds: [baseFilm.id], seriesIds: [] } },
}
const companion = {
  kind: 'moviehub-youtube-curated-new-film-metadata', schemaVersion: 1, providerId: 'youtube',
  offerVerification: 'editorial-only-not-independent',
  sourceType: 'user-curated-playlists-with-tmdb-metadata', generatedAt: new Date().toISOString(),
  count: 1, sourceVideoIds: 1,
  entries: [{ tmdbId: 2, videoId: 'abcdefghijk', playlistClass: 'FREE', film: newFilm }],
}
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, args: JSON.parse(process.env.MOVIE_HUB_BROWSER_ARGS || '[]'),
    ...(process.env.MOVIE_HUB_CHROMIUM_PATH ? { executablePath: process.env.MOVIE_HUB_CHROMIUM_PATH } : {}),
  })
  for (const outcome of ['delayed-success', 'timeout', 'unavailable', 'delayed-settings', 'catalog-unavailable', 'auth-timeout']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript((scenario) => {
      window.__holdSettings = scenario === 'delayed-settings'
      window.__holdAuth = scenario === 'auth-timeout'
      window.__readyCalls = 0
      window.MovieHubNative = {
        notifyStartupReady() { window.__readyCalls += 1 },
        getHeroSequenceContractVersion() { return 1 },
      }
    }, outcome)
    let companionRequest
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      if (url.pathname === '/catalog.json') return outcome === 'catalog-unavailable'
        ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ json: catalog })
      if (url.pathname === '/youtube-curated-new-films.json') {
        assert.ok(await page.evaluate(() => window.__readyCalls > 0), 'optional feed started before Home readiness')
        companionRequest = route
        if (['unavailable', 'delayed-settings', 'catalog-unavailable'].includes(outcome)) return route.fulfill({ status: 503, body: 'unavailable' })
        return // Deliberately leave this response pending.
      }
      if (url.pathname === '/fixture.svg') return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#163850"/></svg>',
      })
      if (url.pathname.endsWith('.json') && !url.pathname.startsWith('/node_modules/')) return route.fulfill({ json: null })
      return route.continue()
    })
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' })
      if (outcome === 'delayed-settings') {
        await page.waitForFunction(() => window.__movieHubPerformance.snapshot().events.some(e => e.name === 'catalog:ready'))
        assert.equal(await page.evaluate(() => window.__readyCalls), 0, 'Home must wait for essential provider settings')
        await page.evaluate(() => window.__releaseSettings())
      }
      await page.waitForFunction(() => window.__readyCalls > 0, null, { timeout: 18000 })
      if (outcome === 'auth-timeout') {
        await page.getByText('Anmeldung konnte nicht rechtzeitig geladen werden.', { exact: false }).waitFor()
        assert.equal(await page.evaluate(() => window.__readyCalls), 1)
        assert.deepEqual(errors, [])
        console.log('PASS auth-timeout: bounded error screen releases native startup')
        continue
      }
      if (outcome === 'catalog-unavailable') {
        await page.waitForFunction(() => window.__movieHubPerformance.snapshot().events.some(
          e => e.name === 'catalog:ready' && e.detail.outcome === 'error',
        ))
        await page.getByRole('alert').filter({ hasText: 'Der aktuelle Katalog konnte nicht geladen werden.' }).waitFor()
        await page.getByRole('button', { name: 'Filme', exact: true }).click()
        await page.locator('[data-content-page="movies"]').waitFor()
        assert.deepEqual(errors, [])
        console.log('PASS catalog-unavailable: bounded fallback releases native startup and navigation')
        continue
      }
      await page.locator('main[data-page-load-state="rows"] .poster-card').first().waitFor()
      await page.waitForFunction(() => window.__movieHubPerformance.snapshot().events
        .some(e => e.name === 'catalog:youtube-companion:start'))
      assert.ok(companionRequest, 'optional request missing')
      const startupCalls = await page.evaluate(() => window.__readyCalls)
      await page.getByRole('button', { name: 'Filme', exact: true }).click()
      await page.locator('[data-content-page="movies"]').waitFor()
      if (outcome === 'delayed-success') {
        await companionRequest.fulfill({ json: companion })
        await page.locator('.poster-card[aria-label="Nachgeladener Film öffnen"]').first().waitFor()
      } else {
        await page.waitForFunction(() => window.__movieHubPerformance.snapshot().events.some(
          e => e.name === 'catalog:youtube-companion:ready' && e.detail.outcome === 'unavailable',
        ), null, { timeout: 15000 })
        await page.locator('.poster-card[aria-label="Startfilm öffnen"]').first().waitFor()
      }
      assert.equal(await page.evaluate(() => window.__readyCalls), startupCalls, 'background feed restarted the native gate')
      assert.deepEqual(errors, [])
      console.log(`PASS ${outcome}: Home ready, navigation responsive, optional feed isolated`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser?.close()
  await server.close()
}
