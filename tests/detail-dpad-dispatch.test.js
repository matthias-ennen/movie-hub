import { afterEach, describe, expect, it, vi } from 'vitest'
const effects = vi.hoisted(() => [])
vi.mock('react', () => ({ useEffect: callback => { effects.push(callback) } }))
import { useDpadNavigation } from '../src/hooks/useDpadNavigation.js'

let cleanup
afterEach(() => { cleanup?.(); cleanup = null; effects.length = 0; vi.unstubAllGlobals() })

function mount() {
  const listeners = new Map()
  const headGroup = {}
  const scope = { matches: selector => selector === '[data-dpad-navigation="rows"]' }
  const port = { parentElement: scope, clientTop: 0, clientHeight: 400, scrollHeight: 1200, scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0 }), scrollTo: vi.fn(({ top }) => { port.scrollTop = top }) }
  const doc = { activeElement: null, body: {}, querySelector: selector => selector === '.detail-modal' ? scope : null,
    querySelectorAll: () => [] }
  function button(id, x, y, group) {
    const element = { id, parentElement: port, offsetParent: port, disabled: false,
      getAttribute: () => null,
      matches: () => false,
      closest: selector => selector === '[data-dpad-row-group]' ? group : null,
      getBoundingClientRect: () => ({ left: x, top: y - port.scrollTop, width: 44, height: 44,
        right: x + 44, bottom: y + 44 - port.scrollTop }),
      focus: vi.fn(() => { doc.activeElement = element }) }
    return element
  }
  const buttons = [button('edit', 650, 20, headGroup), button('bell', 710, 20, headGroup), button('close', 770, 20, headGroup),
    button('read', 300, 240), button('season', 300, 440), button('episode', 300, 540),
    button('provider', 770, 660), button('favorite', 300, 790), button('rating1', 300, 870), button('rating6', 300, 930)]
  scope.querySelectorAll = () => buttons
  doc.activeElement = buttons[2]
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { requestAnimationFrame: () => 1, cancelAnimationFrame: vi.fn(),
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) })
  vi.stubGlobal('getComputedStyle', () => ({ overflowY: 'auto', scrollPaddingTop: '24', scrollPaddingBottom: '24' }))
  let now = 1000
  vi.stubGlobal('performance', { now: () => now })
  const onBack = vi.fn(() => true)
  useDpadNavigation({ detailOpen: true, onBack })
  cleanup = effects.pop()()
  function key(key, { repeat = false, release = true, elapsed = 100 } = {}) {
    now += elapsed
    const event = { key, repeat, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    listeners.get('keydown')(event)
    if (release) listeners.get('keyup')({ key })
    return event
  }
  return { doc, buttons, port, key, onBack }
}

describe('D-Pad-Dispatcher mit aktivem Detaildialog', () => {
  it('nimmt auch bei schnellen einzelnen Tastendrücken jede Zeile mit und erreicht beide Scrollenden', () => {
    const { doc, port, key } = mount()
    const seen = []
    for (let i = 0; i < 7; i++) { key('ArrowDown', { elapsed: 30 }); seen.push(doc.activeElement.id) }
    expect(seen).toEqual(['read', 'season', 'episode', 'provider', 'favorite', 'rating1', 'rating6'])
    expect(port.scrollTop).toBe(800)
    for (let i = 0; i < 7; i++) key('ArrowUp', { elapsed: 30 })
    expect(doc.activeElement.id).toBe('edit')
    expect(port.scrollTop).toBe(0)
  })
  it('drosselt gehaltene Tasten ohne Zeilensprung und erhält horizontale Grenzen', () => {
    const { doc, port, key } = mount()
    key('ArrowRight')
    expect(doc.activeElement.id).toBe('close')
    key('ArrowDown', { release: false })
    key('ArrowDown', { repeat: true, release: false, elapsed: 20 })
    expect(doc.activeElement.id).toBe('read')
    key('ArrowDown', { repeat: true, elapsed: 100 })
    expect(doc.activeElement.id).toBe('season')
    expect(port.scrollTo.mock.lastCall[0].behavior).toBe('auto')
    key('ArrowRight')
    expect(doc.activeElement.id).toBe('season')
  })
  it('lässt die bestehende Hardware-Zurück-Behandlung unverändert', () => {
    const { key, onBack, port } = mount()
    const event = key('BrowserBack')
    expect(onBack).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(port.scrollTo).not.toHaveBeenCalled()
  })
})
