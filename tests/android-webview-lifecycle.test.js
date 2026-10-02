import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainActivity = readFileSync(
  new URL('../android/app/src/main/java/de/matthiasennen/moviehub/MainActivity.java', import.meta.url),
  'utf8',
)

describe('Android WebView lifecycle contract', () => {
  it('treats a renderer-gone WebView as permanently unusable until recreation', () => {
    expect(mainActivity).toContain('private boolean canUseWebView()')
    expect(mainActivity).toContain('return webView != null && !webRendererGone;')
    expect(mainActivity).toMatch(/handleWebRendererGone\([\s\S]*webRendererGone = true;[\s\S]*showFinalStartupFailure\(\)/)
  })

  it('does not resume, pause or persist a dead renderer', () => {
    expect(mainActivity).toMatch(/protected void onPause\(\)[\s\S]*if \(canUseWebView\(\)\)[\s\S]*webView\.onPause\(\)[\s\S]*webView\.pauseTimers\(\)/)
    expect(mainActivity).toMatch(/protected void onResume\(\)[\s\S]*if \(canUseWebView\(\)\)[\s\S]*webView\.onResume\(\)[\s\S]*webView\.resumeTimers\(\)/)
    expect(mainActivity).toMatch(/protected void onSaveInstanceState\(Bundle outState\)[\s\S]*if \(canUseWebView\(\)\)[\s\S]*webView\.saveState\(outState\)/)
  })

  it('falls back to native exit handling when JavaScript is unavailable', () => {
    expect(mainActivity).toContain('offlineView.getVisibility() == View.VISIBLE || !canUseWebView()')
    expect(mainActivity).toMatch(/private void requestThemedExitConfirmation\(\)[\s\S]*if \(!canUseWebView\(\)\)[\s\S]*showNativeExitConfirmation\(\)/)
  })

  it('does not deliver trailer callbacks to a dead renderer', () => {
    expect(mainActivity).toMatch(/schedulePendingHeroTrailerResult\(long delayMs\)[\s\S]*!canUseWebView\(\)/)
    expect(mainActivity).toMatch(/deliverPendingHeroTrailerResult\(\)[\s\S]*!canUseWebView\(\)/)
  })
})
