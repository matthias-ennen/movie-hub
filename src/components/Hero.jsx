export default function Hero({ item, onOpen }) {
  if (!item) return null

  const hasBackdrop = Boolean(item.backdropUrl)

  return (
    <section className="hero" style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
      <div className="hero-copy">
        <p className="eyebrow">Heute im Fokus</p>
        <h1>{item.title}</h1>
        <div className="hero-meta">
          <strong>{item.score}</strong>
          <span>{item.year || '–'}</span>
          <span>{item.meta}</span>
        </div>
        <p className="hero-description">{item.description || 'Für diesen Titel liegt noch keine deutsche Beschreibung vor.'}</p>
        <div className="hero-actions">
          <button type="button" className="action-button action-button-primary" onClick={() => onOpen(item)} data-focusable="true">
            ▶ Ansehen
          </button>
          <button type="button" className="action-button action-button-secondary" onClick={() => onOpen(item)} data-focusable="true">
            ⓘ Details
          </button>
        </div>
      </div>
      <div className={hasBackdrop ? 'hero-art has-image' : 'hero-art'} aria-hidden="true">
        {hasBackdrop && <img className="hero-art-image" src={item.backdropUrl} alt="" />}
        <span>{item.title}</span>
      </div>
    </section>
  )
}
