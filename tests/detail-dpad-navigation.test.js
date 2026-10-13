import { afterEach, describe, expect, it, vi } from 'vitest'
import { detailNavigationRows, detailRowTarget, detailScrollTop, navigateDetailRows } from '../src/navigation/detailDpadNavigation.js'

const box = (element, left, top, width = 44, height = 44, group = 'content') => ({
  element, group, rect: { left, top, width, height, right: left + width, bottom: top + height },
})
const target = (items, active, direction) => detailRowTarget(detailNavigationRows(items), active, direction)?.element

describe('Detaildialog: benachbarte Bedienzeilen', () => {
  const items = [box('edit', 680, 20, 44, 44, 'head'), box('bell', 740, 20, 44, 44, 'head'),
    box('close', 800, 20, 44, 44, 'head'), box('read', 300, 250, 90),
    box('season', 300, 400, 540, 64), box('episode', 300, 480, 540, 64),
    box('waipu', 300, 650, 130), box('joyn', 450, 650, 130),
    box('favorite', 300, 800, 165), box('watchlist', 485, 800, 165), box('watched', 670, 800, 165)]

  it('erreicht vom rechten Schließen die einzelne nächste Aktion links', () => {
    expect(target(items, 'close', 'ArrowDown')).toBe('read')
  })
  it('durchläuft jede Bedienzeile abwärts und aufwärts trotz großer seitlicher Abstände', () => {
    let active = 'close'
    const down = []
    for (let i = 0; i < 5; i++) { active = target(items, active, 'ArrowDown'); down.push(active) }
    expect(down).toEqual(['read', 'season', 'episode', 'joyn', 'watchlist'])
    const up = []
    for (let i = 0; i < 5; i++) { active = target(items, active, 'ArrowUp'); up.push(active) }
    expect(up).toEqual(['joyn', 'episode', 'season', 'read', 'edit'])
  })
  it('bleibt horizontal in der Zeile und am Rand ohne Umbruch stehen', () => {
    expect(target(items, 'close', 'ArrowLeft')).toBe('bell')
    expect(target(items, 'bell', 'ArrowLeft')).toBe('edit')
    expect(target(items, 'edit', 'ArrowLeft')).toBe('edit')
    expect(target(items, 'close', 'ArrowRight')).toBe('close')
    expect(target(items, 'read', 'ArrowRight')).toBe('read')
    expect(target(items, 'joyn', 'ArrowRight')).toBe('joyn')
  })
  it('berücksichtigt fehlende/deaktivierte Buttons im gefilterten Kandidatenbestand', () => {
    const available = items.filter(item => !['bell', 'episode'].includes(item.element))
    expect(target(available, 'close', 'ArrowLeft')).toBe('edit')
    expect(target(available, 'season', 'ArrowDown')).toBe('joyn')
  })
  it.each([3, 5, 10])('ordnet umgebrochene Bewertungen bei %i Spalten nach sichtbaren Zeilen', columns => {
    const ratings = Array.from({ length: 10 }, (_, index) => box(index + 1, (index % columns) * 60, Math.floor(index / columns) * 60))
    const rows = detailNavigationRows(ratings)
    expect(rows).toHaveLength(Math.ceil(10 / columns))
    expect(target(ratings, 1, 'ArrowDown')).toBe(columns === 10 ? 1 : columns + 1)
    expect(target(ratings, columns, 'ArrowRight')).toBe(columns)
    expect(detailRowTarget(rows, 10, 'ArrowDown').last).toBe(true)
  })
  it('bleibt unabhängig von Scrolloffset und Fokusvergrößerung', () => {
    const scrolled = items.map(item => box(item.element, item.rect.left, item.rect.top - 550,
      item.rect.width, item.element === 'episode' ? 66 : item.rect.height, item.group))
    expect(target(scrolled, 'episode', 'ArrowUp')).toBe('season')
    expect(target(scrolled, 'episode', 'ArrowDown')).toBe('joyn')
  })
  it('ordnet feste Dialogköpfe vor gescrollten Listen, auch bei geometrischer Überlappung', () => {
    const nested = [box('close', 800, 20, 44, 44, 'head'), box('first', 300, -90, 550, 168),
      box('second', 300, 95, 550, 168)]
    expect(target(nested, 'close', 'ArrowDown')).toBe('first')
    expect(target(nested, 'first', 'ArrowUp')).toBe('close')
  })
  it('behält eine gemeinsame Zeile bei unterschiedlichen Kontrollhöhen', () => {
    const mixed = [box('short', 0, 20), box('tall', 100, 5, 150, 74), box('next', 0, 100)]
    expect(target(mixed, 'short', 'ArrowRight')).toBe('tall')
    expect(target(mixed, 'tall', 'ArrowDown')).toBe('next')
  })
})

