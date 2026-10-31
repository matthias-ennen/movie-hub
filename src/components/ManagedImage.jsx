import { forwardRef, useEffect, useRef } from 'react'
import { imageAdmission, observeImage } from '../performance/imageAdmission.js'

// Assign sources only after viewport admission and a shared budget slot. The
// element exists at its final CSS size, so loading never changes page geometry.
export default forwardRef(function ManagedImage({ src, srcSet, sizes, priority = 1,
  loading = 'lazy', onLoad, onError, ...props }, forwardedRef) {
  const elementRef = useRef(null)
  const handlers = useRef({ onLoad, onError })
  handlers.current = { onLoad, onError }
  useEffect(() => {
    const image = elementRef.current
    if (!src || !image) return undefined
    let cancel = () => {}, timer, disposed = false, started = false, settled = false
    const clearSource = () => {
      image.removeAttribute('srcset'); image.removeAttribute('src')
      delete image.dataset.imageSettled
    }
    const activate = () => {
      if (started || disposed) return
      started = true
      cancel = imageAdmission.request({ priority,
        start(release) {
          const finish = (success, event) => {
            if (disposed || settled) return
            settled = true; clearTimeout(timer)
            image.onload = null; image.onerror = null
            image.dataset.imageSettled = success ? 'loaded' : 'error'
            release(); handlers.current[success ? 'onLoad' : 'onError']?.(event || { currentTarget: image })
          }
          image.onload = () => {
            if (typeof image.decode === 'function') image.decode().catch(() => {}).then(() => finish(true))
            else finish(true)
          }
          image.onerror = (event) => finish(false, event)
          timer = setTimeout(() => { clearSource(); finish(false) }, 10000)
          if (sizes) image.sizes = sizes
          if (srcSet) image.srcset = srcSet
          image.src = src
        },
        cancel() { clearTimeout(timer); image.onload = null; image.onerror = null; clearSource() },
      })
    }
    const stop = loading === 'eager' ? (activate(), () => {}) : observeImage(image, activate)
    const card = image.closest('button')
    card?.addEventListener('focus', activate)
    return () => {
      disposed = true; stop(); card?.removeEventListener('focus', activate)
      cancel(); clearTimeout(timer); image.onload = null; image.onerror = null; clearSource()
    }
  }, [src, srcSet, sizes, priority, loading])
  return <img {...props} loading="eager" decoding="async" data-managed-image="true" ref={(element) => {
    elementRef.current = element
    if (typeof forwardedRef === 'function') forwardedRef(element)
    else if (forwardedRef) forwardedRef.current = element
  }} />
})
