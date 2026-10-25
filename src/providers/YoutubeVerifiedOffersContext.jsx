import { createContext, useContext, useEffect, useState } from 'react'
import { loadYoutubeVerifiedTitleRoutes } from './youtubeVerifiedRouteRuntime.js'
import { loadYoutubeCuratedTitleHints } from './youtubeCuratedEditorialRuntime.js'
import { loadYoutubeBestEffortTitleLinks } from './youtubeBestEffortRouteRuntime.js'

// One bounded fetch for the whole app, shared by every poster and detail.
// Missing/invalid feed leaves TMDB badges and their existing links unchanged.
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
    loadYoutubeBestEffortTitleLinks().then((data) => {
      if (active) setBestEffort(data)
    })
    return () => { active = false }
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
