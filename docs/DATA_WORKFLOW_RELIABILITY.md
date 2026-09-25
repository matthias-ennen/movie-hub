# Nachtlauf: Alarm und dauerhaftes Import-Checkpoint

Stand: 25.09.2026. Arbeitspaket: [#315](https://github.com/matthias-ennen/movie-hub/issues/315).

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
bleiben Ablauf und GitHub-Cache unverändert. Bucket, Berechtigung und
ein isolierter GitHub-Schreib-/Lesetest sind geprüft. Die produktive
Cloud-Sicherung ist weiterhin **nicht aktiviert oder nachgewiesen**.

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

## Bucket, Rechte und Aufbewahrung (25.09.2026)

Der eigene Bucket `movie-hub-62459-nightly-checkpoints` liegt in
`europe-west1`, verwendet `STANDARD`, einheitlichen Bucket-Zugriff und
`public_access_prevention: enforced`. Das GitHub-WIF-Dienstkonto
`github-movie-hub-deploy@movie-hub-62459.iam.gserviceaccount.com`
hat `roles/storage.objectUser` direkt auf diesem Bucket. Die bei Erstellung
vorhandenen Standardbindungen für Projekt-Viewer, -Editoren und -Owner
bestehen ebenfalls; sie sind keine öffentliche Freigabe.

Soft Delete schützt gelöschte Objekte sieben Tage (`604800` Sekunden).
Eine Lifecycle-Löschregel ist bewusst noch nicht gesetzt: Eine pauschale
Altersregel würde auch den aktuellen `latest.json`-Zeiger löschen, wenn
der Datenlauf längere Zeit pausiert. Solange alte unveränderliche Archive
nicht gezielt bereinigt werden, wächst die Speicherung täglich. Nach den
Messwerten vom 24.09. wären 30 tägliche Snapshots ungefähr 0,86 GB
komprimierte Nutzdaten; dieser Wert kann steigen. Reiner Standardspeicher
liegt in dieser Größenordnung voraussichtlich im Centbereich pro Monat,
zuzüglich Operationen, Downloads und Soft-Delete-Daten (siehe
[Google Cloud Storage Pricing](https://cloud.google.com/storage/pricing)).
Die Objektanzahl und Kosten nach dem ersten Monat prüfen. Eine spätere
Bereinigung muss den aktuellen Zeiger **und das von ihm referenzierte Archiv**
sicher erhalten.

Der isolierte [GitHub-Test vom 25.09.](https://github.com/matthias-ennen/movie-hub/actions/runs/36105491904)
hat mit genau diesem WIF-Dienstkonto zwei kleine Objekte unter
`checkpoint-probe/` geschrieben, gelesen, in eine neue lokale Datei
wiederhergestellt, bytegleich verglichen und gelöscht. Der WIF-Provider
lehnte den früheren Pull-Request-Test wegen seiner Attribute-Bedingung ab;
diese Schutzregel wurde nicht gelockert. Der begleitende
[Code-Deploy](https://github.com/matthias-ennen/movie-hub/actions/runs/36105491862)
übersprang TMDB- und Waipu-Import sowie alle produktiven Cloud-Checkpoint-
Schritte. Der Test beweist noch keinen echten Waipu-/TMDB-Restore.

## Freigabe zur Aktivierung

1. **Erledigt:** eigenen privaten Bucket mit Schutz, Standort,
   Aufbewahrungs- und Kostenentscheidung bereitstellen.
2. **Erledigt:** dem bestehenden GitHub-WIF-Dienstkonto Objekt-Lese- und
   Schreibrechte nur auf diesem Bucket geben; keine Schlüsseldatei ablegen.
3. **Erledigt:** Konfiguration und IAM lesen sowie isolierten Upload,
   Download und Wiederherstellungstest ohne Datenimport bestehen.
   **Offen:** GitHub-Repository-Variablen `MOVIE_HUB_CHECKPOINT_BUCKET`
   mit dem Bucketnamen und `MOVIE_HUB_DURABLE_CHECKPOINT_ENABLED=true`
   setzen. Vor der Freischaltung prüfen, dass nur ein regulärer Datenlauf
   die ersten echten Snapshots schreibt.
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
