import DetailCard from './DetailCard.jsx'

export default function PersonalTitleActions({ activeProfile, personalState, personalBusy, libraryLoading, personalMessage, savePersonalPatch }) {
  return (
  <DetailCard className="personal-title-state" id="personal-title-state-heading" title="Meine Einstellungen" busy={personalBusy}
    context={activeProfile?.displayName ?? 'Profil'}
    aside={personalState.rating ? <span className="personal-rating-summary">{personalState.rating}/10</span> : null}>

    <div className="personal-action-grid">
      <button
        type="button"
        className={personalState.favorite ? 'personal-action favorite active' : 'personal-action favorite'}
        aria-pressed={personalState.favorite}
        aria-disabled={personalBusy || libraryLoading}
        onClick={() => savePersonalPatch(
          { favorite: !personalState.favorite },
          personalState.favorite ? 'Aus Favoriten entfernt.' : 'Zu Favoriten hinzugefügt.',
        )}
        data-focusable="true"
      >
        <span aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" focusable="false">
          <path d="M12 21 3.5 12.7a5.7 5.7 0 0 1 8.1-8L12 5l.4-.3a5.7 5.7 0 0 1 8.1 8Z" />
        </svg></span>
        <span>{personalState.favorite ? 'Favorit' : 'Als Favorit'}</span>
      </button>
      <button
        type="button"
        className={personalState.watchlist ? 'personal-action watchlist active' : 'personal-action watchlist'}
        aria-pressed={personalState.watchlist}
        aria-disabled={personalBusy || libraryLoading}
        onClick={() => savePersonalPatch(
          { watchlist: !personalState.watchlist },
          personalState.watchlist ? 'Aus der Watchlist entfernt.' : 'Zur Watchlist hinzugefügt.',
        )}
        data-focusable="true"
      >
        <span aria-hidden="true">{personalState.watchlist ? '−' : '＋'}</span>
        <span>Watchlist</span>
      </button>
      <button
        type="button"
        className={personalState.watched ? 'personal-action watched active' : 'personal-action watched'}
        aria-pressed={personalState.watched}
        aria-disabled={personalBusy || libraryLoading}
        onClick={() => savePersonalPatch(
          { watched: !personalState.watched },
          personalState.watched ? 'Als ungesehen markiert.' : 'Als gesehen markiert.',
        )}
        data-focusable="true"
      >
        <span aria-hidden="true">✓</span>
        <span>{personalState.watched ? 'Gesehen' : 'Als gesehen'}</span>
      </button>
    </div>

    <div className="personal-rating-block">
      <span>Meine Bewertung</span>
      <div className="personal-rating-buttons" aria-label="Persönliche Bewertung von 1 bis 10">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((rating) => (
          <button
            type="button"
            key={rating}
            className={personalState.rating === rating ? 'rating-button active' : 'rating-button'}
            aria-pressed={personalState.rating === rating}
            aria-disabled={personalBusy || libraryLoading}
            onClick={() => savePersonalPatch(
              { rating: personalState.rating === rating ? null : rating },
              personalState.rating === rating ? 'Bewertung entfernt.' : `Mit ${rating}/10 bewertet.`,
            )}
            data-focusable="true"
          >{rating}</button>
        ))}
      </div>
    </div>

    {personalMessage && <p className="personal-state-message" role="status">{personalMessage}</p>}
  </DetailCard>

  )
}
