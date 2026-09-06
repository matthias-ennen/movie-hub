export default function Hero({ item, onOpen }) {
  return (
    <section className="hero" style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}>
      <div className="hero-copy">
        <p className="eyebrow">Heute im Fokus</p>
        <h1>{item.title}</h1>
        <div className="hero-meta">
          <strong>{item.score}</strong>
          <span>{item.year}</span>
          <span>{item.meta}</span>
        </div>
        <p className="hero-description">{item.description}</p>
        <div className="hero-actions">
          <button type="button" className="action-button action-button-primary" onClick={() => onOpen(item)} data-focusable="true">
            ▶ Ansehen
          </button>
          <button type="button" className="action-button action-button-secondary" onClick={() => onOpen(item)} data-focusable="true">
            ⓘ Details
          </button>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <span>{item.title}</span>
      </div>
    </section>
  )
}
