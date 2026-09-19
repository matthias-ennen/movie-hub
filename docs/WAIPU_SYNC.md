# Waipu-Sync-Koordinator (#4D)

Stand: 19. September 2026

## Zweck und Abgrenzung

Der Sync-Koordinator baut den öffentlichen Waipu-EPG-Bestand kontrolliert und
checkpoint-fähig auf. Er verwendet ausschließlich den in #4C implementierten
Read-only-Client und Cache. Er erzeugt noch keinen sichtbaren `waipu-live`-
Katalog und nimmt noch kein TMDB-Matching vor; beides folgt in #4E.

Es existiert bewusst noch kein automatisch gestarteter Live-Workflow. Ein
Live-Lauf ist nur mit doppelter Bestätigung möglich:

```bash
WAIPU_SYNC_LIVE=1 npm run waipu:sync -- --live --stage=7
```

Ohne `WAIPU_SYNC_LIVE=1` und `--live` wird kein Waipu-Request ausgeführt.

## Startkonfiguration

- Stufe: sieben bestätigte Hauptsender;
- Parallelität: genau eine aktive Anfrage;
- globaler Mindestabstand: 500 ms;
- zusätzlicher Jitter: bis 150 ms;
- Standardbudget: 300 gestartete Requests je Lauf einschließlich Retries;
- Horizont: 14 UTC-Kalendertage mit sechs Vier-Stunden-Slots pro Tag;
- höchstens drei Retries ausschließlich bei Netzfehlern, Timeouts oder 5xx;
- exponentieller Backoff ab zwei Sekunden plus Jitter.

Eine Budgetpause ist kein Fehler und keine stabile Messung. Der Checkpoint wird
atomar gespeichert und der nächste Lauf setzt deterministisch fort.

Seit #4H wird höchstens ein vollständiger Lauf je Ausbaustufe und UTC-Tag als
Stabilitätsnachweis gezählt. Ein weiterer vollständiger Lauf am selben UTC-Tag
bleibt technisch erfolgreich, erhöht den Zähler aber nicht. Der Status nennt
dafür `stability.recorded = false` und den Grund
`already_recorded_for_utc_day`. Die gezählten Lauftage stehen bereinigt unter
`stableRunDatesByStage` im Checkpoint und unter
`stability.recordedDates` im Status.

## Checkpoint und rollierendes Fenster

Der Koordinator speichert je `stationId + slotStart` den letzten Prüfzeitpunkt,
Unveränderlichkeitsstatus, die Programmzahl und das Cacheergebnis. Abgeschlossene
Slots werden nie erneut beim Server angefragt. Bereits gelesene weiter entfernte
Zukunftsslots bleiben liegen. Nur die nächsten 24 Stunden dürfen nach frühestens
24 Stunden erneut per ETag beziehungsweise Last-Modified validiert werden.

Beim täglichen Weiterrollen fallen alte Checkpoints außerhalb des aktiven
Fensters heraus. Neue äußere Slots werden ergänzt, ohne den Gesamtbestand neu
zu laden.

## Single-Flight

Ein atomarer Lock verhindert überlappende Importläufe. Ein Lock gilt erst nach
vier Stunden als verwaist und wird dann durch atomisches Umbenennen übernommen.
Fehlt nach einem Prozessabbruch die `owner.json`, verwendet die Wiederherstellung
das Änderungsdatum des Lock-Verzeichnisses; ein leerer Lock kann dadurch nicht
dauerhaft ohne Ablauf blockieren.
Der produktive GitHub-Workflow muss zusätzlich eine feste Concurrency-Gruppe
verwenden, bevor eine geplante Ausführung aktiviert wird.

## Circuit Breaker und Fehlerverhalten

- `403`: sofortiger Abbruch; automatische Läufe bleiben bis zu einem
  ausdrücklichen manuellen Reset deaktiviert;
- `429`: sofortiger Abbruch; `Retry-After` wird gespeichert, andernfalls gilt
  eine zweistündige Sperre;
- Netzfehler, Timeout oder `5xx`: höchstens drei Retries; danach Fail-Closed;
- ungültiges JSON, Größenlimit, Schema- oder Cachefehler: Fail-Closed ohne
  Veröffentlichung;
- Requestbudget: kontrollierte Pause mit gespeichertem Checkpoint.

Weder IP-Rotation noch Proxywechsel, Header-Tarnung oder andere
Sperrumgehungen sind vorgesehen.

## Ausbaustufen

Die Reihenfolge ist verbindlich:

