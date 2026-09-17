const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/
const DIAGNOSTIC_ID = 'moviehub-hero-trailer-diagnostic'
const DIAGNOSTIC_VERSION = 'D6'
const EMBED_LOAD_TIMEOUT_MS = 4500

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
  node.textContent = `Trailer-Diagnose ${DIAGNOSTIC_VERSION}: ${message}`
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

const nativePlayers = new Map()
let nativeSequence = 0

function nativeBridgeAvailable() {
  return typeof window !== 'undefined'
    && window.MovieHubHeroTrailer
    && typeof window.MovieHubHeroTrailer.create === 'function'
}

function ensureNativeEventDispatcher() {
  if (typeof window === 'undefined') return
  window.__movieHubNativeHeroTrailerEvent = (token, type, muted, detail) => {
    nativePlayers.get(String(token || ''))?.handleNativeEvent(type, muted, detail)
  }
}

class NativeHeroTrailerPlayer {
  constructor(host, options = {}) {
    this.host = host
    this.options = options
    this.videoId = String(options.videoId || '')
    this.destroyed = false
    this.muted = true
    this.volume = 100
    this.state = PLAYER_STATE.UNSTARTED
    this.token = `mh-${Date.now()}-${++nativeSequence}`

    ensureNativeEventDispatcher()
    nativePlayers.set(this.token, this)
    showTrailerDiagnostic(`Nativer Referer-Player wird erstellt · ${this.videoId}`)
    this.createNativeOverlay()
  }

  createNativeOverlay() {
    if (!this.host || !this.videoId || !nativeBridgeAvailable()) {
      this.options.events?.onError?.({ data: 'native-unavailable', target: this })
      return
    }

    const rect = this.host.getBoundingClientRect()
    const art = this.host.closest?.('.hero-art') || this.host.parentElement
    const radius = Number.parseFloat(art ? window.getComputedStyle(art).borderTopLeftRadius : '0') || 0
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || rect.width)

    try {
      window.MovieHubHeroTrailer.create(
        this.token,
        this.videoId,
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        radius,
        viewportWidth,
      )
    } catch {
      this.options.events?.onError?.({ data: 'native-create', target: this })
    }
  }

  handleNativeEvent(type, muted, detail) {
    if (this.destroyed) return

    if (type === 'diagnostic') {
      showTrailerDiagnostic(`${detail || 'Native Diagnose'} · ${this.videoId}`)
      return
    }

    if (type === 'ready') {
      showTrailerDiagnostic(`Nativer Referer-Player bereit · ${this.videoId}`)
      this.options.events?.onReady?.({ target: this })
      return
    }

    if (type === 'playing') {
      this.muted = Boolean(muted)
      this.state = PLAYER_STATE.PLAYING
      showTrailerDiagnostic(`Nativer Referer-Player PLAYING · ${this.videoId}`)
      this.options.events?.onStateChange?.({ data: PLAYER_STATE.PLAYING, target: this })
      return
    }

    if (type === 'ended') {
      this.state = PLAYER_STATE.ENDED
      showTrailerDiagnostic(`Nativer Referer-Player ENDED · ${this.videoId}`)
      this.options.events?.onStateChange?.({ data: PLAYER_STATE.ENDED, target: this })
      return
    }

    if (type === 'error') {
      showTrailerDiagnostic(`Nativer YouTube-Fehler ${detail || '?'} · ${this.videoId}`)
      this.options.events?.onError?.({ data: detail || 'native-error', target: this })
    }
  }

  playVideo() {
    showTrailerDiagnostic(`Native Wiedergabe wird angefordert · ${this.videoId}`)
    try {
      window.MovieHubHeroTrailer?.play?.(this.token)
    } catch {
      this.options.events?.onError?.({ data: 'native-play', target: this })
    }
  }

  mute() {
    this.muted = true
    try {
      window.MovieHubHeroTrailer?.setMuted?.(this.token, true)
    } catch {
      // Keep local state; native player remains usable.
    }
  }

  unMute() {
    this.muted = false
    try {
      window.MovieHubHeroTrailer?.setMuted?.(this.token, false)
    } catch {
      this.muted = true
    }
  }

  isMuted() {
    return this.muted
  }

  setVolume(value) {
    const numeric = Number(value)
    this.volume = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 100
  }

  getPlayerState() {
    return this.state
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    nativePlayers.delete(this.token)
    try {
      window.MovieHubHeroTrailer?.destroy?.(this.token)
    } catch {
      // Native teardown is best-effort; page navigation must continue.
    }
  }
}

