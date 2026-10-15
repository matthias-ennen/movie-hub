import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { titleNotificationEmail, verificationEmail } from '../server/email/templates.mjs'
import { emailActionPage } from '../server/email/http.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'artifacts/profile-email-browser')
const emulator = process.env.FIRESTORE_EMULATOR_HOST || ''
assert.match(emulator, /^(127\.0\.0\.1|localhost):\d+$/, 'Local Firestore emulator required')
const port = Number(emulator.split(':')[1])
const modulePath = process.env.MOVIE_HUB_PLAYWRIGHT_MODULE
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright')
const browserArgs = JSON.parse(process.env.MOVIE_HUB_BROWSER_ARGS || '[]')
const testEnv = await initializeTestEnvironment({ projectId: 'demo-moviehub-email-ui',
  firestore: { host: '127.0.0.1', port, rules: await readFile(resolve(root, 'firestore.rules'), 'utf8') } })
await testEnv.clearFirestore()
await mkdir(output, { recursive: true })
const server = await createServer({ root, configFile: false, plugins: [react()],
  define: { __EMAIL_TEST_EMULATOR_PORT__: String(port) },
  resolve: { alias: [
    { find: /^.*\/lib\/firebase\.js$/, replacement: resolve(root, 'tests/browser/profile-email/firebase.js') },
    { find: /^.*\/profiles\/ProfileProvider\.jsx$/, replacement: resolve(root, 'tests/browser/profile-email/profiles.jsx') },
  ] },
  optimizeDeps: { entries: ['tests/browser/profile-email/index.html'] },
  server: { host: '127.0.0.1', port: 4178, strictPort: true } })
