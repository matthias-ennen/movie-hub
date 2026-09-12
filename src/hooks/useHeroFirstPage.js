import { useCallback, useRef, useState } from 'react'

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function useHeroFirstPage(pageId) {
  const [heroReady, setHeroReady] = useState(false)
  const readyRef = useRef(false)
  const startedAtRef = useRef(now())

  const handleHeroReady = useCallback((detail = {}) => {
    if (readyRef.current) return

    readyRef.current = true
    setHeroReady(true)

    const durationMs = Math.round(now() - startedAtRef.current)
    const measurement = {
      pageId,
      durationMs,
      reason: detail.reason || 'unknown',
      titleId: detail.item?.id || null,
    }

    console.info(`[Movie Hub] Hero ${pageId} nach ${durationMs} ms bereit.`, measurement)
    window.dispatchEvent(new CustomEvent('moviehub:hero-ready', { detail: measurement }))
  }, [pageId])

  return { heroReady, handleHeroReady }
}
