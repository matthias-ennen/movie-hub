# Nachtlauf: Alarm und dauerhaftes Import-Checkpoint

Stand: 07.10.2026. Historisches Betriebspaket: [#315](https://github.com/matthias-ennen/movie-hub/issues/315), abgeschlossen am 03.10.2026.

## Einordnung und Abschlussstand 07.10.2026

Die heutigen Arbeiten sind ein von Matthias priorisierter Betriebsnachtrag
unter [#271 Quellenplattform](https://github.com/matthias-ennen/movie-hub/issues/271),
der den abgeschlossenen Joyn-Adapter #280 und den Betrieb aus #315 erweitert.
Dafür wurde kein neues eigenes Arbeitspaket-Issue angelegt. #280 und #315 werden
durch diesen Nachtrag nicht wieder geöffnet. Das aktuelle große Produktpaket
bleibt [#314 Mitteilungen](https://github.com/matthias-ennen/movie-hub/issues/314);
sein erster Umsetzungsschritt ist die Istprüfung des Server-/IAM-Pfads in #380.
Movie Hub Admin und seine spätere Logansicht bleiben getrennte Vorhaben.

Technisch umgesetzt und geprüft:

- [x] Joyn-Vollaufbau über 56 Fenster und 14 Tage erfolgreich veröffentlicht;
  127 Sender, 2.308 Titel und 28.419 Ausstrahlungen. Sieben Sender liefern im
  verwendeten Quellenstand weniger angefragte Kalendertage.
- [x] Waipu bleibt bei 228 Sendern, 3.446 Titeln und 46.698 Ausstrahlungen.
- [x] Dauerhafte Joyn-Checkpoints, gemeinsame TMDB-Verarbeitung, gespeicherter
  Quellenfehlerschutz und differenzierter Bericht umgesetzt.
- [x] Restore der rund 73,5 MB großen Joyn-Titeldatei mit eigener begrenzter
  Größenreserve geprüft; ein vorheriger Code-Deploy stoppte an der alten 64-MiB-Grenze.
- [x] Finaler [Code-Deploy 37603310094](https://github.com/matthias-ennen/movie-hub/actions/runs/37603310094)
  am 07.10.2026 um 11:52 Uhr Europe/Berlin erfolgreich. Alle fünf öffentlichen
  Endpunkte wurden nach Veröffentlichung rückgelesen und waren konsistent;
  Waipu- und Joyn-Quellengenerationen blieben identisch zum vorherigen gültigen Stand.
- [x] [CI 37603310141](https://github.com/matthias-ennen/movie-hub/actions/runs/37603310141):
  Web-Build, 837 Unit-Tests, 17 Firestore-Regeltests und Produktions-Audit erfolgreich.
  [Android-APK 37603310199](https://github.com/matthias-ennen/movie-hub/actions/runs/37603310199)
  ebenfalls erfolgreich. Reale lesende Joyn-Schnittstellenprobe erfolgreich.

Noch offen:

- [ ] Der reguläre Nachtlauf am **08.10.2026**, Sollstart **00:17 Uhr Europe/Berlin**,
  bestätigt den tatsächlichen Start, die tägliche Fortschreibung beider Quellen
  mit den normalen Budgets, Wiederherstellung und Sicherung der Checkpoints,
  den vollständigen zentralen TMDB-Verbraucherabschluss sowie die frische,
  konsistente Veröffentlichung aller fünf öffentlichen Endpunkte.

Der einmalige Vollaufbau und ein erfolgreicher Code-Deploy sind noch kein
Nachweis für diesen regulären Datenlauf. Die vorhandene Überwachung prüft den
offenen Betriebspunkt; eine neue Überwachung wird dafür nicht angelegt.
Die heutigen technischen Prüfungen ersetzen keine manuelle Geräteabnahme
eines späteren Produktpakets.

## TMDB-Suchbudget 07.10.2026

Der erste Nachtlauf [37557495450](https://github.com/matthias-ennen/movie-hub/actions/runs/37557495450)
erreichte bei der Waipu-Titelzuordnung die interne Grenze von 4.000
TMDB-Suchrequests. Das war keine gemeldete TMDB-Quota oder HTTP-429-Sperre.
Die fehlende Waipu-Verbraucherbestätigung blockierte die Veröffentlichung.
Der Ersatzlauf [37561909988](https://github.com/matthias-ennen/movie-hub/actions/runs/37561909988)
nutzte den gesicherten Zwischenstand und veröffentlichte um 06:30 Uhr
Europe/Berlin erfolgreich 228 Sender, 3.446 Titel und 46.698 Ausstrahlungen.

Der Suchclient verwendet nun identische TMDB-Suchantworten innerhalb eines
Laufs wieder, ohne die programmspezifische Zuordnungsprüfung zu überspringen.
Die begrenzte Suchreserve steigt auf 6.000 Requests; Taktung, Backoff,
Detailbudget und Veröffentlichungssperren bleiben bestehen. Ein leerer oder
mehrdeutiger Suchtreffer wird wiederverwendet, ein fehlgeschlagener Abruf nicht.
Der nächste reguläre Nachtlauf muss die Wirkung unter realer Last bestätigen.

## Joyn auf 14 Tage erweitern (07.10.2026)

Matthias hat den gezielten Ausbau von Joyn auf die Waipu-Betriebsstufe beauftragt.
Die Quellenprüfung vom 07.10.2026 unterscheidet den realen 14-Tage-Abruf von
bereits veröffentlichten kanonischen Titeln. Der vorherige produktive Joyn-Stand
enthält 127 Sender, 399 Titel und 1.265 Ausstrahlungen mit etwa 31 Stunden
Vorschau. Die Erweiterung gilt erst nach erfolgreicher Datenaufbereitung und
öffentlichem Rücklesen als produktiv abgenommen.

Der neue Abruf verwendet `epgEventsV2(from, to)` mit Unix-Sekunden sowie
`start`/`end` und stabilen Programm-IDs. 56 Zeitfenster von je sechs Stunden
werden bei der beobachteten 1.000-Einträge-Grenze rekursiv geteilt. Ein voller
Antwortblock wird niemals als vollständig akzeptiert. Doppelte Grenzereignisse
werden anhand Sender, Programm-ID und Zeit entfernt. Die 127 LINEAR-Sender
bleiben die maßgebliche Liste; zusätzlich gelieferte Event-/On-Demand-Sender
werden ausdrücklich ausgeschlossen und gezählt.

Der Quellenbeleg für 07.–20.10.2026: 216 Anfragen, 80 Teilungen, 64.634
lineare Programme. 121 Sender liefern Daten bis zum letzten Tag. Sechs
Quellen haben kürzere Vorschauen: `spiegel-tv-action-crime-hd` und
`spiegel-tv-hd` je acht angefragte UTC-Kalendertage (bis 14.10.), `defa-hd` und
`himmlisches-kino-hd` je fünf (bis 11.10.),
`talk-now-hd` 13 (bis 19.10.) sowie `moviedome-family-hd` acht (bis 14.10.).
Über Mitternacht laufende Vortagsprogramme zählen dabei nicht als zusätzlicher
Tag des angefragten 14-Tage-Zeitraums. Diese Quellenlücken
werden im Bericht ausgewiesen; sie sind kein Beleg für Verlust durch Movie Hub.
Die Rohprogramme sind kein Bestand TMDB-zugeordneter Filme/Serien.

Joyn erhält einen separaten privaten Checkpoint mit allen Rohfenstern sowie
Zuordnungs-, Suchantwort- und Metadaten-Cache. Nahe Fenster werden nach sechs
Stunden, entfernte nach drei Tagen aktualisiert. Geänderte Senderlisten
invalidieren die Fenster. Ein beschädigtes Cache-/Checkpoint-Paar wird nicht
übernommen. Fortschritt wird auch bei ausgeschöpften Budgets gespeichert;
ein unvollständiger erster Aufbau kann mehrere Läufe brauchen. Er ersetzt
niemals den letzten vollständigen veröffentlichten Katalog. Matching-Antworten
werden sieben Tage, bestätigte Zuordnungen maximal 30 Tage wiederverwendet;
Titel, Untertitel, Beschreibung, Dauer und Matcher-Version bleiben Teil der
Zuordnungsevidenz. Mehrdeutige Entscheidungen und Fehler werden nicht als
bestätigte Zuordnung gespeichert.

Die bereits vollständigen kanonischen TMDB-Metadaten beider Live-Kataloge
werden gemeinsam genutzt. Ein öffentlicher Metadaten-Filter entfernt dabei
Ausstrahlungen, Senderdaten, Live-Providerkennungen und privaten Zustand; Joyns
EPG stammt unverändert nur aus Joyn. Neue kanonische Kandidaten invalidieren
negative Zuordnungen. Der Zuordnungslauf protokolliert jeweils nach 100
Programmen seinen Fortschritt und die tatsächliche Budgetnutzung.

Die begrenzten Reserven betragen 500 EPG-Anfragen, 6.000 TMDB-Suchanfragen,
3.600 Algolia-Anfragen, 100 Joyn-Seriendetails und 4.000 TMDB-Metadatenanfragen.
Das sind lokale Arbeitsgrenzen, keine behaupteten Anbieterquoten. Quellenabruf
und Suchanfragen bleiben getaktet. Im ersten Vollaufbau zeigt der Bericht
gegebenenfalls die gespeicherte Zwischenarbeit statt eines vorgetäuschten
vollständigen Ergebnisses.

Der [erste produktive Vollaufbau](https://github.com/matthias-ennen/movie-hub/actions/runs/37585989300)
hat alle 56 Fenster mit 216 Abrufen eingelesen, die Zuordnung aber nach
12.341 von 64.094 Programmen wegen der lokalen Klassifizierungsgrenze angehalten.
Der 25.212.457-Byte-Checkpoint wurde privat hochgeladen und per Prüfdownload
validiert. Der [Folgelauf](https://github.com/matthias-ennen/movie-hub/actions/runs/37589373824)
hat ihn erfolgreich wiederhergestellt. Die bisher veröffentlichten 399 Titel
und 1.265 Ausstrahlungen blieben erhalten; der 14-Tage-Aufbau war damit noch
nicht veröffentlicht. Fehlerberichte zeigen aktuelle Abrufzähler getrennt vom
letzten gültigen veröffentlichten Bestand.

Für den einmaligen Erstaufbau darf ein gezielter Push mit `[joyn-refresh]`
und `[joyn-bootstrap]` die Joyn-Klassifizierung auf maximal 18.000
Algolia-Abrufe und 500 Seriendetail-Abrufe begrenzen. Taktung, TMDB-Budgets,
Checkpoint und Veröffentlichungssperren ändern sich dabei nicht. Diese
Reserve gilt ausschließlich für diesen ausdrücklich markierten Push;
Zeitplanläufe verwenden auch bei unverändertem Commit wieder 3.600/100.

Joyn ist nun eigener Verbraucher des zentralen TMDB-Änderungslaufs und Teil
der deduplizierten kanonischen Titelqueue. Der Fan-out erhält Joyn-Sender,
Programm-ID, Ausstrahlungen und Wiedergaberouten. Vorhandene Folgentitel sowie
belegte Staffel-/Folgennummern werden im gemeinsamen Ereignis und den
Joyn-Ausstrahlungen erhalten; fehlende Nummern werden nicht erfunden. Die
Quelldaten-Vollständigkeit und Episodenabdeckung stehen für beide Anbieter im Bericht. Die echten gemeinsamen
App-Daten zeigen Quellenzeitstempel und Generationen; der Fixture-Merge-Test
wird separat gekennzeichnet. Vor dem Hosting-Deploy werden beide Quellen und
App-Indizes geprüft, anschließend wird die tatsächlich veröffentlichte
Generation aus allen fünf Endpunkten rückgelesen. Erst dann darf der zentrale
TMDB-Veröffentlichungsverbraucher bestätigen. Code-Deploys dürfen den vorherigen
vollständigen Quellenstand behalten; Datenläufe müssen den geprüften
14-Tage-Horizont nachweisen. Rollierende Bestandsrückgänge sind allein kein Alarm.

## Joyn-Veröffentlichung und Fehlerschutz (07.10.2026)

Der [abgeschlossene Aufbau](https://github.com/matthias-ennen/movie-hub/actions/runs/37593055944)
hat um 11:13 Uhr Europe/Berlin 127 Joyn-Sender, 2.308 Titel und 28.419
Ausstrahlungen veröffentlicht. Alle 2.308 Titel hatten vollständige
TMDB-Metadaten. Beide Quellen und die gemeinsamen App-Indizes wurden vor
und nach dem Hosting-Deploy geprüft. Der gemeinsame aktive Bestand betrug
4.365 Titel, davon 1.369 mit Waipu und Joyn. Sieben Sender hatten im
verwendeten Quellenstand weniger als 14 angefragte Kalendertage.

Der letzte Aufbau benötigte 2.982 Algolia-Abrufe und zwölf Seriendetailabrufe;
damit lag er bereits unter den normalen Reserven von 3.600/100. Die normale
nächtliche Aktualisierung bleibt begrenzt und muss mit dem jetzt gefüllten
Cache unter realer Last bestätigt werden. Die einmalige größere Reserve
wird nicht zum täglichen Standard.

Der produktive Joyn-Adapter schützt jetzt Authentifizierung, GraphQL-EPG,
Titel- und Episodensuche sowie Seriendetails gemeinsam. HTTP 403 sperrt
weitere automatische Abrufe bis zur manuellen Ursachenprüfung und einem
bewussten `npm run joyn:catalog -- --reset-circuit`. HTTP 429 speichert
`Retry-After` (Sekunden oder HTTP-Datum) als Pause; 401 und Schemafehler
pausieren mindestens 15 Minuten. Netzwerkfehler und HTTP 5xx werden maximal
dreimal versucht; danach wird ebenfalls eine Pause gespeichert. Jeder
Versuch zählt gegen das jeweilige HTTP-Budget. Quellenanfragen haben einen
30-Sekunden-Timeout. Eine Pause wird beim nächsten Lauf vor dem ersten
Quellenabruf geprüft und nach Ablauf automatisch aufgehoben.

`artifacts/joyn-sync/source-health.json` enthält ausschließlich Zähler,
Fehlercodes und Schutzstatus, keine Tokens, Schlüssel, Suchtexte oder
Antwortinhalte. Es wird mit dem bestehenden privaten Joyn-Checkpoint
gesichert; auch ein Fehler vor dem ersten EPG-Fenster hat dafür einen
leeren, gültigen Fenster-Checkpoint. Alte und neue HTTP-/GraphQL-Fehler
werden weder als Suchantwort noch als negative Zuordnung wiederverwendet.
Gültige leere Suchergebnisse bleiben von technischen Fehlern getrennt.

Der Bericht nennt erfolgreiche wie fehlgeschlagene Budgets, technische
Fehler und Wiederholungen sowie Kandidatenmangel, Mehrdeutigkeit und
Vertrauensschwelle getrennt. Kürzere Vorschauen werden je Sender mit
Anzahl und letztem angefragtem UTC-Kalendertag aufgelistet. Alte Importwerte
bei einem Fehler vor dem neuen EPG-Abruf sind als letzter Import gekennzeichnet.
Ein verworfenes Programm wird weiterhin nicht pauschal als verlorener Film
oder verlorene Serie bezeichnet. Die Matching-Schwellen bleiben unverändert.

Beim ersten folgenden Code-Deploy wurde eine bisherige Restore-Grenze sichtbar:
Joyns vollständiger 14-Tage-Titelbestand überschritt die für einzelne
Tagesdateien vorgesehenen 64 MiB. Die Titeldatei hat jetzt wie bei Waipu eine
eigene Grenze von 256 MiB; einzelne Tage behalten 64 MiB und Manifeste 8 MiB.
Die tatsächliche entpackte Größe wird beim Einlesen des Streams begrenzt.
Der abgebrochene Restore hatte keine neuen Daten veröffentlicht.

## Aktueller Betrieb

Der geplante `Deploy Firebase`-Datenlauf beginnt nominal um 00:17 Uhr
`Europe/Berlin`. Der GitHub-Watchdog prüft einmal täglich um 05:00 Uhr
`Europe/Berlin` einen echten Deploy und fünf veröffentlichte JSON-Endpunkte (Datenstatus, Waipu, Joyn, gemeinsamer Verfügbarkeitsindex und TV-Runtime).
Der einzelne Zeittrigger berücksichtigt Sommer- und Winterzeit direkt über
`timezone: Europe/Berlin`. Zusätzliche Prüfungen bei Deploy-Abschluss entfallen;
der Watchdog kann weiterhin bei Bedarf manuell gestartet werden.
Zusätzlich prüft eine tägliche, nur lesende
Chat-Überwachung um 06:00 Uhr unabhängig vom GitHub-Zeittrigger auf
Auffälligkeiten und meldet sie Matthias hier im Chat. Diese Prüfung läuft
außerhalb des GitHub-`schedule`-Triggers und kann deshalb auch einen vollständig
ausgebliebenen GitHub-Cron-Lauf erkennen. Sie ist bewusst ein zusätzlicher
Meldeweg und kein garantierter 24/7-Rufbereitschaftskanal.

Am 06.10.2026 wurde der Sollstart auf Wunsch von Matthias um drei Stunden
vorgezogen, um die tatsächliche GitHub-Startzeit zu vergleichen. Die UTC-Trigger
liegen nun bei 22:17 und 23:17 Uhr des UTC-Vortags; Gate, Zeitmessung und
Überwachung verwenden 00:17 Uhr Europe/Berlin. Anschließend wurde der
GitHub-Watchdog auf eine tägliche Prüfung um 05:00 Uhr vereinfacht. Die
Chat-Kontrolle um 06:00 Uhr und die übrige Datenaufbereitung bleiben unverändert.

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
