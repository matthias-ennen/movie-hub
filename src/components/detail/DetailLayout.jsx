// Actions share the content's coordinate system: transparent beside the heading,
// but scrolling with it. Loading and enriched details retain the same geometry.
export default function DetailLayout({ artwork, actions, children, episode = false, loading = false }) {
  return <div className={`detail-layout${episode ? ' detail-layout-episode' : ''}`}>
    <div className="detail-body" data-dpad-scroll-container={episode || undefined}>
      {artwork}
      <div className={episode ? 'episode-detail-copy' : `detail-copy${loading ? ' detail-loading-copy' : ''}`}
        data-dpad-scroll-container={episode || undefined}>
        <div className="detail-copy-content">
          {actions}
          {children}
        </div>
      </div>
    </div>
  </div>
}
