const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/
const DIAGNOSTIC_ID = 'moviehub-hero-trailer-diagnostic'

export function showTrailerDiagnostic(message) {
  if (typeof document === 'undefined') return
  let node = document.getElementById(DIAGNOSTIC_ID)
  if (!node) {
    node = document.createElement('div')
    node.id = DIAGNOSTIC_ID
    node.setAttribute('role', 'status')
    Object.assign(node.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      zIndex: '2147483647',
      maxWidth: 'min(92vw, 720px)',
      padding: '8px 12px',
      borderRadius: '8px',
      background: 'rgba(0, 0, 0, 0.86)',
      color: '#fff',
      font: '600 13px/1.35 system-ui, sans-serif',
      pointerEvents: 'none',
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
    })
    document.body.appendChild(node)
  }
  node.textContent = `Trailer-Diagnose: ${message}`
}

export function selectHeroVideo(videos) {
  const candidates = Array.isArray(videos) ? videos : []
  const normalized = candidates.filter((video) => (
    video
    && String(video.site || '').toLowerCase() === 'youtube'
    && YOUTUBE_KEY_PATTERN.test(String(video.key || ''))
    && ['trailer', 'teaser'].includes(String(video.type || '').toLowerCase())
  ))

  return normalized.find((video) => String(video.type || '').toLowerCase() === 'trailer')
    || normalized.find((video) => String(video.type || '').toLowerCase() === 'teaser')
    || null
}

const PLAYER_STATE = Object.freeze({
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
})

function parseYouTubeMessage(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

class DirectYouTubeEmbedPlayer {
  constructor(host, options = {}) {
    this.host = host
    this.options = options
    this.videoId = String(options.videoId || '')
    this.iframe = null
    this.destroyed = false
    this.muted = true
    this.volume = 100
    this.state = PLAYER_STATE.UNSTARTED
    this.fallbackPlayingTimer = null
    this.messageHandler = (event) => this.handleMessage(event)

    showTrailerDiagnostic(`Direkt-Embed wird erstellt · ${this.videoId}`)
    this.createIframe()
  }

  createIframe() {
    if (!this.host || !this.videoId) {
      this.options.events?.onError?.({ data: 2, target: this })
      return
    }

    const origin = window.location.origin
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      controls: '0',
      disablekb: '1',
      fs: '0',
      iv_load_policy: '3',
      playsinline: '1',
      rel: '0',
      enablejsapi: '1',
      origin,
      widget_referrer: window.location.href,
    })

    const iframe = document.createElement('iframe')
    iframe.className = 'hero-trailer-direct-iframe'
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(this.videoId)}?${params}`
    iframe.title = 'Movie Hub Trailer'
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
    iframe.allowFullscreen = false
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.setAttribute('frameborder', '0')
    iframe.setAttribute('tabindex', '-1')

    iframe.addEventListener('load', () => {
      if (this.destroyed) return
      showTrailerDiagnostic(`Direkt-Embed geladen · ${this.videoId}`)
      window.addEventListener('message', this.messageHandler)
      this.send({ event: 'listening', id: `moviehub-${this.videoId}` })
      this.options.events?.onReady?.({ target: this })
    }, { once: true })

    iframe.addEventListener('error', () => {
      if (this.destroyed) return
      showTrailerDiagnostic(`Direkt-Embed Ladefehler · ${this.videoId}`)
      this.options.events?.onError?.({ data: 'iframe-load', target: this })
    }, { once: true })

    this.host.replaceChildren(iframe)
    this.iframe = iframe
  }

  send(payload) {
    try {
      this.iframe?.contentWindow?.postMessage(JSON.stringify(payload), 'https://www.youtube.com')
    } catch {
      // Der direkte Embed bleibt als Wiedergabefläche bestehen, auch wenn eine
      // optionale JS-Steuerungsnachricht vom WebView verworfen wird.
    }
  }

  command(func, args = []) {
    this.send({ event: 'command', func, args })
  }

  emitState(state) {
    if (this.destroyed || state === this.state) return
    this.state = state
    const label = Object.entries(PLAYER_STATE).find(([, value]) => value === state)?.[0] || String(state)
    showTrailerDiagnostic(`Direkt-Embed Status ${label} · ${this.videoId}`)
    this.options.events?.onStateChange?.({ data: state, target: this })
  }

  handleMessage(event) {
    if (this.destroyed || event.source !== this.iframe?.contentWindow) return
    if (!String(event.origin || '').includes('youtube.com')) return
    const message = parseYouTubeMessage(event.data)
    if (!message) return

    if (message.event === 'onStateChange' && Number.isFinite(Number(message.info))) {
      this.emitState(Number(message.info))
      return
    }

    const deliveredState = Number(message?.info?.playerState)
    if (message.event === 'infoDelivery' && Number.isFinite(deliveredState)) {
      this.emitState(deliveredState)
    }
  }

  playVideo() {
    showTrailerDiagnostic(`Wiedergabe wird angefordert · ${this.videoId}`)
    this.command('playVideo')
    window.clearTimeout(this.fallbackPlayingTimer)
    this.fallbackPlayingTimer = window.setTimeout(() => {
      // Manche Android-WebViews liefern die YouTube-postMessage-Events nicht
      // zurück. Der IFrame selbst kann trotzdem korrekt autoplayen. In diesem
      // Fall machen wir nach erfolgreichem IFrame-load die Ebene sichtbar.
      if (!this.destroyed && this.state !== PLAYER_STATE.PLAYING) {
        showTrailerDiagnostic(`Embed geladen, Status-Rückmeldung fehlt · ${this.videoId}`)
        this.emitState(PLAYER_STATE.PLAYING)
      }
    }, 1200)
  }

  mute() {
    this.muted = true
    this.command('mute')
  }

  unMute() {
    this.muted = false
    this.command('unMute')
  }

  isMuted() {
    return this.muted
  }

  setVolume(value) {
    const numeric = Number(value)
    this.volume = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 100
    this.command('setVolume', [this.volume])
  }

  getPlayerState() {
    return this.state
  }

  destroy() {
    this.destroyed = true
    window.clearTimeout(this.fallbackPlayingTimer)
    window.removeEventListener('message', this.messageHandler)
    try {
      this.command('stopVideo')
    } catch {
      // Ignore teardown races.
    }
    this.host?.replaceChildren()
    this.iframe = null
  }
}

const DIRECT_EMBED_API = Object.freeze({
  Player: DirectYouTubeEmbedPlayer,
  PlayerState: PLAYER_STATE,
})

export function loadYouTubeIframeApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube player is only available in the browser'))
  }

  showTrailerDiagnostic('Direkt-Embed-Modus aktiv')
  return Promise.resolve(DIRECT_EMBED_API)
}
