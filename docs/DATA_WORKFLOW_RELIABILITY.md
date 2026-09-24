# Nachtlauf: Alarm und dauerhaftes Import-Checkpoint

Stand: 24.09.2026. Arbeitspaket: [#315](https://github.com/matthias-ennen/movie-hub/issues/315).

## Aktueller Betrieb

Der geplante `Deploy Firebase`-Datenlauf beginnt nominal um 03:17 Uhr
`Europe/Berlin`. Der GitHub-Watchdog prüft einen echten Deploy und die beiden
veröffentlichten JSON-Endpunkte. Zusätzlich prüft eine tägliche, nur lesende
Chat-Überwachung um 06:00 Uhr unabhängig vom GitHub-Zeittrigger auf
Auffälligkeiten und meldet sie Matthias hier im Chat. Dies ist kein
garantierter Rufbereitschaftskanal; ein realer Alarm nach Aktivierung steht
noch zur Beobachtung aus.

## Privater Checkpoint

Der Code für einen separaten Cloud-Storage-Checkpoint wird nur aktiv, wenn die
GitHub-Repository-Variablen `MOVIE_HUB_CHECKPOINT_BUCKET` und
`MOVIE_HUB_DURABLE_CHECKPOINT_ENABLED=true` gesetzt sind. Ohne Freischaltung
bleiben Ablauf und GitHub-Cache unverändert. Bucket-Rechte und Bucket-Schutz
sind noch nicht geprüft; eine produktive Cloud-Sicherung ist noch **nicht
nachgewiesen**.

Der Waipu-Snapshot enthält das ganze `artifacts/waipu-sync/` einschließlich
`checkpoint.json` und Grid-/Programmdetailcache sowie die drei kuratierten
Dateien `match-decisions.json`, `detail-status.json` und `unresolved.json`.
Ein bloßer Slot-Checkpoint ohne Cache darf nicht übernommen werden. Der
TMDB-Snapshot enthält nur `state.json` und optional `last-run.json` nach dem
Commit; nicht bestätigte `state.next.json` und `run.json` werden bei der
Wiederherstellung verworfen.

Vor dem Hochladen werden Pfade, Dateitypen und Checkpoint-Schemata geprüft.
Jeder Snapshot liegt unter einem neuen unveränderlichen Objektnamen; erst
danach wird `latest.json` mit Größe und SHA-256-Prüfsumme umgestellt. Vor dem
Import wird ein vorhandener Snapshot in einen temporären Ordner geladen,
geprüft und dann in den GitHub-Runner übernommen. Fehlt der erste
Cloud-Snapshot, bleibt der wiederhergestellte GitHub-Cache als Bootstrap.
Ein vorhandener, aber beschädigter Snapshot bricht den Import ab. Der zuletzt
gültig veröffentlichte Katalog bleibt in Firebase Hosting erhalten.

Der [vollständige Lauf vom 24.09.](https://github.com/matthias-ennen/movie-hub/actions/runs/35963254188)
speicherte 28.221.837 Byte komprimierte Waipu-Daten und 370.098 Byte
TMDB-Daten. Diese Größen sind ein Messwert, keine zugesicherte Obergrenze.

## Freigabe zur Aktivierung

1. Eigenen privaten Cloud-Storage-Bucket im Projekt `movie-hub-62459`
   bereitstellen. Gleichförmigen Bucket-Zugriff und Public-Access-Prevention
   einschalten; Aufbewahrung/Lifecycle und erwartete Kosten festlegen.
2. Dem vorhandenen GitHub-WIF-Dienstkonto
   `github-movie-hub-deploy@movie-hub-62459.iam.gserviceaccount.com`
   ausschließlich auf diesem Bucket die benötigten Objekt-Lese- und
   Schreibrechte geben. Keine Schlüsseldatei oder Zugangsdaten ins Repository.
3. Bucket-Konfiguration/IAM lesen und mit einem kleinen synthetischen Objekt
   Schreib-, Lese- und Wiederherstellungsrechte prüfen, ohne einen Datenimport
   zu starten. Danach erst Bucket-Variable und Freischalter setzen.
4. Beim ersten regulären Datenlauf den Bootstrap aus dem GitHub-Cache
   beobachten. Nach dessen Backup die beiden Cloud-Snapshots separat mit
   `node scripts/durable-data-checkpoint.mjs probe waipu` und
   `node scripts/durable-data-checkpoint.mjs probe tmdb` in einem
   authentifizierten, temporären Arbeitsverzeichnis prüfen. `probe` liest
   und entpackt nur in temporäre Dateien, ohne einen Datenlauf zu starten.
5. Einen Wiederherstellungstest mit absichtlich leerem lokalen Cache
   durchführen und die nächste reguläre Veröffentlichung überwachen.
   Bis dahin den GitHub-Cache behalten.

Ein Wechsel des eigentlichen Imports auf Cloud Run Jobs/Cloud Scheduler ist
erst nach Messung von GitHub-Verzögerungen, Laufzeiten, IAM-Aufwand und
laufenden Kosten zu entscheiden. Der Datenaufbereitungscode bleibt im
Repository; GitHub übernimmt weiter Versionsverwaltung und CI/CD.
