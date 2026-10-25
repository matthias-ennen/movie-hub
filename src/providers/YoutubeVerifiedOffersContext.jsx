import { createContext, useContext, useEffect, useState } from 'react'
import { loadYoutubeVerifiedTitleRoutes } from './youtubeVerifiedRouteRuntime.js'
import { loadYoutubeCuratedTitleHints } from './youtubeCuratedEditorialRuntime.js'
import { loadYoutubeBestEffortTitleLinks } from './youtubeBestEffortRouteRuntime.js'

// Shared by every poster and detail; no per-card network requests.
// Best-effort links can be revoked at Hosting while a Fire TV stays open.
// Recheck on app resume and occasionally while visible, without YouTube API use.
const BEST_EFFORT_RECHECK_MS = 15 * 60 * 1000
const YoutubeVerifiedOffersContext = createContext(null)

export function YoutubeVerifiedOffersProvider({ children }) {
  const [index, setIndex] = useState(null)
  const [curated, setCurated] = useState(null)
  const [bestEffort, setBestEffort] = useState(null)
  useEffect(() => {
    let active = true
    loadYoutubeVerifiedTitleRoutes().then((data) => {
      if (active) setIndex(data)
    })
    loadYoutubeCuratedTitleHints().then((data) => {
      if (active) setCurated(data)
    })

    let latestRequest = 0
    let lastRecheck = 0
    const refreshBestEffort = () => {
      const now = Date.now()
      // visibilitychange and focus commonly fire together on TV/WebView.
      if (now >= lastRecheck && now - lastRecheck < 1000) return
      lastRecheck = now
      const requestId = ++latestRequest
      // Until the current Hosted JSON is checked, use the existing search
      // fallback rather than keeping a revoked direct watch URL clickable.
      setBestEffort(null)
      loadYoutubeBestEffortTitleLinks().then((data) => {
        if (active && requestId === latestRequest) setBestEffort(data)
      })
    }
    const onResume = () => {
      if (document.visibilityState !== 'hidden') refreshBestEffort()
    }
    refreshBestEffort()
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    const interval = window.setInterval(onResume, BEST_EFFORT_RECHECK_MS)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
      window.clearInterval(interval)
    }
  }, [])
  return (
    <YoutubeVerifiedOffersContext.Provider value={{index,curated,bestEffort}}>
      {children}
    </YoutubeVerifiedOffersContext.Provider>
  )
}

export function useYoutubeVerifiedOffers() {
  return useContext(YoutubeVerifiedOffersContext)?.index ?? null
}

export function useYoutubeBestEffortLinks(){
  return useContext(YoutubeVerifiedOffersContext)?.bestEffort ?? null
}

export function useYoutubeCuratedEditorialHints(){
  return useContext(YoutubeVerifiedOffersContext)?.curated ?? null
}