let browser
const results = []
const errors = []
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, args: browserArgs,
    ...(process.env.MOVIE_HUB_CHROMIUM_PATH ? { executablePath: process.env.MOVIE_HUB_CHROMIUM_PATH } : {}) })
  // No credentials, real accounts, Resend requests, or production Firebase.
  const context = await browser.newContext()
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  const url = 'http://127.0.0.1:4178/tests/browser/profile-email/index.html'
  const address = (p) => p.getByLabel('E-Mail-Adresse', { exact: true })
  const switchControl = (p) => p.getByRole('switch')
  const save = (p) => p.getByRole('button', { name: 'E-Mail speichern', exact: true })
  const changeConsent = async (p, enabled) => {
    await switchControl(p).click()
    await p.getByText(enabled ? 'E-Mail-Mitteilungen eingeschaltet.' : 'E-Mail-Mitteilungen ausgeschaltet.', { exact: true }).waitFor()
    assert.equal(await switchControl(p).getAttribute('aria-checked'), String(enabled))
  }
  const ready = (p) => p.waitForFunction(() => document.querySelector('#profile-email-address')?.readOnly === false)
  async function select(p, name) { await p.getByRole('button', { name: new RegExp(`^${name} `) }).click(); await ready(p) }
  async function persist(p) { await save(p).click(); await p.getByText('E-Mail-Adresse gespeichert.', { exact: true }).waitFor() }
  await page.goto(url); await ready(page)
  assert.equal(await address(page).inputValue(), 'owner@example.org')
  assert.equal(await switchControl(page).getAttribute('aria-checked'), 'false')
  await address(page).fill('primary@example.org'); await persist(page); await changeConsent(page, true)
  await page.getByText('E-Mail-Empfang vorgemerkt. Die Bestätigung steht noch aus.', { exact: true }).waitFor()
  assert.equal(await page.locator('.account-email').textContent(), 'owner@example.org')
  await page.reload(); await ready(page)
  assert.equal(await address(page).inputValue(), 'primary@example.org')
  assert.equal(await switchControl(page).getAttribute('aria-checked'), 'true')
  await select(page, 'Familie')
  assert.equal(await address(page).inputValue(), '')
  assert.equal(await switchControl(page).getAttribute('aria-checked'), 'false')
  await switchControl(page).click()
  await page.getByText('Bitte zuerst eine gültige E-Mail-Adresse speichern.').waitFor()
  assert.equal(await switchControl(page).getAttribute('aria-checked'), 'false')
  await address(page).fill('family@example.org'); await persist(page); await changeConsent(page, true)
  await select(page, 'Hauptprofil'); assert.equal(await address(page).inputValue(), 'primary@example.org')
  results.push('Primary/member defaults, independent saved recipient/consent, reload persistence, unchanged login address')

  const second = await context.newPage(); second.on('pageerror', (error) => errors.push(error.message))
  await second.goto(url); await ready(second)
  await changeConsent(page, false); await address(page).fill(''); await persist(page)
  await second.waitForFunction(() => document.querySelector('#profile-email-address').value === '')
  await page.reload(); await ready(page); assert.equal(await address(page).inputValue(), '')
  await address(page).fill('draft@example.org')
  await address(second).fill('other-device@example.org'); await persist(second)
  await save(page).click()
  await page.getByText(/auf einem anderen Gerät geändert/).waitFor()
  assert.equal(await address(page).inputValue(), 'draft@example.org')
  results.push('Two live views synchronize; explicitly empty primary stays empty; unsaved draft survives revision conflict')
  await page.reload(); await ready(page)
  assert.equal(await address(page).inputValue(), 'other-device@example.org')
  await second.close()

  for (const [width, height, label] of [[390, 844, 'phone'], [768, 1024, 'tablet'], [1280, 720, 'tv720'], [1920, 1080, 'tv1080']]) {
    await page.setViewportSize({ width, height })
    await address(page).focus()
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.profile-email-form input, .profile-email-form button')]
      .every((element) => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && element.scrollWidth <= element.clientWidth + 1 })), true, `${label}: clipped email control`)
    await page.screenshot({ path: resolve(output, `profile-${label}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  // Horizontal arrows inside a text input edit its caret; the save button stays D-pad reachable.
  await save(page).focus(); await page.keyboard.press('ArrowLeft')
  assert.equal(await address(page).evaluate((input) => input === document.activeElement), true)
  await page.keyboard.press('ArrowDown')
  assert.equal(await switchControl(page).evaluate((button) => button === document.activeElement), true)
  await page.keyboard.press('ArrowUp')
  assert.equal(await address(page).evaluate((input) => input === document.activeElement), true)
  results.push('Four viewport layouts without clipped email controls; D-pad reaches inline save and consent')

  // Toggle persists consent without saving a different unsaved address draft.
  await address(page).fill('unsaved-draft@example.org')
  await changeConsent(page, true)
  assert.equal(await address(page).inputValue(), 'unsaved-draft@example.org')
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const prefs = (await getDoc(doc(db, 'users/email-ui-owner/profiles/main/emailPreferences/current'))).data()
    assert.equal(prefs.email, 'other-device@example.org')
    assert.equal(prefs.enabled, true)
  })
  await page.reload(); await ready(page)
  assert.equal(await address(page).inputValue(), 'other-device@example.org')
  results.push('Autosave toggle preserves unsaved address draft without changing saved recipient')

  // Verify new server status is visible even after a successful consent toggle.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const prefs = (await getDoc(doc(db, 'users/email-ui-owner/profiles/main/emailPreferences/current'))).data()
    await setDoc(doc(db, 'users/email-ui-owner/profiles/main/emailVerification/current'), {
      status: 'verified', email: prefs.email, addressVersion: prefs.addressVersion, verifiedAt: new Date(),
    })
  })
  await page.getByText('E-Mail-Adresse bestätigt.', { exact: true }).waitFor()
  results.push('Live confirmation remains visible alongside save feedback')
  assert.deepEqual(errors, [])

  const start = Date.parse('2026-10-14T18:15:00Z')
  const props = { title: 'Der Herr der Ringe: Die zwei Türme', profileName: 'Familie', stationName: 'ZDF',
    providerNames: ['Netflix', 'Prime Video'], airingStartAt: start, sentAt: start - 300000,
    url: 'https://example.org', unsubscribeUrl: 'https://example.org/action#preview' }
  const mails = [...['included-found', 'tv-found', 'tv-final'].map((phase) => ({ name: phase, ...titleNotificationEmail({ ...props, phase }) })),
    { name: 'confirmation', ...verificationEmail({ profileName: 'Familie', url: 'https://example.org/action#preview' }) }]
  for (const mail of mails) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 }); await page.setContent(mail.html)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${mail.name}: overflow`)
      await page.screenshot({ path: resolve(output, `mail-${mail.name}-${width}.png`), fullPage: true })
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.setContent(emailActionPage)
  await page.screenshot({ path: resolve(output, 'email-action-phone.png'), fullPage: true })
  results.push('All four email templates at mobile/desktop widths plus action page rendered without overflow')
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ status: 'passed', results, limitations: 'Browser/emulator checks, not physical phone/Fire-TV acceptance or real email-client delivery.' }, null, 2) + '\n')
  console.log(results.map((result) => `PASS: ${result}`).join('\n'))
} catch (error) {
  console.error('Browser errors:', JSON.stringify(errors))
  const page = browser?.contexts()[0]?.pages()[0]
  if (page) {
    console.error('Visible test page:', await page.locator('body').innerText().catch(() => 'unavailable'))
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
  }
  throw error
} finally {
  await browser?.close(); await server.close(); await testEnv.cleanup()
}
