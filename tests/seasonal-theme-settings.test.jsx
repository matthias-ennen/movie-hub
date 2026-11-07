import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DEFAULT_THEME_SETTINGS, normalizeThemeSettings, resolveThemeForStartup,
} from '../src/theme/themeConfig.js'
import { normalizeContentDisplaySettings } from '../src/catalog/contentDisplaySettings.js'
import {
  SEASONAL_CONTENT_MODES, seasonalCalendarPeriod, resolveSeasonalContent,
  withSeasonalContentEnabled, withSeasonalAutoSwitch, withManualSeasonalContent,
} from '../src/catalog/seasonalContent.js'

const themeMock=vi.hoisted(()=>({ current:null }))
vi.mock('../src/theme/ThemeProvider.jsx',()=>({
  useTheme:()=>themeMock.current,
}))
import ThemeSettings from '../src/components/ThemeSettings.jsx'

const at=value=>new Date(value)
const css=readFileSync(new URL('../src/styles/seasonal-themes.css', import.meta.url),'utf8')
const provider=readFileSync(new URL('../src/theme/ThemeProvider.jsx', import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.jsx', import.meta.url),'utf8')

function palette(cssText,selector){
  const matched=cssText.match(new RegExp(selector.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')+'\\s*\\{([^}]+)\\}'))
  if(!matched)throw Error('Missing CSS selector '+selector)
  return Object.fromEntries([...matched[1].matchAll(/(--[a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)]
    .map(([,key,value])=>[key,value]))
}
function luminosity(hex) {
  const components=[1,3,5].map(p=>parseInt(hex.slice(p,p+2),16)/255)
  const linear=components.map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4)
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722
}
function contrast(a,b) {
  const x=luminosity(a),y=luminosity(b)
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)
}
function themeProps(visualSeason='classic',seasonalEnabled=true){
  return {
    themeId:'midnight',
    themes:[{id:'midnight',label:'Midnight',description:'Dunkel'}],
    autoSwitchEnabled:false,autoSwitchInterval:'daily',
    autoSwitchIntervals:[{id:'daily',label:'Täglich'}],
    selectTheme:vi.fn(),setAutoSwitchEnabled:vi.fn(),setAutoSwitchInterval:vi.fn(),
    seasonalThemes:SEASONAL_CONTENT_MODES,
    seasonalThemeSettings:{
      enabled:seasonalEnabled,seasonId:visualSeason,
      autoSwitch:{enabled:true,periodKey:null},
    },
    activeVisualSeason:visualSeason,
    setSeasonalThemeEnabled:vi.fn(),
    setSeasonalThemeAutoSwitch:vi.fn(),
    selectSeasonalTheme:vi.fn(),
  }
}

describe('#484 seasonal independent design settings and shared calendar',()=>{
  it('is disabled by default and does not alter base theme or old automatic design rotation',()=>{
    const settings=normalizeThemeSettings()
    expect(settings).toMatchObject({
      themeId:'midnight',
      seasonalTheme:{enabled:false,seasonId:'classic',autoSwitch:{enabled:true}},
      autoSwitch:{enabled:false,interval:'daily'},
    })
    expect(DEFAULT_THEME_SETTINGS.themeId).toBe('midnight')
    const enabledBase={themeId:'cinema',autoSwitch:{
      enabled:true,interval:'weekly',periodKey:'week:old',
    },seasonalTheme:withManualSeasonalContent({
      enabled:true,seasonId:'classic',autoSwitch:{enabled:false},
    },'christmas',at('2026-06-10'))}
    const normalized=resolveThemeForStartup(enabledBase,at('2026-06-10'),()=>0)
    expect(normalized.themeId).not.toBe('cinema')
    expect(normalized.seasonalTheme.seasonId).toBe('christmas')
    expect(normalized.seasonalTheme.autoSwitch.enabled).toBe(false)
  })

  it('uses the identical German calendar with independent content and design selections',()=>{
    const june=at('2026-06-16T10:00:00Z')
    const base=withSeasonalContentEnabled(null,true)
    const style=withManualSeasonalContent(base,'christmas',june)
    const content=withManualSeasonalContent(base,'halloween',june)
    expect(resolveSeasonalContent(style,june)).toBe('christmas')
    expect(resolveSeasonalContent(content,june)).toBe('halloween')
    expect(resolveSeasonalContent(style,at('2026-10-15T09:00:00Z'))).toBe('halloween')
    expect(resolveSeasonalContent(content,at('2026-10-15T09:00:00Z'))).toBe('halloween')

    const nonAuto=withSeasonalAutoSwitch(style,false)
    expect(resolveSeasonalContent(nonAuto,at('2026-12-24T12:00:00Z'))).toBe('christmas')
    const posterAuto=withSeasonalAutoSwitch(content,true)
    expect(resolveSeasonalContent(posterAuto,at('2026-12-24T12:00:00Z'))).toBe('christmas')
    expect(resolveSeasonalContent(style,at('2026-11-12T12:00:00Z'))).toBe('classic')
    expect(resolveSeasonalContent(style,at('2026-12-24T12:00:00Z'))).toBe('christmas')
    expect(resolveSeasonalContent(withSeasonalContentEnabled(nonAuto,false),june)).toBe('classic')
    expect(normalizeContentDisplaySettings({seasonalContent:content}).seasonalContent).toEqual(content)
    expect(normalizeThemeSettings({seasonalTheme:style}).seasonalTheme).toEqual(style)
    expect(seasonalCalendarPeriod(at('2027-01-06T22:59:00Z')).seasonId).toBe('newyear')
  })

  it('keeps seasonal visual controls on the existing Design page with effective selection',()=>{
    themeMock.current=themeProps('halloween')
    const markup=renderToStaticMarkup(createElement(ThemeSettings))
    for(const label of ['Saisonale Gestaltung','Klassisch','Halloween','Weihnachten','Ostern','Pfingsten','Saisonales Design automatisch wechseln','Wirksam']){
      expect(markup).toContain(label)
    }
    expect(markup).toContain('Saisonale Gestaltung ein- oder ausschalten')
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('data-focusable="true"')
    expect(markup).toContain('data-season-preview="halloween"')
    expect(markup).toContain('Aktiv: Halloween')
    themeMock.current=themeProps('classic',false)
    const off=renderToStaticMarkup(createElement(ThemeSettings))
    expect(off).toContain('Aktiv: Aus (Klassisch)')
    expect(off).not.toContain('Saisonales Design automatisch wechseln')
  })

  it('reuses profile persistence, one calendar signal and existing base theme styling',()=>{
    expect(provider).toContain('updateActiveProfileThemeSettings(settings)')
    expect(provider).toContain('withManualSeasonalContent')
    expect(provider).toContain('root.dataset.season = activeVisualSeason')
    expect(provider).toContain('document.documentElement.dataset.theme = settings.themeId')
    expect(provider).not.toContain('document.documentElement.dataset.theme = activeVisualSeason')
    expect(provider).toContain('useSeasonalCalendarClock()')
    expect(app).toContain('useSeasonalCalendarClock()')
    expect(app).toContain('[contentDisplaySettings.seasonalContent, seasonalCalendarKey]')
    expect(css).not.toMatch(/url\(/i)
    expect(css).not.toMatch(/animation\s*:/i)
    expect(css).toContain('prefers-reduced-motion')
  })

  it.each(['halloween','christmas','easter','pentecost','newyear','filmfestival','hollywood','summer-cinema'])(
    'keeps all accents and focus outlines readable for every base theme with %s',season=>{
      const dark=palette(css,":root[data-season='"+season+"']")
      const light=palette(css,":root[data-theme='bright'][data-season='"+season+"']")
      for(const bg of ['#07090d','#090706','#071019','#0d0e10']){
        for(const key of ['--color-brand-accent','--color-eyebrow','--color-focus'])
          expect(contrast(dark[key],bg),`${season} dark ${key}`).toBeGreaterThanOrEqual(4.5)
      }
      for(const key of ['--color-brand-accent','--color-eyebrow','--color-focus'])
        expect(contrast(light[key],'#f3f5f8'),`${season} bright ${key}`).toBeGreaterThanOrEqual(4.5)
      for(const currentPalette of [dark,light]) {
        for(const key of ['--theme-avatar-start','--theme-avatar-end'])
          expect(contrast(currentPalette[key],'#ffffff'),`${season} avatar ${key}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(readFileSync(new URL('../src/components/ThemeSettings.jsx', import.meta.url), 'utf8'))
        .toContain('data-season-preview={mode.id}')
      expect(readFileSync(new URL('../src/styles/seasonal-atmosphere.css', import.meta.url), 'utf8'))
        .toContain('--season-preview-art')
    })
})
