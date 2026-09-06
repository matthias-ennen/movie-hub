import ProviderBadges from './ProviderBadges.jsx'

export default function PosterCard({ item, onOpen }) {
  const hasPoster = Boolean(item.posterUrl)

  return (
    <button
      type="button"
      className="poster-card"
      onClick={() => onOpen(item)}
      data-focusable="true"
      aria-label={`${item.title} öffnen`}
      style={{ '--poster-accent': item.accent, '--poster-accent-2': item.accent2 }}
    >
      <span className={hasPoster ? 'poster-art has-image' : 'poster-art'} aria-hidden="true">
        {hasPoster && <img className="poster-image" src={item.posterUrl} alt="" loading="lazy" />}
        <span className="poster-kicker">{item.type === 'series' ? 'SERIE' : 'FILM'}</span>
        <span className="poster-title">{item.title}</span>
        <span className="poster-year">{item.year || '–'}</span>
      </span>
      {item.providerIds?.length > 0 && <ProviderBadges providerIds={item.providerIds} />}
    </button>
  )
}
