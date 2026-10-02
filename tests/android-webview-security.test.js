import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainActivity = readFileSync(
  new URL('../android/app/src/main/java/de/matthiasennen/moviehub/MainActivity.java', import.meta.url),
  'utf8',
)
const webViewPolicy = readFileSync(
  new URL('../android/app/src/main/java/de/matthiasennen/moviehub/MovieHubWebViewPolicy.java', import.meta.url),
  'utf8',
)
const manifest = readFileSync(
  new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
)

describe('Android WebView security policy', () => {
  it('centralizes WebView settings outside MainActivity', () => {
    expect(mainActivity).toContain('MovieHubWebViewPolicy.configure(webView);')
    expect(mainActivity).not.toContain('setAcceptThirdPartyCookies')
    expect(mainActivity).not.toContain('setMixedContentMode')
  })

  it('keeps top-level navigation HTTPS-only and limited to Movie Hub hosts', () => {
    expect(webViewPolicy).toContain('"movie-hub-62459.web.app"')
    expect(webViewPolicy).toContain('"movie-hub-62459.firebaseapp.com"')
    expect(webViewPolicy).toMatch(/return "https"\.equalsIgnoreCase\(scheme\)/)
    expect(mainActivity).toContain('MovieHubWebViewPolicy.isTrustedTopLevelUrl(scheme, host)')
  })

  it('disables third-party cookies while retaining first-party cookies', () => {
    expect(webViewPolicy).toContain('cookies.setAcceptCookie(true);')
    expect(webViewPolicy).toContain('cookies.setAcceptThirdPartyCookies(webView, false);')
  })

  it('retains the explicit user-media exception for arbitrary HTTP video sources', () => {
    expect(webViewPolicy).toContain('WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE')
    expect(manifest).toContain('android:usesCleartextTraffic="true"')
    expect(manifest).toContain('arbitrary LAN hosts/IPs')
  })
})
