const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/
const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api'
const DIAGNOSTIC_ID = 'moviehub-hero-trailer-diagnostic'
let youtubeApiPromise = null
let instrumentedYouTubeApi = null

function showTrailerDiagnostic(message) {
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

function stateLabel(yt, value) {
  const states = yt?.PlayerState || {}
  const labels = new Map([
    [states.UNSTARTED, 'UNSTARTED'],
    [states.ENDED, 'ENDED'],
    [states.PLAYING, 'PLAYING'],
    [states.PAUSED, 'PAUSED'],
    [states.BUFFERING, 'BUFFERING'],
    [states.CUED, 'CUED'],
  ])
  return labels.get(value) || String(value)
}

function instrumentYouTubeApi(yt) {
  if (!yt?.Player) return yt
  if (instrumentedYouTubeApi) return instrumentedYouTubeApi

  const OriginalPlayer = yt.Player
  function DiagnosticPlayer(host, options = {}) {
    const videoId = String(options.videoId || '?')
    showTrailerDiagnostic(`Player wird erstellt · ${videoId}`)
    const events = options.events || {}
    const wrappedOptions = {
      ...options,
      events: {
        ...events,
        onReady(event) {
          showTrailerDiagnostic(`Player bereit · ${videoId}`)
          events.onReady?.(event)
        },
        onStateChange(event) {
          showTrailerDiagnostic(`Status ${stateLabel(yt, event.data)} · ${videoId}`)
          events.onStateChange?.(event)
        },
        onError(event) {
          showTrailerDiagnostic(`YouTube-Fehler ${event?.data ?? '?'} · ${videoId}`)
          events.onError?.(event)
        },
      },
    }
    return new OriginalPlayer(host, wrappedOptions)
  }
  DiagnosticPlayer.prototype = OriginalPlayer.prototype

  instrumentedYouTubeApi = Object.create(yt)
  instrumentedYouTubeApi.Player = DiagnosticPlayer
  return instrumentedYouTubeApi
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

export function loadYouTubeIframeApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube player is only available in the browser'))
  }

  if (window.YT?.Player) {
    showTrailerDiagnostic('YouTube API bereits verfügbar')
    return Promise.resolve(instrumentYouTubeApi(window.YT))
  }
  if (youtubeApiPromise) return youtubeApiPromise

  showTrailerDiagnostic('YouTube API wird geladen …')
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady
    const existingScript = document.querySelector(`script[src="${YOUTUBE_API_SRC}"]`)
    const timeout = window.setTimeout(() => {
      showTrailerDiagnostic('YouTube API Timeout')
      reject(new Error('YouTube API timed out'))
    }, 8000)

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout)
      previousReady?.()
      if (window.YT?.Player) {
        showTrailerDiagnostic('YouTube API geladen')
        resolve(instrumentYouTubeApi(window.YT))
      } else {
        showTrailerDiagnostic('YouTube API nicht verfügbar')
        reject(new Error('YouTube API unavailable'))
      }
    }

    if (existingScript) return

    const script = document.createElement('script')
    script.src = YOUTUBE_API_SRC
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timeout)
      showTrailerDiagnostic('YouTube API Scriptfehler')
      reject(new Error('YouTube API failed to load'))
    }
    document.head.appendChild(script)
  }).catch((error) => {
    youtubeApiPromise = null
    throw error
  })

  return youtubeApiPromise
}
