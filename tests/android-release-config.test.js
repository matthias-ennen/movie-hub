import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const buildGradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8')
const proguardRules = readFileSync(new URL('../android/app/proguard-rules.pro', import.meta.url), 'utf8')
const androidWorkflow = readFileSync(new URL('../.github/workflows/android-apk.yml', import.meta.url), 'utf8')

describe('Android Release R8-Vertrag', () => {
  it('aktiviert Minify isoliert ohne Ressourcen-Shrinking', () => {
    expect(buildGradle).toContain('minifyEnabled true')
    expect(buildGradle).toContain('shrinkResources false')
    expect(buildGradle).toContain("proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'")
  })

  it('schützt WebView-JavaScript-Interfaces vor Umbenennung und Entfernung', () => {
    expect(proguardRules).toContain('-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault')
    expect(proguardRules).toContain('@android.webkit.JavascriptInterface <methods>;')
    expect(proguardRules).toContain('-keepclassmembers,allowoptimization class *')
  })

  it('misst Releasegröße und archiviert die R8-Mappingdatei', () => {
    expect(androidWorkflow).toContain('Report APK sizes')
    expect(androidWorkflow).toContain('app/build/outputs/apk/release/app-release.apk')
    expect(androidWorkflow).toContain('movie-hub-fire-tv-release-r8-mapping')
    expect(androidWorkflow).toContain('android/app/build/outputs/mapping/release/mapping.txt')
  })
})
