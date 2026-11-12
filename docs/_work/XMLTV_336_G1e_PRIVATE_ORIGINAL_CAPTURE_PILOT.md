# MovieHub #336 – G1e: echter privater Joyn-Originalmatcher-Pilot (isoliert, opt-in)

**Stand: 12. November 2026.** Dieser Schritt schließt die technische
Verbindung zwischen #780 (Waipu-A/B mit zwei originalen Matcherinstanzen),
#781 (24-MiB-Originalcache nachweislich nutzbar) und #782 (im Prozessspeicher
ausgewählte Original-Waipu-Matcherinputs).

## Warum ein dedizierter Test nötig ist

Ein normaler Joyn-SourceEnvelope, ein veröffentlichter EPG-Titel und historische
Cache-Zählwerte **beweisen keine neu freigegebenen Matcherentscheidungen**.
Der bisherige Joyn-Import stellt deshalb ausschließlich im Opt-in-Callback
`onCompletedEvidence` echte ursprüngliche Sender-/Sendungs-/Zeit- und
Originalmatcher-Quittungen bereit – mit tatsächlich gespeichertem
`checkedAt`. Gerade ein alter positiver Cachetreffer darf **nicht** künstlich
als gerade neu entschiedener Treffer ausgegeben werden.

Dieser Pilot erzeugt einen **neuen vollständigen 14-Tage-Joyn-Generationslauf**
mit dem **unveränderten Originalmatcher**. Seine private
`approvedEvidence`-Sammlung wird **nie serialisiert** oder exportiert.
Danach wird aus den **bereits gespeicherten originalen Waipu-Grid- und
Programmdetails**, dem gleichen lokalen Kandidatenindex und der unveränderten
Waipu-Matcherentscheidung eine mögliche gemeinsame Teilmenge berechnet.
Waipu wird hierfür **nicht neu von der Quelle abgefragt**.

## Zwei getrennte explizite Stufen

Die neue GitHub-Action
`.github/workflows/shared-epg-g1e-private-joyn-capture.yml`
hat einen eingeschränkt berechtigten und einen privilegierten Job:

1. Bei PRs nur **synthetische Tests**, kein OIDC, keine Cloud-Geheimnisse,
   keine echten Joyn- oder TMDB-Anfragen. Der vollständige CI-Build und der
   normale Android-Build laufen weiter unabhängig.
2. Erst auf `main`, mit manueller Workflow-Dispatch-Bestätigung oder einem
   **eindeutigen einmaligen Commit-Marker** `[g1e-joyn-capture-once]` kann
   die private Stufe starten. Sie benötigt den bestehenden privaten
   Checkpoint-Bucket und die bereits bewährte Workload-Identity.
   Die Daten werden ausschließlich in einen **ephemeren Actions-Runner**
   restauriert. Es gibt keine Cloud-Checkpoint-Sicherung, keine APK-/Firebase-
   Publikation und keinerlei Git-Commit mit privaten Werten.
3. Der normale, aktuelle Joyn-Katalogdurchlauf im Modus `joyn-catalog`
   verarbeitet alle 56 Zeitfenster unter nachfolgendem Budget. Der originale
   Quellen-/Matcher-Callback wird genau einmal akzeptiert. Quelle muss
   `healthy`, Generation `joyn-catalog:<Zeitstempel>` und der
   Original-Capture vollständig und positiv sein; alle Zeitprüfungen werden
   anhand des **Zeitpunkts nach** dem Matcher-Lauf bewertet.
4. Der bereits erprobte `buildWaipuLiveCatalog` verarbeitet nur den
   **restaurierten lokalen Waipu-Grid- und Programmdetailbestand**.
   Ohne Waipu-Quelle oder neuen TMDB-Suchclient wird der **bestehende originale
   Waipu-Matcher** samt historischer Startentscheidungen genutzt. Die
   vorhandene #782-Callback-Brücke wählt höchstens 20 passende Originalwaipu-
   Programme und die kleinste passende Teilmenge von Joyn-Fremdbelegen.
5. Der Standardmodus **`capture`** liefert nur aggregierte Felder wie
   `approvedJoynReceipts`, `selectedOriginalWaipuPrograms`,
   `minimizedJoynReceipts`. **Kein** zusätzlicher Waipu-A/B-TMDB-Aufruf.
   Ein ausdrücklich **getrennter** `workflow_dispatch` mit
   `mode=ab` und Bestätigung `PRIVATE_G1E_AB_MAX_4_PER_ARM` darf
   ausschließlich **nach diesen Gates** den #780-Vergleich auf höchstens
   **vier tatsächlich gestartete TMDB-Transporte je Matcherarm** erweitern.

## Netzsicherheit und Begrenzungen

Der Source-Pilot erzeugt tatsächlich **externe Joyn-, Algolia- und je nach
Cachezustand TMDB-Anfragen**. Er ist somit **nicht** der rein lesende
Checkpoint-Audit #781. Für die isolierte erste Generation gelten:

