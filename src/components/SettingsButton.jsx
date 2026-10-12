// Pending saves must not remove the focused control from the D-pad path.
// Guard activation explicitly: aria-disabled alone does not block a click.
export default function SettingsButton({ disabled = false, onClick, children, ...props }) {
  const unavailable = disabled || props['aria-disabled'] === true
  return (
    <button
      type="button"
      data-focusable="true"
      {...props}
      aria-disabled={unavailable || undefined}
      onClick={(event) => {
        if (unavailable) { event.preventDefault(); return }
        const target = event.currentTarget
        const restoreIfLost = () => {
          if (target.isConnected && document.activeElement === document.body) target.focus({ preventScroll: true })
        }
        const scheduleRestore = () => window.requestAnimationFrame(restoreIfLost)
        const result = onClick?.(event)
        scheduleRestore()
        if (result?.then) result.then(scheduleRestore, scheduleRestore)
      }}
    >{children}</button>
  )
}
