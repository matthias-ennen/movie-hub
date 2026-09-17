const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/
const DIAGNOSTIC_ID = 'moviehub-hero-trailer-diagnostic'
const DIAGNOSTIC_VERSION = 'D10'
const DIAGNOSTIC_MAX_LINES = 9
const diagnosticLines = []

export function showTrailerDiagnostic(message) {
  if (typeof document === 'undefined') return
  const text = String(message || '?')
  if (diagnosticLines[diagnosticLines.length - 1] !== text) {
    diagnosticLines.push(text)
    while (diagnosticLines.length > DIAGNOSTIC_MAX_LINES) diagnosticLines.shift()
  }

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
      maxWidth: 'min(94vw, 820px)',
      padding: '10px 12px',
      borderRadius: '8px',
      background: 'rgba(0, 0, 0, 0.9)',
      color: '#fff',
      font: '600 12px/1.35 system-ui, sans-serif',
      whiteSpace: 'pre-line',
      pointerEvents: 'none',
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
    })
    document.body.appendChild(node)
  }
  node.textContent = `Trailer-Diagnose ${DIAGNOSTIC_VERSION}\n${diagnosticLines.map((line) => `• ${line}`).join('\n')}`
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

function runBlankIframeProbe() {
  return new Promise((resolve) => {
    const probe = document.createElement('iframe')
    probe.setAttribute('aria-hidden', 'true')
    probe.tabIndex = -1
    Object.assign(probe.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      left: '-10px',
      top: '-10px',
    })

    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      probe.remove()
      resolve(result)
    }
    probe.addEventListener('load', () => finish('load'))
    probe.addEventListener('error', () => finish('error'))
    const timer = window.setTimeout(() => finish('timeout'), 2000)
    probe.src = 'about:blank'
    document.body.appendChild(probe)
  })
}