- Ein globaler harter Schutz von maximal **300 Fetch-Versuchen**.
  Nur HTTPS zu den bekannten Hosts `auth.joyn.de`, `api.joyn.de`,
  `www.joyn.de`, `ffqrv35svv-dsn.algolia.net` und
  `api.themoviedb.org` wird über den im Runner eingesetzten Fetch
  gestattet. Ein neuer, nicht geprüfter Fremdhost bricht geschlossen ab.
- Joyn-EPG: höchstens **72** neue Fensterabrufe statt unbegrenzter
  Wiederholungen; ursprüngliche 56 Fenster können durch Source-Caches
  bedient werden. Joyn-TMDB-Suche: **30** Versuche;
  TMDB-Detailsuche: **10**; Metadaten: **30**; Algolia: **90**;
  Serienseiten: **20**, Episoden: **30**. Einzelne Source-Adapter
  können kleinere interne Schranken besitzen.
- Nur exakt bestätigte bestehende Private-Checkpoint-Konfiguration,
  beidseitig `complete` gemeldete Sync-Status und originaler
  Waipu-Matcher-Cache innerhalb von **24 MiB** aus #781.
  Alte Caches bleiben als **Originalentscheidung** erhalten, aber werden
  niemals zu `approvedEvidence` umetikettiert.
- Der isolierte Prozess unterdrückt alle normalen Source-/Matcher-
  Diagnoseausgaben. Bei Fehlern erscheint ausschließlich eine generische
  Fehlermeldung, kein Raw-Error mit möglicherweise eingebetteten Quell-
  oder Suchbegriffen. Hochgeladen werden ausschließlich zwei ausdrücklich
  benannte anonymisierte JSON-Dateien (`preflight.json`, `aggregate.json`)
  mit kurzer Aufbewahrung; der gesamte private Joyn-Cache, Raw-EPG,
  Originaltitel, TMDB-IDs und Credentials bleiben aus Artefakten heraus.

**Wichtig:** Ein roter Pilot kann auch eine Source-Änderung, ein benötigtes
neues Host-Allowlist-Element oder ein zu knappes API-Budget signalisieren.
Das ist dann ein **bewusst geschlossenes Test-Gate** und darf nicht durch
Ausgabe der originalen Anfrage oder unlimitierte Wiederholung umgangen werden.

## Erster realer Test und anonymisierter Fehlerbericht

[Einmallauf #43242852401](https://github.com/matthias-ennen/movie-hub/actions/runs/43242852401)
hat die Original-Checkpoints und den unabhängigen 24-MiB-Waipu-Preflight
**erfolgreich** bestanden; der originale Joyn-Quell-/Matcher-Schritt ist
dagegen **sicher rot abgebrochen**. Der erste Driver hat den eigentlichen
Quellfehler aus Datenschutzgründen völlig verschluckt; damit ist die Ursache
des Fehlers **noch offen**. Es darf daher weder von gesammelten neuen
Originalbelegen noch von realen TMDB-Einsparungen gesprochen werden.

Der private Runner schreibt ab sofort auch bei Fehlern genau **einen
anonymisierten Diagnosereport** mit folgenden Feldern:

- `phase` aus einer **festen Liste**: private Checkpoint-Vorabprüfung,
  Joyn-Originalgeneration, Waipu-Originalrehydration oder Waipu-A/B-Transport
- `failureClass` aus explizit freigegebenen Fehlercodes wie
  `G1E_NETWORK_REQUEST_LIMIT`, `G1E_NETWORK_DESTINATION_BLOCKED`,
  `JOYN_EPG_REQUEST_BUDGET` oder `G1E_JOYN_ORIGINAL_EVIDENCE_NOT_APPROVED`.
  Alle anderen Rohfehler (einschließlich ihrer vielleicht vertraulichen
  Nachricht) erhalten nur `UNCLASSIFIED_ORIGINAL_SOURCE_ERROR`
- Anzahl der begonnenen erlaubten HTTPS-Fetches und die bekannte globale
  Obergrenze 300, **niemals** angefragte Titel, URLs, IDs oder Tokens

Die privaten Source-/Matcher-Logs bleiben unterdrückt. Die neue Action
prüft vor Artefakt-Upload nochmals die erlaubte Struktur und verbietet
einige bekannte Rohdatenfeldnamen ausdrücklich. **Ein positiver oder
negativer Replay-Wert darf erst nach einem tatsächlich erfolgreichen
privaten Pilotlauf gemeldet werden.**

---

## Kein Produktions-Go

Der erste Capture-Erfolg bestätigt nur das tatsächliche Vorliegen
prüfbarer Originalmatcher-Quittungen und die Verfügbarkeit passender
privater Waipu-Eingaben. Ein A/B-Ergebnis zeigt höchstens die **im
isolierten Lauf** beobachteten begonnenen TMDB-HTTP-Anfragen; nicht die
Ersparnis jeder Nacht. Für Produktiv-Aktivierung sind getrennte,
wiederholte Abnahmen, unveränderte Identitäten, nachvollziehbare
Konflikt-/Fehlerraten und das unveränderte Adapter-Fallback nötig.

**Gemeinsamer EPG-Index bleibt AUS**, AIR-Routen und Anbieterlinks
unverändert. Produktiver Nightly und TV-/Fire-TV-Seiten werden nicht
umgeschaltet.
