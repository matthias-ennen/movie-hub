import { describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inspectSeasonalWebP } from '../scripts/audit-seasonal-artwork.mjs'
import {
  SEASONAL_CONTENT_MODES, seasonalCalendarWindows, seasonalCalendarPeriod,
  withManualSeasonalContent, withSeasonalAutoSwitch, resolveSeasonalContent,
  VERIFIED_AWARDS_DATES, VERIFIED_FESTIVAL_DATES,
} from '../src/catalog/seasonalContent.js'
import {
  SEASONAL_PAGE_HEADINGS, SEASONAL_ATMOSPHERE_SLOTS,
  SEASONAL_ATMOSPHERE_ASSETS, seasonalPageHeading, seasonalVisualAssets,
} from '../src/theme/seasonalPresentation.js'
import {
  buildSeasonalDiscovery, validateSeasonalDiscovery, refreshSeasonalDiscovery,
  seasonalDiscoveryRows, SEASONAL_DISCOVERY_VERSION, SEASONAL_PAGE_BUDGET,
} from '../scripts/tmdb-seasonal-discovery.mjs'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const at=s=>new Date(s)
const seasonAt=s=>seasonalCalendarPeriod(at(s)).seasonId
const ms=86400000
const days=s=>Date.parse(s+'T00:00:00Z')/ms
const read=path=>readFileSync(new URL(path, import.meta.url),'utf8')

describe('#728 eight seasonal calendar worlds',()=>{
  it('splits Christmas on 30 December and New Year on 31 December until 7 January inclusive (Berlin)',()=>{
    expect(seasonAt('2026-12-30T22:59:59Z')).toBe('christmas')
    expect(seasonAt('2026-12-30T23:00:00Z')).toBe('newyear')
    expect(seasonAt('2027-01-07T22:59:59Z')).toBe('newyear')
    expect(seasonAt('2027-01-07T23:00:00Z')).toBe('classic')
    expect(seasonAt('2026-01-07T22:59:59Z')).toBe('newyear')
    expect(seasonAt('2026-01-07T23:00:00Z')).toBe('classic')
  })
  it('honours verified Berlinale 2027 dates and Hollywood Oscar dates 2027/2028',()=>{
    expect(VERIFIED_FESTIVAL_DATES[2027]).toEqual({start:'2027-02-10',end:'2027-02-21'})
    expect(VERIFIED_AWARDS_DATES[2027]).toBe('2027-03-14')
    expect(VERIFIED_AWARDS_DATES[2028]).toBe('2028-03-05')
    expect(seasonAt('2027-02-09T23:00:00Z')).toBe('filmfestival')
    expect(seasonAt('2027-02-21T22:59:59Z')).toBe('filmfestival')
    expect(seasonAt('2027-02-21T23:00:00Z')).toBe('classic')
    expect(seasonAt('2027-03-06T23:00:00Z')).toBe('hollywood')
    expect(seasonAt('2028-02-26T23:00:00Z')).toBe('hollywood')
    expect(seasonAt('2028-03-05T22:59:59Z')).toBe('hollywood')
  })
  it('uses an explicit precedence for 14 March 2027 and resumes Easter the next day',()=>{
    expect(seasonAt('2027-03-14T12:00:00Z')).toBe('hollywood')
    expect(seasonAt('2027-03-14T23:00:00Z')).toBe('easter')
    expect(seasonAt('2027-04-04T21:59:59Z')).toBe('easter')
    expect(seasonAt('2027-04-04T22:00:00Z')).toBe('classic')
  })
  it('adds a two-week Summer Cinema window and preserves movable Pentecost/Halloween',()=>{
    expect(seasonAt('2027-07-31T22:00:00Z')).toBe('summer-cinema')
    expect(seasonAt('2027-08-14T21:59:59Z')).toBe('summer-cinema')
    expect(seasonAt('2027-08-14T22:00:00Z')).toBe('classic')
    expect(seasonAt('2027-05-09T12:00:00Z')).toBe('pentecost')
    expect(seasonAt('2027-10-15T12:00:00Z')).toBe('halloween')
    expect(seasonAt('2027-11-01T12:00:00Z')).toBe('classic')
  })
  it('never assumes unknown future event dates are confirmed',()=>{
    const w=seasonalCalendarWindows(2029)
    expect(w.find(x=>x.id==='hollywood').end-w.find(x=>x.id==='hollywood').start).toBe(8)
    expect(w.find(x=>x.id==='filmfestival').end-w.find(x=>x.id==='filmfestival').start).toBe(12)
    expect(seasonalCalendarWindows(2027).find(x=>x.id==='hollywood').startDate).toBe('2027-03-07')
    expect(seasonalCalendarWindows(2027).find(x=>x.id==='hollywood').endDateInclusive).toBe('2027-03-14')
    expect(seasonalCalendarWindows(2027).find(x=>x.id==='easter').start).toBe(days('2027-03-14'))
  })
  it('keeps manual visual and poster seasons independent, with next-boundary override',()=>{
    const june=at('2027-06-10T12:00:00Z')
    const auto={enabled:true,autoSwitch:{enabled:true}}
    const visual=withManualSeasonalContent(auto,'newyear',june)
    const content=withManualSeasonalContent(auto,'halloween',june)
    expect(resolveSeasonalContent(visual,at('2027-06-15T12:00:00Z'))).toBe('newyear')
    expect(resolveSeasonalContent(content,at('2027-06-15T12:00:00Z'))).toBe('halloween')
    expect(resolveSeasonalContent(visual,at('2027-08-01T12:00:00Z'))).toBe('summer-cinema')
    expect(resolveSeasonalContent(content,at('2027-08-01T12:00:00Z'))).toBe('summer-cinema')
    expect(resolveSeasonalContent(withSeasonalAutoSwitch(visual,false),at('2027-12-20T12:00:00Z'))).toBe('newyear')
  })
})

