import { useEffect, useRef } from 'react'
import HeroFirstPage from './HeroFirstPage.jsx'
import { ProgressiveRows } from './ProgressiveContent.jsx'

function PeriodSelector({ periods, selectedPeriodId, onPeriodChange }) {
  const selectedRef = useRef(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selectedPeriodId])

  return (
    <section className="tv-period-shell" aria-label="TV-Zeitraum">
      <div className="tv-period-track" role="tablist" aria-label="Zeitraum der TV-Posterreihen">
        {periods.map((period) => {
          const selected = period.id === selectedPeriodId
          return (
            <button
              type="button"
              key={period.id}
              ref={selected ? selectedRef : null}
              className={selected ? 'tv-period-button active' : 'tv-period-button'}
              role="tab"
              aria-selected={selected}
              data-tv-period="true"
              data-focusable="true"
              onClick={() => onPeriodChange(period.id)}
            >
              {period.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function TvView({
  rows,
  heroItems,
  heroReadyEnabled,
  periods,
  selectedPeriodId,
  onPeriodChange,
  status,
  onOpen,
}) {
  const rowCount = Array.isArray(rows) ? rows.length : 0

  return (
    <HeroFirstPage
      pageId="tv"
      className="category-page tv-program-page"
      heroItems={heroItems}
      heroEyebrow="TV"
      readyEnabled={heroReadyEnabled}
      onOpen={onOpen}
    >
      {({ heroReady }) => (
        <section className="browse-page tv-program-content">
          {status === 'loading' && (
            <section className="library-empty-state tv-program-empty" aria-live="polite">
              <p className="settings-kicker">TV-Programm</p>
              <h2>Sendetermine werden geladen …</h2>
              <p>Der TV-Hero ist bereits verfügbar. Die Posterreihen werden im Hintergrund vorbereitet.</p>
            </section>
          )}

          {status === 'unavailable' && (
            <section className="library-empty-state tv-program-empty">
              <p className="settings-kicker">Noch nicht veröffentlicht</p>
              <h2>Das TV-Programm ist derzeit nicht verfügbar.</h2>
              <p>Der TV-Reiter bleibt leer, bis ein vollständig geprüfter Waipu-Live-Katalog freigegeben wurde.</p>
            </section>
          )}

          {status === 'no-stations' && (
            <section className="library-empty-state tv-program-empty">
              <p className="settings-kicker">Alle Sender ausgeblendet</p>
              <h2>Aktiviere mindestens einen Sender in den Einstellungen.</h2>
              <p>Die TV-Seite selbst enthält bewusst keine Senderauswahl.</p>
            </section>
          )}

          {status === 'ready' && (
            <>
              <PeriodSelector
                periods={periods}
                selectedPeriodId={selectedPeriodId}
                onPeriodChange={onPeriodChange}
              />

              {rowCount === 0 ? (
                <section className="library-empty-state tv-program-empty">
                  <p className="settings-kicker">Keine Sendetermine</p>
                  <h2>Für diesen Zeitraum wurden keine zugeordneten Filme oder Serien gefunden.</h2>
                </section>
              ) : (
                <ProgressiveRows
                  rows={rows}
                  heroReady={heroReady}
                  onOpen={onOpen}
                  className="rows-wrap tv-program-rows"
                />
              )}
            </>
          )}
        </section>
      )}
    </HeroFirstPage>
  )
}
