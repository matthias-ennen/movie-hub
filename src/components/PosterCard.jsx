import ProviderBadges from './ProviderBadges.jsx'

export default function PosterCard({ item, onOpen }) {
  return (
    <button
      type="button"
      className="poster-card"
      onClick={() => onOpen(item)}
      data-focusable="true"
      aria-label={`${item.title} öffnen`}
      style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}
    >
      <span className="poster-art" aria-hidden="true">
        <span className="poster-kicker">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
        <span className="poster-title">{item.title}</span>
        <span className="poster-year">{item.year}</span>
      </span>
      <ProviderBadges providerIds={item.providerIds} />
    </button>
  )
}
