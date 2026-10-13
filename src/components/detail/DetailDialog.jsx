import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { activeDetailDialog, registerDetailDialog } from '../detailDialogNavigation.js'

function candidates(panel) {
  return [...panel.querySelectorAll('button, input, select, textarea, video[controls], a[href], [tabindex]')]
    .filter((element) => !element.disabled && element.tabIndex >= 0
      && !element.closest('[inert]') && element.getClientRects().length > 0)
}

export default function DetailDialog({
  children, className = 'media-panel', backdropClassName = 'media-layer detail-backdrop',
  label, labelledBy, primary = false, onClose, returnFocusTarget,
  initialFocus = '[data-dialog-close]', focusReady = true, busy = false,
}) {
  const panel = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  const untouched = useRef(true)
  const returnTarget = useRef(null)

  useLayoutEffect(() => {
    const element = panel.current
    if (!returnTarget.current) returnTarget.current = returnFocusTarget || document.activeElement
    const target = returnTarget.current
    const unregister = registerDetailDialog(element, { primary, close: () => close.current?.() })
    function tab(event) {
      if (activeDetailDialog() !== element) return
      if (event.key === 'Tab') {
        const items = candidates(element)
        const index = items.indexOf(document.activeElement)
        if (!items.length) { event.preventDefault(); return }
        if (index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
          event.preventDefault()
          items[event.shiftKey ? items.length - 1 : 0].focus({ preventScroll: true })
        }
      }
      if (event.key === 'Tab' || event.key.startsWith('Arrow')) untouched.current = false
    }
    function pointer() { untouched.current = false }
    document.addEventListener('keydown', tab)
    element.addEventListener('pointerdown', pointer)
    return () => {
      unregister()
      document.removeEventListener('keydown', tab)
      element.removeEventListener('pointerdown', pointer)
      requestAnimationFrame(() => {
        const active = activeDetailDialog()
        if (target?.isConnected && (!active || active.contains(target))) {
          target.focus({ preventScroll: true })
        }
      })
    }
  }, [])

  useLayoutEffect(() => {
    const element = panel.current
    if (activeDetailDialog() !== element || !untouched.current) return
    const target = (focusReady && element.querySelector(initialFocus))
      || element.querySelector('[data-dialog-close]') || candidates(element)[0]
    target?.focus({ preventScroll: true })
    if (focusReady && target && !target.hasAttribute('data-dialog-close')) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
    }
  }, [focusReady, initialFocus])

  const content = (
    <div className={backdropClassName} role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close.current?.()}>
      <section ref={panel} className={className} role="dialog" aria-modal="true"
        aria-label={label} aria-labelledby={labelledBy} aria-busy={busy || undefined}
        data-detail-dialog={primary ? 'primary' : 'nested'}>
        {children}
      </section>
    </div>
  )
  return primary ? content : createPortal(content, document.body)
}