describe('#484 fully resourced visual system',()=>{
  it('has nine and only nine coherent seasonal headings across four content pages',()=>{
    const ids=SEASONAL_CONTENT_MODES.map(x=>x.id)
    expect(ids).toHaveLength(9)
    expect(new Set(ids).size).toBe(9)
    expect(Object.keys(SEASONAL_PAGE_HEADINGS).sort()).toEqual([...ids].sort())
    expect(Object.keys(SEASONAL_ATMOSPHERE_ASSETS).sort()).toEqual([...ids].sort())
    for(const id of ids)for(const page of ['home','movies','series','library']){
      expect(seasonalPageHeading(id,page).length).toBeGreaterThan(3)
    }
    expect(seasonalPageHeading('classic','movies')).toBe('Filme')
    expect(seasonalPageHeading('halloween','home')).toBe('Zeit für Gänsehaut')
    expect(seasonalPageHeading('newyear','home')).toMatch(/Neues Jahr/)
    expect(seasonalPageHeading('newyear','library')).toMatch(/^Meine Inhalte/)
  })
  it('keeps the 5 atmosphere slots lightweight, original, local and focus-free',()=>{
    expect(SEASONAL_ATMOSPHERE_SLOTS).toEqual([
      'poster-background','detail-corner','navigation-accent','row-heading','hero-accent',
    ])
    for(const id of SEASONAL_CONTENT_MODES.map(x=>x.id)){
      const assets=seasonalVisualAssets(id)
      for(const value of Object.values(assets)){
        const file=new URL('../public'+value,import.meta.url)
        expect(existsSync(fileURLToPath(file)),`Missing ${value}`).toBe(true)
        if(value.endsWith('.svg')){
          const svg=readFileSync(file,'utf8')
          expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
          expect(svg).not.toMatch(/<script|foreignObject|<image|https?:\/\/[^"]+\.(?:svg|png|jpg)/i)
          expect(svg.length).toBeLessThan(2600)
        }else{
          const info=inspectSeasonalWebP(readFileSync(file))
          expect(info.animated).toBe(false)
          expect(info.bytes).toBeLessThan(1_500_000)
          if(value.includes('-corner.'))expect(info.alpha).toBe(true)
        }
      }
    }
    const css=read('../src/styles/seasonal-atmosphere.css')
    const theme=read('../src/theme/ThemeProvider.jsx')
    for(const value of ['.detail-layout-panel::after','.hero-carousel-eyebrow::before',
      '.row-heading h2::before','.topbar::after','--season-wallpaper'])
      expect(css+theme).toContain(value)
    expect(css).toContain('pointer-events: none')
    expect(css).not.toMatch(/@keyframes|backdrop-filter:/)
    expect(theme).toContain('root.dataset.seasonEnabled')
    expect(theme).toContain('seasonalVisualAssets(activeVisualSeason)')
  })

  it('keeps the seasonal detail corner behind movie, series and episode controls',()=> {
    const atmosphere=read('../src/styles/seasonal-atmosphere.css')
    const detailCss=read('../src/styles/detail.css')
    const titleModal=read('../src/components/DetailModal.jsx')
    const seriesNavigation=read('../src/components/detail/SeriesNavigation.jsx')
    const episodeDetail=read('../src/components/detail/EpisodeDetail.jsx')
    const layout=read('../src/components/detail/DetailLayout.jsx')
    expect(detailCss).toMatch(/\.detail-layout-panel\s*\{[^}]*isolation:\s*isolate;/s)
    expect(detailCss).toMatch(/\.detail-layout-panel\s*>\s*\.detail-layout\s*\{[^}]*z-index:\s*1;/s)
    expect(atmosphere).toMatch(/\.detail-layout-panel::after\s*\{[^}]*pointer-events:\s*none;[^}]*z-index:\s*0;/s)
    expect(titleModal).toContain('className="detail-modal detail-layout-panel"')
    expect(seriesNavigation).toContain('className="media-panel episode-detail-panel detail-layout-panel"')
    expect(episodeDetail).toContain('<DetailLayout episode')
    expect(layout).toContain('className={`detail-layout')
  })
  it('does not change tabs or hero visibility depending on translated promotional copy',()=>{
    const app=read('../src/App.jsx'),first=read('../src/components/HeroFirstPage.jsx'),hero=read('../src/components/Hero.jsx')
    expect(app).toContain('seasonalPageHeading(activeVisualSeason')
    expect(first).toContain('pageId={pageId}')
    expect(hero).toContain("pageId === 'library' ? 'myContent'")
    expect(hero).toContain("['home','movies','series','tv'].includes(pageId)")
    expect(app).toContain("['home', 'Home']")
    expect(app).toContain("['movies', 'Filme']")
    expect(app).toContain("['series', 'Serien']")
  })
})