const NATIVE_OVERLAY_API = Object.freeze({
  Player: NativeHeroTrailerPlayer,
  PlayerState: PLAYER_STATE,
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
    this.embedLoadTimer = null
    this.embedOrigin = 'https://www.youtube.com'
    this.noCookieAttempted = false
    this.messageHandler = (event) => this.handleMessage(event)

    showTrailerDiagnostic(`Direkt-Embed wird erstellt · ${this.videoId}`)
    this.createIframe()
  }

  buildEmbedUrl(origin) {
    const pageOrigin = window.location.origin
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
      origin: pageOrigin,
      widget_referrer: window.location.href,
    })
    return `${origin}/embed/${encodeURIComponent(this.videoId)}?${params}`
  }

  armEmbedLoadTimeout() {
    window.clearTimeout(this.embedLoadTimer)
    this.embedLoadTimer = window.setTimeout(() => {
      if (this.destroyed || !this.iframe) return

      if (!this.noCookieAttempted) {
        this.noCookieAttempted = true
        this.embedOrigin = 'https://www.youtube-nocookie.com'
        showTrailerDiagnostic(`youtube.com lädt nicht – No-Cookie-Fallback · ${this.videoId}`)
        this.iframe.src = this.buildEmbedUrl(this.embedOrigin)
        this.armEmbedLoadTimeout()
        return
      }

      showTrailerDiagnostic(`Auch No-Cookie-Embed lädt nicht · ${this.videoId}`)
      this.options.events?.onError?.({ data: 'iframe-timeout', target: this })
    }, EMBED_LOAD_TIMEOUT_MS)
  }

  createIframe() {
    if (!this.host || !this.videoId) {
      this.options.events?.onError?.({ data: 2, target: this })
      return
    }

    const iframe = document.createElement('iframe')
    iframe.className = 'hero-trailer-direct-iframe'
    iframe.src = this.buildEmbedUrl(this.embedOrigin)
    iframe.title = 'Movie Hub Trailer'
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
    iframe.allowFullscreen = false
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.setAttribute('frameborder', '0')
    iframe.setAttribute('tabindex', '-1')

    iframe.addEventListener('load', () => {
      if (this.destroyed) return
      window.clearTimeout(this.embedLoadTimer)
      showTrailerDiagnostic(`${this.noCookieAttempted ? 'No-Cookie-Embed' : 'Direkt-Embed'} geladen · ${this.videoId}`)
      window.addEventListener('message', this.messageHandler)
      this.send({ event: 'listening', id: `moviehub-${this.videoId}` })
      this.options.events?.onReady?.({ target: this })
    })

    iframe.addEventListener('error', () => {
      if (this.destroyed) return
      showTrailerDiagnostic(`Direkt-Embed Ladefehler · ${this.videoId}`)
      this.options.events?.onError?.({ data: 'iframe-load', target: this })
    })

    this.host.replaceChildren(iframe)
    this.iframe = iframe
    this.armEmbedLoadTimeout()
  }

  send(payload) {
    try {
      this.iframe?.contentWindow?.postMessage(JSON.stringify(payload), this.embedOrigin)
    } catch {
      // The direct embed remains usable even if WebView drops an optional command.
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
    const eventOrigin = String(event.origin || '')
    if (!eventOrigin.includes('youtube.com') && !eventOrigin.includes('youtube-nocookie.com')) return
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
    window.clearTimeout(this.embedLoadTimer)
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

  if (nativeBridgeAvailable()) {
    showTrailerDiagnostic('Nativer Referer-Player aktiv')
    ensureNativeEventDispatcher()
    return Promise.resolve(NATIVE_OVERLAY_API)
  }

  showTrailerDiagnostic('Direkt-Embed-Modus aktiv')
  return Promise.resolve(DIRECT_EMBED_API)
}
