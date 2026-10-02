import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainActivity = readFileSync(new URL('../android/app/src/main/java/de/matthiasennen/moviehub/MainActivity.java', import.meta.url), 'utf8')
const cryptoBridge = readFileSync(new URL('../android/app/src/main/java/de/matthiasennen/moviehub/PersonalDataCryptoBridge.java', import.meta.url), 'utf8')
const trailerBridge = readFileSync(new URL('../android/app/src/main/java/de/matthiasennen/moviehub/HeroTrailerLaunchBridge.java', import.meta.url), 'utf8')
const hero = readFileSync(new URL('../src/components/Hero.jsx', import.meta.url), 'utf8')
const nativeStartup = readFileSync(new URL('../src/performance/nativeStartup.js', import.meta.url), 'utf8')

function javascriptInterfaceMethods(source) {
  return [...source.matchAll(/@JavascriptInterface\s+public\s+[\w<>\[\]]+\s+(\w+)\s*\(/g)].map((match) => match[1])
}

describe('nativer WebView-Bridge-Vertrag', () => {
  it('registriert alle drei vom Web-Client verwendeten Bridge-Namen', () => {
    expect(mainActivity).toContain('addJavascriptInterface(new NativeBridge(), "MovieHubNative")')
    expect(mainActivity).toContain('addJavascriptInterface(new PersonalDataCryptoBridge(), "MovieHubCrypto")')
    expect(mainActivity).toContain('addJavascriptInterface(new HeroTrailerLaunchBridge(this), "MovieHubTrailer")')
    expect(hero).toContain('window.MovieHubTrailer')
    expect(nativeStartup).toContain('MovieHubNative')
  })

  it('versioniert den zentralen nativen Bridge-Vertrag', () => {
    expect(mainActivity).toContain('private static final int NATIVE_BRIDGE_CONTRACT_VERSION = 1;')
    expect(mainActivity).toMatch(/@JavascriptInterface\s+public int getBridgeContractVersion\(\)\s*\{\s*return NATIVE_BRIDGE_CONTRACT_VERSION;/)
  })

  it('sichert die erwarteten MovieHubNative-Methoden', () => {
    const methods = javascriptInterfaceMethods(mainActivity)
    expect(methods).toEqual(expect.arrayContaining([
      'getPlatform',
      'getPlatformLabel',
      'getAppVersion',
      'getAppBuild',
      'getBridgeContractVersion',
      'getHeroSequenceContractVersion',
      'notifyStartupReady',
      'closeApp',
      'openNetworkSettings',
      'openTmdbSettings',
      'requestTmdbCatalogSync',
      'requestTmdbTitleMetadata',
      'clearSessionSmbCredentials',
      'openProjectUrl',
      'openExternalUrl',
      'openProvider',
      'openProviderRoute',
      'openProviderExact',
      'openMediaUrl',
      'playSmbMedia',
    ]))
  })

  it('sichert Crypto- und Trailer-Bridge', () => {
    expect(javascriptInterfaceMethods(cryptoBridge)).toEqual(['isAvailable', 'encrypt', 'decrypt'])
    expect(javascriptInterfaceMethods(trailerBridge)).toEqual([
      'playHeroTrailer',
      'playHeroTrailerWithResult',
      'acknowledgeHeroTrailerResult',
    ])
  })
})
