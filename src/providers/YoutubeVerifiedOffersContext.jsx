import { useBackgroundReady } from '../performance/startupPhase.js'
import { createContext, useContext, useEffect, useState } from 'react'
import { loadYoutubeVerifiedTitleRoutes } from './youtubeVerifiedRouteRuntime.js'
import { loadYoutubeCuratedTitleHints } from './youtubeCuratedEditorialRuntime.js'
import { loadYoutubeBestEffortTitleLinks } from './youtubeBestEffortRouteRuntime.js'
import { createYoutubeLinkRefreshController } from './youtubeLinkRefreshController.js'

// Shared by every poster and detail; no per-card network requests.
// Playlist, verified and best-effort links may change while Fire TV stays open.
// Recheck on foreground return, without polling or per-card requests.
const YoutubeVerifiedOffersContext = createContext(null)

export function YoutubeVerifiedOffersProvider({ children }) {
  const [index, setIndex] = useState(null)
  const [curated, setCurated] = useState(null)
  const [bestEffort, setBestEffort] = useState(null)
  const backgroundReady = useBackgroundReady()
  useEffect(() => {
    if (!backgroundReady) { setIndex(null); setCurated(null); setBestEffort(null); return undefined }
    const controller = createYoutubeLinkRefreshController({
      loadVerified: loadYoutubeVerifiedTitleRoutes,
      loadCurated: loadYoutubeCuratedTitleHints,
      loadBestEffort: loadYoutubeBestEffortTitleLinks,
      setVerified: setIndex,
      setCurated,
      setBestEffort,
    })
    const onResume = () => {
      if (document.visibilityState !== 'hidden') controller.refresh()
    }
    controller.refresh()
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    return () => {
      controller.stop()
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
    }
  }, [backgroundReady])
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
