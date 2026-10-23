import { createContext, useContext, useEffect, useState } from 'react'
import { loadYoutubeVerifiedTitleRoutes } from './youtubeVerifiedRouteRuntime.js'

// One bounded fetch for the whole app, shared by every poster and detail.
// Missing/invalid feed leaves TMDB badges and their existing links unchanged.
const YoutubeVerifiedOffersContext = createContext(null)

export function YoutubeVerifiedOffersProvider({ children }) {
  const [index, setIndex] = useState(null)
  useEffect(() => {
    let active = true
    loadYoutubeVerifiedTitleRoutes().then((data) => {
      if (active) setIndex(data)
    })
    return () => { active = false }
  }, [])
  return (
    <YoutubeVerifiedOffersContext.Provider value={index}>
      {children}
    </YoutubeVerifiedOffersContext.Provider>
  )
}

export function useYoutubeVerifiedOffers() {
  return useContext(YoutubeVerifiedOffersContext)
}