async function runHostedPageFetchProbe(origin) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 3500)
  try {
    const response = await fetch(`${origin}/hero-player.html?diag=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
    const body = await response.text()
    return `HTTP ${response.status} · ${body.length} Bytes`
  } catch (error) {
    if (error?.name === 'AbortError') return 'Timeout nach 3,5 s'
    return `HTTP-Abruf Fehler · ${error?.name || 'Error'}: ${error?.message || '?'}`
  } finally {
    clearTimeout(timeout)
  }
}

class HostedHeroTrailerPlayer {
  constructor(host, options = {}) {
    this.host = host
    this.options = options
    this.videoId = String(options.videoId || '')
    this.iframe = null
    this.destroyed = false
    this.muted = true
    this.volume = 100
    this.state = PLAYER_STATE.UNSTARTED
    this.origin = window.location.origin
    this.messageHandler = (event) => this.handleMessage(event)
    this.iframeLoadTimeout = null

    showTrailerDiagnostic(`Start · ${this.videoId}`)
    showTrailerDiagnostic(`Origin ${this.origin} · online=${navigator.onLine} · visible=${document.visibilityState}`)
    this.createIframe()
  }

  async createIframe() {
    if (!this.host || !YOUTUBE_KEY_PATTERN.test(this.videoId)) {
      this.options.events?.onError?.({ data: 'invalid-video', target: this })
      return
    }

    const blankProbe = await runBlankIframeProbe()
    if (this.destroyed) return
    showTrailerDiagnostic(`about:blank-IFrame: ${blankProbe}`)

    runHostedPageFetchProbe(this.origin).then((fetchProbe) => {
      if (!this.destroyed) showTrailerDiagnostic(`hero-player Fetch: ${fetchProbe}`)
    })

    const iframe = document.createElement('iframe')
    iframe.className = 'hero-trailer-direct-iframe'
    iframe.src = `${this.origin}/hero-player.html?embed=${Date.now()}`
    iframe.title = 'Movie Hub Trailer'
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
    iframe.allowFullscreen = false
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.setAttribute('frameborder', '0')
    iframe.setAttribute('tabindex', '-1')

    window.addEventListener('message', this.messageHandler)

    iframe.addEventListener('load', () => {
      if (this.destroyed) return
      clearTimeout(this.iframeLoadTimeout)
      showTrailerDiagnostic(`Hosted-IFrame LOAD · ${this.videoId}`)
      this.send({ action: 'load', videoId: this.videoId })
    })

    iframe.addEventListener('error', () => {
      if (this.destroyed) return
      clearTimeout(this.iframeLoadTimeout)
      showTrailerDiagnostic(`Hosted-IFrame ERROR · ${this.videoId}`)
      this.options.events?.onError?.({ data: 'hosted-iframe-load', target: this })
    })

    this.host.replaceChildren(iframe)
    this.iframe = iframe
    showTrailerDiagnostic(`Hosted-IFrame ins DOM gesetzt · ${this.videoId}`)

    this.iframeLoadTimeout = window.setTimeout(() => {
      if (this.destroyed || this.iframe !== iframe) return
      let readyState = '?'
      let href = '?'
      let access = 'nein'
      try {
        readyState = iframe.contentDocument?.readyState || 'null'
        href = iframe.contentWindow?.location?.href || 'null'
        access = 'ja'
      } catch (error) {
        access = `nein (${error?.name || 'Error'})`
      }
      showTrailerDiagnostic(`IFrame TIMEOUT · readyState=${readyState} · Zugriff=${access}`)
      showTrailerDiagnostic(`IFrame URL ${href}`)
    }, 5000)
  }

  send(payload) {
    try {
      this.iframe?.contentWindow?.postMessage({
        source: 'moviehub-hero',
        ...payload,
      }, this.origin)
    } catch (error) {
      showTrailerDiagnostic(`postMessage Fehler · ${error?.name || 'Error'}`)
    }
  }

  handleMessage(event) {
    if (this.destroyed || event.origin !== this.origin || event.source !== this.iframe?.contentWindow) return
    const message = event.data
    if (!message || message.source !== 'moviehub-hero-player') return

    if (message.type === 'diagnostic') {
      showTrailerDiagnostic(`${message.detail || '?'} · ${this.videoId}`)
      return
    }

    if (message.type === 'ready') {
      this.state = PLAYER_STATE.CUED
      showTrailerDiagnostic(`Hosted-Player bereit · ${this.videoId}`)
      this.options.events?.onReady?.({ target: this })
      return
    }

    if (message.type === 'playing') {
      this.state = PLAYER_STATE.PLAYING
      this.muted = Boolean(message.muted)
      showTrailerDiagnostic(`Hosted-Player PLAYING · ${this.videoId}`)
      this.options.events?.onStateChange?.({ data: PLAYER_STATE.PLAYING, target: this })
      return
    }

    if (message.type === 'ended') {
      this.state = PLAYER_STATE.ENDED
      showTrailerDiagnostic(`Hosted-Player ENDED · ${this.videoId}`)
      this.options.events?.onStateChange?.({ data: PLAYER_STATE.ENDED, target: this })
      return
    }

    if (message.type === 'error') {
      showTrailerDiagnostic(`Hosted-Player Fehler ${message.detail || '?'} · ${this.videoId}`)
      this.options.events?.onError?.({ data: message.detail || 'hosted-player', target: this })
    }
  }

  playVideo() {
    showTrailerDiagnostic(`Hosted-Wiedergabe angefordert · ${this.videoId}`)
    this.send({ action: 'play' })
  }

  mute() {
    this.muted = true
    this.send({ action: 'mute' })
  }

  unMute() {
    this.muted = false
    this.send({ action: 'unmute' })
  }

  isMuted() {
    return this.muted
  }

  setVolume(value) {
    const numeric = Number(value)
    this.volume = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 100
    this.send({ action: 'volume', value: this.volume })
  }

  getPlayerState() {
    return this.state
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    clearTimeout(this.iframeLoadTimeout)
    this.send({ action: 'stop' })
    window.removeEventListener('message', this.messageHandler)
    this.host?.replaceChildren()
    this.iframe = null
  }
}

const HOSTED_PLAYER_API = Object.freeze({
  Player: HostedHeroTrailerPlayer,
  PlayerState: PLAYER_STATE,
})

export function loadYouTubeIframeApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube player is only available in the browser'))
  }

  showTrailerDiagnostic('Hosted-Player Diagnosemodus aktiv')
  return Promise.resolve(HOSTED_PLAYER_API)
}
