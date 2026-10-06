# Nachtlauf: Alarm und dauerhaftes Import-Checkpoint

Stand: 06.10.2026. Arbeitspaket: [#315](https://github.com/matthias-ennen/movie-hub/issues/315).

## Aktueller Betrieb

Der geplante `Deploy Firebase`-Datenlauf beginnt nominal um 00:17 Uhr
`Europe/Berlin`. Der GitHub-Watchdog prüft einen echten Deploy und die beiden
veröffentlichten JSON-Endpunkte. Zusätzlich prüft eine tägliche, nur lesende
Chat-Überwachung um 06:00 Uhr unabhängig vom GitHub-Zeittrigger auf
Auffälligkeiten und meldet sie Matthias hier im Chat. Diese Prüfung läuft
außerhalb des GitHub-`schedule`-Triggers und kann deshalb auch einen vollständig
ausgebliebenen GitHub-Cron-Lauf erkennen. Sie ist bewusst ein zusätzlicher
Meldeweg und kein garantierter 24/7-Rufbereitschaftskanal.

Am 06.10.2026 wurde der Sollstart auf Wunsch von Matthias um drei Stunden
vorgezogen, um die tatsächliche GitHub-Startzeit zu vergleichen. Die UTC-Trigger
liegen nun bei 22:17 und 23:17 Uhr des UTC-Vortags; Gate, Zeitmessung und
Überwachung verwenden 00:17 Uhr Europe/Berlin. Die morgendlichen Prüfzeiten
und die übrige Datenaufbereitung bleiben unverändert.

## Privater Checkpoint

Der Code für einen separaten Cloud-Storage-Checkpoint wird nur aktiv, wenn die
GitHub-Repository-Variablen `MOVIE_HUB_CHECKPOINT_BUCKET` und
`MOVIE_HUB_DURABLE_CHECKPOINT_ENABLED=true` gesetzt sind. Matthias hat am
25.09. bestätigt, beide Variablen angelegt zu haben; die GitHub-Anbindung
kann ihre Werte nicht selbst lesen. Die Werte wurden im [echten Cache-Backfill vom 25.09.](https://github.com/matthias-ennen/movie-hub/actions/runs/36107543301)
als gesetzte Runner-Umgebung bestätigt. Beide echten Snapshots wurden
hochgeladen, geprüft und in einem geleerten Runner bitgenau wiederhergestellt.
Der reguläre Datenlauf #936 vom 03.10.2026 hat den produktiven Einsatz
inzwischen bestätigt: TMDB- und Waipu-Cloud-Checkpoint wurden vor dem Import
wiederhergestellt, der neue Waipu-Stand hochgeladen und geprüft, anschließend
auch der neue TMDB-Stand gespeichert und per `probe` validiert. Der
GitHub-Cache bleibt zusätzlich als Beschleuniger erhalten.

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

## Erster echter Cloud-Snapshot und Restore (25.09.2026)

[PR #322](https://github.com/matthias-ennen/movie-hub/pull/322) ergänzt einen
separaten, auf `main` ausgeführten [Backfill-Lauf](https://github.com/matthias-ennen/movie-hub/actions/runs/36107543301).
Er stellte exakt die GitHub-Caches des erfolgreichen
[Nachtlaufs #402](https://github.com/matthias-ennen/movie-hub/actions/runs/36101645871)
wieder her (`waipu-curated-228-v1-36101645871-1` und
`tmdb-changes-v1-36101645871-1`). Der Lauf prüfte beide Repository-Variablen,
die Cache-Treffer und erforderlichen JSON-Zustände, authentifizierte sich mit
dem bestehenden WIF-Dienstkonto und lud beide vollständigen Gruppen hoch.
Die Archive hatten 32.802.779 Byte (Waipu) und 193.226 Byte (TMDB). `probe`
lud beide realen Cloud-Objekte zurück und prüfte Prüfsumme und Schema.
Anschließend löschte der Lauf ausschließlich seine lokalen Runner-Kopien,
lud beide Cloud-Snapshots erneut per `restore` und prüfte die SHA-256-Werte
der erforderlichen und vorhandenen optionalen Quelldateien: bytegleich.

Der isolierte Lauf hat keinen Waipu-/TMDB-Import und keine Firebase-Publikation
ausgelöst. Der zugehörige
[Code-Deploy #405](https://github.com/matthias-ennen/movie-hub/actions/runs/36107543258)
war erfolgreich und übersprang wie vorgesehen den Datenimport. Die Proben
belegen echte, private Cloud-Archive und technischen Restore.

Der reguläre [Nachtlauf #936 vom 03.10.2026](https://github.com/matthias-ennen/movie-hub/actions/runs/37103439823)
hat diesen Pfad inzwischen auch produktiv bestätigt: Restore, neue
Waipu-/TMDB-Snapshots und die anschließenden Prüfdownloads liefen erfolgreich.

## Freigabe zur Aktivierung

1. **Erledigt:** eigenen privaten Bucket mit Schutz, Standort,
   Aufbewahrungs- und Kostenentscheidung bereitstellen.
2. **Erledigt:** dem bestehenden GitHub-WIF-Dienstkonto Objekt-Lese- und
   Schreibrechte nur auf diesem Bucket geben; keine Schlüsseldatei ablegen.
3. **Erledigt:** Konfiguration und IAM lesen sowie isolierten Upload,
   Download und Wiederherstellungstest ohne Datenimport bestehen.
4. **Erledigt:** Repository-Variablen im echten Runner nachweisen;
   beide gespeicherten Caches aus dem Nachtlauf exakt laden, echte
   Cloud-Snapshots hochladen und per `probe` herunterladen und prüfen.
5. **Erledigt:** beide Archive nach Löschung des lokalen Runner-Caches
   wiederherstellen und Ausgangsdateien bytegleich vergleichen.
6. **Erledigt:** regulärer Lauf #936 hat automatischen Cloud-Restore,
   frische Waipu-/TMDB-Uploads und beide anschließenden `probe`-Schritte
   erfolgreich ausgeführt; veröffentlichte Datenfrische wird weiterhin
   getrennt vom Workflowstatus kontrolliert.

Ein Wechsel des eigentlichen Imports auf Cloud Run Jobs/Cloud Scheduler ist
erst nach Messung von GitHub-Verzögerungen, Laufzeiten, IAM-Aufwand und
laufenden Kosten zu entscheiden. Der Datenaufbereitungscode bleibt im
Repository; GitHub übernimmt weiter Versionsverwaltung und CI/CD.

## Watchdog-Korrektur 03.10.2026

Der reguläre Lauf #936 veröffentlichte einen intern vollständig validierten
Waipu-Bestand mit 228 Sendern, 3.441 Titeln und 45.790 Ausstrahlungen. Die
14 veröffentlichten Tagesdeskriptoren summierten sich exakt auf 45.790.
Der Watchdog meldete trotzdem fälschlich
`Waipu-Tagesbestand inkonsistent`, weil seine externe Prüfung starr einen
zusätzlichen leeren Vortags-Descriptor erwartete.

Die 06:00-TV-Tageslogik erzeugt einen Vortags-Descriptor aber nur dann, wenn
im veröffentlichten Horizont tatsächlich eine passende Ausstrahlung diesem
TV-Tag zugeordnet wird. Die externe Gesundheitsprüfung akzeptiert deshalb
jetzt die tatsächlich veröffentlichten, sortierten und eindeutigen
Tagesdeskriptoren innerhalb des zulässigen Horizonts und verlangt weiterhin,
dass deren Summe exakt dem veröffentlichten Broadcast-Zähler entspricht.
Dubletten, unsortierte Schlüssel, ungültige Zähler oder eine abweichende Summe
bleiben Fehler.

Die starke GitHub-Schedule-Verzögerung wird weiterhin separat als
`delayed` ausgewiesen. Ein verspäteter, aber vollständig veröffentlichter
Datenstand ist damit Warnung statt fälschlicher Datenintegritätsfehler.