describe('Detaildialog: Scrollgrenzen und Randabstand', () => {
  const port = { scrollTop: 500, scrollHeight: 1600, clientHeight: 500, top: 400, bottom: 444, margin: 24 }
  it('zeigt bei der letzten Bewertungszeile auch den verbleibenden Innenabstand', () => {
    expect(detailScrollTop({ ...port, last: true })).toBe(1100)
  })
  it('kehrt mit der Kopfzeile vollständig zum Seitenanfang zurück', () => {
    expect(detailScrollTop({ ...port, first: true })).toBe(0)
  })
  it('hält Zwischenziele vollständig im sicheren Sichtbereich', () => {
    expect(detailScrollTop({ ...port, top: 470, bottom: 514 })).toBe(538)
    expect(detailScrollTop({ ...port, top: -12, bottom: 32 })).toBe(464)
    expect(detailScrollTop(port)).toBe(500)
  })
  it('richtet sehr hohe Elemente am Anfang aus und begrenzt gültige Scrollwerte', () => {
    expect(detailScrollTop({ ...port, top: 100, bottom: 800 })).toBe(576)
    expect(detailScrollTop({ ...port, scrollTop: 0, top: 0, bottom: 44 })).toBe(0)
    expect(detailScrollTop({ ...port, scrollHeight: 400, last: true })).toBe(0)
  })
})

describe('Detaildialog: Fokus und richtiger Scrollcontainer', () => {
  afterEach(() => vi.unstubAllGlobals())
  it.each(['smooth', 'auto'])('scrollt bei %s nur den inneren Dialog bis zum Ende', behavior => {
    vi.stubGlobal('getComputedStyle', () => ({ overflowY: 'auto', scrollPaddingTop: '24px', scrollPaddingBottom: '24px' }))
    const scope = { matches: () => true }
    const port = { parentElement: scope, scrollHeight: 1200, clientHeight: 400, clientTop: 0,
      scrollTop: 600, getBoundingClientRect: () => ({ top: 50 }), scrollTo: vi.fn() }
    const make = (x, y) => ({ parentElement: port, closest: () => null, focus: vi.fn(),
      getBoundingClientRect: () => box('', x, y).rect })
    const head = make(700, -550), first = make(300, 300), last = make(300, 360)
    expect(navigateDetailRows(scope, [head, first, last], first, 'ArrowDown', behavior)).toBe(true)
    expect(last.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(port.scrollTo).toHaveBeenCalledWith({ top: 800, behavior })
    navigateDetailRows(scope, [head, first, last], first, 'ArrowUp', behavior)
    expect(port.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior })
  })
  it('übernimmt keine Navigation außerhalb der ausdrücklich markierten Dialoge', () => {
    expect(navigateDetailRows({ matches: () => false }, [], null, 'ArrowDown', 'auto')).toBe(false)
  })

  function editor() {
    vi.stubGlobal('getComputedStyle', () => ({ overflowY: 'auto', scrollPaddingTop: '16px', scrollPaddingBottom: '16px' }))
    const scope = { matches: () => true }
    const port = { parentElement: scope, scrollHeight: 1200, clientHeight: 400, clientTop: 0,
      scrollTop: 600, getBoundingClientRect: () => ({ top: 100 }), scrollTo: vi.fn() }
    const make = (x, y, parent = port) => ({ parentElement: parent, closest: () => parent, focus: vi.fn(),
      getBoundingClientRect: () => box('', x, y).rect })
    const close = make(700, 30, scope), link = make(300, -350), video = make(500, -350),
      date = make(300, 180), note = make(300, 280), save = make(300, 400)
    const buttons = [close, link, video, date, note, save]
    return { scope, port, close, link, video, date, note, save, buttons }
  }
  it('scrollt beim festen Schließen oberhalb des Editors den benachbarten Inhalt vollständig zurück', () => {
    const { scope, port, close, link, buttons } = editor()
    navigateDetailRows(scope, buttons, link, 'ArrowUp', 'auto')
    expect(close.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(port.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
  it('zeigt bereits bei der ersten Inhaltszeile die Kachelüberschrift und den oberen Abstand', () => {
    const { scope, port, link, date, buttons } = editor()
    navigateDetailRows(scope, buttons, date, 'ArrowUp', 'smooth')
    expect(link.focus).toHaveBeenCalledOnce()
    expect(port.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
  it('stellt den Anfang auch wieder her, wenn Schließen nach manuellem Scrollen schon fokussiert ist', () => {
    const { scope, port, close, buttons } = editor()
    navigateDetailRows(scope, buttons, close, 'ArrowUp', 'auto')
    expect(port.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
  it('scrollt bei Notiz speichern einschließlich restlicher Kachel und Innenabstand ganz nach unten', () => {
    const { scope, port, note, save, buttons } = editor()
    navigateDetailRows(scope, buttons, note, 'ArrowDown', 'auto')
    expect(save.focus).toHaveBeenCalledOnce()
    expect(port.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'auto' })
  })
  it('behandelt Eingabefelder zwischen den Randzeilen weiterhin als Zwischenziele', () => {
    const { scope, port, date, note, buttons } = editor()
    navigateDetailRows(scope, buttons, date, 'ArrowDown', 'auto')
    expect(note.focus).toHaveBeenCalledOnce()
    expect(port.scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'auto' })
  })
})
