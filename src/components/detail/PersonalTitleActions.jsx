export default function PersonalTitleActions({ activeProfile, personalState, personalBusy, libraryLoading, personalMessage, savePersonalPatch }) {
  return (
  <section className="personal-title-state" aria-labelledby="personal-title-state-heading" aria-busy={personalBusy}>
    <div className="personal-title-state-heading">
      <div>
        <p className="personal-profile-name">{activeProfile?.displayName ?? 'Profil'}</p>
        <h3 id="personal-title-state-heading">Meine Auswahl</h3>
      </div>
      {personalState.rating && <span className="personal-rating-summary">{personalState.rating}/10</span>}
    </div>

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
        <span aria-hidden="true">♥</span>
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
  </section>

  )
}