1. 7 Sender;
2. 20 Sender nach sieben vollständig stabilen Läufen der 7er-Stufe;
3. 50 Sender nach sieben vollständig stabilen Läufen der 20er-Stufe;
4. vollständiger Senderstamm nach sieben stabilen Läufen der 50er-Stufe und
   zusätzlicher ausdrücklicher Freigabe.

Der Koordinator empfiehlt eine höhere Stufe lediglich im Statusartefakt. Er
schaltet weder Stufe noch Parallelität automatisch hoch. Zwei aktive Anfragen
bleiben deshalb bis zu sieben realen stabilen Läufen ausdrücklich gesperrt.

## Live-Nachweis der 7er-Stufe

Der kontrollierte Bootstrap vom 18. September 2026 lief ausschließlich mit
Parallelität 1, 500 ms Mindestabstand und bis zu 150 ms Jitter:

- erster Kleinlauf: 20 Requests, 17 gespeicherte Grid-Slots und ein erfolgreich
  wiederholter vorübergehender Fehler;
- zwei checkpoint-gestützte Fortsetzungen: 300 sowie 275 Requests;
- Endstand: 588 von 588 Grid-Slots für sieben Sender und 14 Tage gespeichert;
- 3.363 Programmeinträge über alle Grid-Fenster gezählt; diese Zahl ist keine
  deduplizierte Anzahl eindeutiger Sendungen;
- kein `403`, kein `429`, Circuit Breaker geschlossen;
- ein vollständiger Lauf als stabil gewertet; budgetbedingt pausierte Läufe
  wurden korrekt nicht auf die sieben erforderlichen stabilen Läufe angerechnet.

Der zweite zeitlich getrennte Lauf vom 19. September 2026 ergänzte das neue
äußere Tagesfenster kontrolliert:

- 44 gestartete Requests, keine Retries;
- 56 verarbeitete und 532 per Checkpoint übersprungene Slots;
- kein `403`, kein `429`, Circuit Breaker geschlossen;
- Horizont vom 19.09.2026 bis 03.10.2026, Ende exklusiv;
- Stabilitätsstand danach: 2/7.

Damit sind Abruf, Begrenzung und Wiederaufnahme technisch nachgewiesen. Die
Ergebnisse erlauben noch keine Hochstufung auf 20 Sender: Dafür fehlen weiterhin
fünf zeitlich getrennte, vollständige stabile Läufe der 7er-Stufe.

## Persistente Dateien

Standardpfade unter `artifacts/waipu-sync/`:

- `checkpoint.json`: atomarer Arbeitsfortschritt und Circuit-Zustand;
- `status.json`: bereinigte Laufmetriken, Horizont und Freigabeempfehlung;
- `cache/`: #4C-Sender-, Grid-, ETag- und Programmdetailcache;
- `active.lock/`: Single-Flight-Lock.

Der Ordner ist vom Repository ausgeschlossen. Das Statusartefakt enthält keine
Zugangsdaten, Tokens oder personenbezogenen Daten.

Für kontrollierte Folgeläufe aus einem separaten Worktree können die
persistenten Pfade explizit gesetzt werden:

```bash
WAIPU_SYNC_LIVE=1 \
WAIPU_SYNC_STATE=/sicherer/pfad/checkpoint.json \
WAIPU_SYNC_STATUS=/sicherer/pfad/status.json \
WAIPU_SYNC_CACHE_ROOT=/sicherer/pfad/cache \
WAIPU_SYNC_LOCK=/sicherer/pfad/active.lock \
npm run waipu:sync -- --live --stage=7
```

Diese Variablen ändern weder Stufe noch Lastgrenzen. Sie verhindern lediglich,
dass ein neuer Worktree versehentlich einen zweiten, leeren Checkpoint beginnt.

Die nachgelagerte Film-/Serienklassifikation, TMDB-Zuordnung und atomare
Katalogausgabe ist in [WAIPU_LIVE_CATALOG.md](./WAIPU_LIVE_CATALOG.md)
dokumentiert.

## Abnahmestand für #4D

- [x] CI-/Fixture-Prüfung des Koordinators;
- [x] kontrollierter Live-Start mit sieben Sendern und kleinem Budget;
- [ ] sieben zeitlich getrennte, vollständige stabile Läufe der 7er-Stufe
  (Stand 19.09.2026: 2/7);
- [ ] erst danach Entscheidung über zwei aktive Anfragen oder die 20er-Stufe;
- [ ] geplanter Workflow mit Concurrency-Gruppe erst nach erfolgreichem
  Pilotbetrieb.
