import { ProgressiveRows } from './ProgressiveContent.jsx'

function formatGeneratedAt(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(date)
}

export default function TvView({
  rows,
  stations,
  totalStationCount,
  status,
  generatedAt,
  onOpen,
}) {
  const dataTime = formatGeneratedAt(generatedAt)
  const activeCount = Array.isArray(stations) ? stations.length : 0
  const rowCount = Array.isArray(rows) ? rows.length : 0

  return (
    <main className="browse-page tv-program-page">
      <div className="page-heading tv-program-heading">
        <div>
          <p className="eyebrow">Lineares Programm bei waipu.tv</p>
          <h1>TV</h1>
          <p>Filme und Serien aller in den Einstellungen aktivierten Sender – chronologisch nach Tag und Startzeit.</p>
        </div>
        {status !== 'unavailable' && (
          <div className="tv-program-status" aria-label="TV-Datenstand">
            <strong>
              {totalStationCount > 0
                ? `${activeCount} von ${totalStationCount} Sendern aktiv`
                : 'Senderliste wird geladen …'}
            </strong>
            {dataTime && <span>Datenstand: {dataTime} Uhr</span>}
          </div>
        )}
      </div>

      {status === 'loading' && (
        <section className="library-empty-state tv-program-empty" aria-live="polite">
          <p className="settings-kicker">TV-Programm</p>
          <h2>Sendetermine werden geladen …</h2>
          <p>Movie Hub lädt ausschließlich die Dateien der aktivierten Sender.</p>
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

      {status === 'ready' && rowCount === 0 && (
        <section className="library-empty-state tv-program-empty">
          <p className="settings-kicker">Keine Sendetermine</p>
          <h2>Für die aktivierten Sender wurden aktuell keine zugeordneten Filme oder Serien gefunden.</h2>
        </section>
      )}

      {status === 'ready' && rowCount > 0 && (
        <ProgressiveRows
          rows={rows}
          heroReady
          onOpen={onOpen}
          className="rows-wrap tv-program-rows"
        />
      )}
    </main>
  )
}
