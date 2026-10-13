// Keep artwork, scrolling content and floating actions identical while loading
// and after enrichment. Actions live outside the scroll area and never reflow it.
export default function DetailLayout({ artwork, actions, children, episode = false, loading = false }) {
  return <div className={`detail-layout${episode ? ' detail-layout-episode' : ''}`}>
    {actions}
    <div className="detail-body" data-dpad-scroll-container={episode || undefined}>
      {artwork}
      <div className={episode ? 'episode-detail-copy' : `detail-copy${loading ? ' detail-loading-copy' : ''}`}
        data-dpad-scroll-container={episode || undefined}>
        {children}
      </div>
    </div>
  </div>
}
