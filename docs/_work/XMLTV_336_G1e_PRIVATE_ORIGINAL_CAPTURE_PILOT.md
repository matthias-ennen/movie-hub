# MovieHub #336 – G1e: echter privater Joyn-Originalmatcher-Pilot (isoliert, opt-in)




## 12.11.2026 – Unterschiedliche noch offene Matcher-Schlüssel statt Programm-IDs

Der erfolgreiche private Read-only-Audit [#43283391309](https://github.com/matthias-ennen/movie-hub/actions/runs/43283391309) wies unter **50.669** ursprünglichen, noch relevanten Joyn-Programm-IDs **2.038** IDs ohne passenden Cache-Schlüssel sowie **einen** vorhandenen, aber vom Originalcache verworfenen Schlüssel nach. Das bedeutet nicht, dass tatsächlich 2.038 unterschiedliche TMDB-Suchfälle vorliegen: Wiederholungen desselben Titels mit gleicher Beschreibung, Untertitel und Laufzeit ergeben denselben ursprünglichen SHA-Schlüssel.

Die Erweiterung des **bestehenden** geschützten Original-Checkpoint-Audits sammelt die ursprünglichen SHA-Schlüssel ausschließlich flüchtig als private `Map` und berichtet nur fünf überprüfte Aggregate: Anzahl unterschiedlicher Schlüssel insgesamt, unterschiedlicher fehlender Schlüssel, verworfener Schlüssel, wiederverwendbarer positiver und wiederverwendbarer negativer Schlüssel. Zusätzliche Tests beweisen, dass zwei unterschiedliche Programm-IDs mit exakt gleichem ursprünglichem Schlüssel **nur einen** fehlenden Suchfall ergeben. Widersprüchliche Statusklassifikationen für denselben Schlüssel werden geschlossen abgebrochen.

Wie zuvor werden **keine** Roh-Hashes, Titel, Sender-/Programm-IDs oder Suchtexte gespeichert, ausgegeben oder hochgeladen. Der feste Bericht wird sowohl beim Erstellen als auch vor dem Upload gegen ganzzahlige Grenzen und Konsistenzgleichungen geprüft. Keine neue Joyn-Quelle, keine TMDB-API, kein Matcher-HTTP, kein höheres Budget, keine Veröffentlichung, keine Shared-EPG-Freigabe.

**Wichtig:** Eine Zahl unterschiedlicher fehlender Schlüssel ist **keine** vorhergesagte Anzahl von TMDB-HTTP-Anfragen. Ein Originalmatcher-Suchfall kann mehrere Suchen und zusätzliche Kontextabfragen auslösen; wiederverwendbare negative Entscheidungen sind keine gefundenen TMDB-Identitäten. Erst diese neue Messung erlaubt, die nächste kleine, geschützte Offline-Stichprobe sinnvoll festzulegen.

---

## 12.11.2026 – G1e: echte Quell-Cache-Schlüsselabdeckung aus privatem Checkpoint

Die vorangegangene geschützte [TTL-Messung #43278792468](https://github.com/matthias-ennen/movie-hub/actions/runs/43278792468) bestätigte im restaurierten Joyn-Cache 64.044 historische Entscheidungen, davon 33.925 positive (30-Tage-TTL) und 11.154 negative (7-Tage-TTL) innerhalb der Altersgrenzen. **Diese 45.079 historisch zeitlich geeigneten Einträge sind noch keine nachgewiesenen Treffer für das aktuelle EPG.** Separate 23.292 Lookup-Antworten lagen ebenfalls innerhalb der 7-Tage-TTL; deren tatsächliche Anwendbarkeit wurde nicht überprüft.

Der nächste Schritt verwendet **nur den vorhandenen privat restaurierten vollständigen 14-Tage-Joyn-Sync**, seine 56 Originalcache-Fenster und den unveränderten Joyn-Entscheidungs-Cache. Die vorhandene **öffentliche** TMDB-Katalogfassung wird mittels `npm run tmdb:restore` abgerufen (nur veröffentlichte Daten, **kein** TMDB-API-Aufruf). Für jedes noch nicht beendete Originalprogramm im restaurierten Horizont werden exakt die **produktiv genutzte** Normalisierung, V2-Anreicherung, Senderzuordnung, Auswahl des ersten Programmeintrags, originaler SHA-Cache-Schlüssel, lokaler TMDB-Kandidatenkontext und `JoynMatchCache.get` ausgeführt — ausschließlich lesend und ohne eine neue Matcherentscheidung.

Der feste anonyme Diagnosebericht trennt:
- vollständige 56 geprüfte Originalfenster, Rohzeilenzahl und nach Programm-ID eindeutige verbleibende Programme;
- Anzahl der **exakt vorhandenen Original-Cache-Schlüssel** bzw. fehlenden Schlüssel;
- die nach **originaler Cache-Policy** tatsächlich wiederverwendbaren positiven und negativen Cacheentscheidungen (TTL, technische Fehler und bei negativen Treffern aktueller lokaler Kandidatenkontext);
- vorhandene, aber durch die Original-Policy abgewiesene Schlüssel;
- ein gesondertes Flag, ob der vollständige Source-Status zum Prüftermin noch innerhalb der geprüften 72-Stunden-Frische und des 14-Tage-Horizonts liegt.

**Grenze der Evidenz:** Dies ist eine *statische Replay-Projektion* aus dem privaten Checkpoint, **keine** frische Joyn-Originalgenerierung, kein externer Match-HTTP-Vergleich, kein Produktiv-Beleg. Ein rekonstruierter Cachetreffer darf nicht als neu freigegebene G1e-Matcher-Quittung gelten. Es werden keine Titel, Sender, Roh-IDs, Hashes, URLs, Kandidatenlisten, EPG-Einträge oder Tokens ins GitHub-Log oder Artefakt geschrieben. Die originale Quellprüfung bricht bei fehlenden/abweichenden Fenstern, ungültigen Metadaten und übergroßen Quellen geschlossen ab. Der neue Prüfjob ist geschützt; auf PRs laufen ausschließlich synthetische Tests.

Budgets, Adapter, produktiver Nightly, Firebase-Datenmodell und der deaktivierte Shared EPG Index bleiben unverändert. Erst die **gemessene** Schlüssel-/Kontextabdeckung soll die Größe des folgenden getrennten, budgetierten Originalmatcher-Stichprobenlaufs begründen.

---

## 12.11.2026 – nächster Schritt: zeitliche Cache-Gültigkeit ohne TMDB-Anfragen

Der vollständig geschützte **read-only** Checkpoint-Audit #43233887430 hatte 64.044 historische Joyn-Matcherentscheidungen gezählt. Diese Bestandszahl sagt allein noch nichts über die aktuelle Cache-Wiederverwendbarkeit aus: `JoynMatchCache` hat **30 Tage** TTL für positive Zuordnungen, **7 Tage** für negative; der separate `JoynLookupCache` hat **7 Tage** für gespeicherte Original-Antworten. Änderungen an Titel, Untertitel, Beschreibung, Sendedauer oder lokalen Kandidaten können trotz einer gültigen TTL weitere Suchen nötig machen.

Der neue `scripts/epg-g1e-private-joyn-cache-ttl-audit.mjs` prüft ausschließlich die **bereits privat restaurierten** JSON-Caches lokal auf exakte Schema-/Matcher-Version, Zeitgrenzen und konservative Altersklassen. Er meldet **nur feste aggregierte Zahlen**, getrennt nach TTL-geeigneten positiven/negativen Entscheidungseinträgen, abgelaufenen/ungültigen Zeitstempeln und TTL-geeigneten Antwortcache-Einträgen. Die Zahlen sind ausdrücklich **nur Obergrenzen**: Es findet weder eine aktuelle Originalprogramm-Schlüsselprüfung noch lokale Kandidatenprüfung, technische Quellenvalidierung oder neue Matchfreigabe statt.

Sicherheitsgrenzen: maximal 600 MiB je regulärer Quelldatei, höchstens 250.000 Cacheeinträge; nur der geschützte `main`-Readiness-Job mit Authentisierung darf private Cacheinhalte lesen, der PR führt nur synthetische Tests ohne Secrets aus. Keine Joyn-EPG-Abfrage, kein TMDB-HTTP, kein Cloud-Upload von Cache oder Titel, kein geänderter Nightly, keine Index-Freigabe. Das feste Berichtsschema hält `currentProgrammeCacheHitsVerified=false`, `freshOriginalMatcherReceiptsApproved=false` und `measuredProductionSavings=null`.

Erst die realen TTL-Zahlen sollen helfen, einen eng begrenzten, weiterhin getrennt freizugebenden Originalmatcher-Stichprobenlauf zu dimensionieren. Wiederholung des vollständigen 14-Tage-Echtlaufs allein zur Cache-Diagnose ist nicht erforderlich.

---

## 12.11.2026 – G1e: Matcher-Berichtsprüfung nach #787 präzisiert

Der neueste echte geschützte [Lauf #43272834198](https://github.com/matthias-ennen/movie-hub/actions/runs/43272834198) hat die vollständigen 56 Joyn-EPG-Basisfenster mit 194 Requests, null Cachehits, 69 Fensterteilungen und ohne Retry abgeschlossen. Der separate Original-Joyn-TMDB-Suchdeckel (30) führte danach zu `JOYN_TMDB_REQUEST_BUDGET`. Die Gesamtgrenze von 450 HTTPS-Starts wurde bei 299 nicht erreicht. Es gab **keine** vollständige Joyn-Originalmatcherfreigabe, keinen Waipu-A/B-HTTP-Test und keine gemessene Produktionseinsparung.

Die bisherige anonyme `sourceTrace.phase=post-epg-before-matcher` **beweist nicht**, dass der Matcher noch nicht gestartet wurde: Der private Bericht wird nur eingelesen, wenn sein Schema und alle Zahlen im alten Grenzrahmen (max. 50.000 Programme) validieren. Der vorhandene geschützte [read-only Checkpoint-Lauf #43233887430](https://github.com/matthias-ennen/movie-hub/actions/runs/43233887430) hatte bereits **64.044 historische Joyn-Entscheidungs-Cacheeinträge** gezählt (nicht gleichzusetzen mit aktuellen Cachetreffern oder Freigabequittungen).

Dieser reine Diagnostik-Fix differenziert darum in `matcherReportStatus` strikt zwischen `absent`, `not-current`, `rejected-by-schema-or-bounds` und `validated`. Ein aktueller, aber abgewiesener Bericht erscheint nur als `phase=matcher-progress-unverified`, **nicht** als vermeintlich noch nicht gestarteter Matcher. Die rein numerische Grenze für originale Matcher-**Zähler** wird auf 200.000 begrenzt erhöht, um größere 14-Tage-Programmeaggregate diagnostizieren zu können. **Unverändert** bleiben die maximal 50.000 separat freigebbaren Original-Quittungen, 30 Joyn-TMDB-Suchstarts, 250 EPG-Starts, 450 globale HTTPS-Starts, Privatsphärenprüfungen und sämtliche Produktivpfade.

Die Änderung selbst startet **keinen** privaten Echtlauf. Der nächste gesondert genehmigte Test sollte eine kleine, budgetierte, korrekte Originalmatcher-Stichprobe statt eines wiederholten vollständigen 14-Tage-Exports sein. Die Cacheverfügbarkeit und -Frische bleibt separat zu klären; eine historische Cacheentscheidung ist keine neue G1e-Belegquittung.

---

## Zielgenaue Fehlerlokalisierung nach echtem Capture #43267851778 (#787)

Der letzte isolierte echte [Joyn-Capture #43267851778](https://github.com/matthias-ennen/movie-hub/actions/runs/43267851778) hat nach erneutem erfolgreichen privaten Quellenrestore **sicher abgebrochen**, aber **nicht** am globalen Anfragebudget:
`status=failed-closed`, `phase=joyn-original-generation`,
`failureClass=UNCLASSIFIED_ORIGINAL_SOURCE_ERROR`,
`boundedAllowlistedFetches=299` von maximal `450`.
Das ist **keine** erfolgreiche EPG-Originalgeneration, kein bestätigter Joyn-Beleg,
kein Waipu-A/B-HTTP-Vergleich und **keine** Produktiveinsparung.
Die erhöhten Budgets nochmals pauschal anzuheben wäre damit nicht begründet.

Die technische Folgekorrektur nutzt **nur privat bereits entstehende
Statusdateien**: `artifacts/joyn-sync/status.json` (ursprüngliche
56-Fenster-Synchronisierung) und
`artifacts/joyn-live/matching-progress.json`
(ursprünglicher Matcher). Nach einem fehlgeschlagenen Pilotlauf wird
ausschließlich für **frisch im selben Prozess entstandene Generationen**
`sourceTrace` erzeugt. Ein restaurierter alter Status ist **keine** zulässige
Echtlauf-Evidenz. Fehlt der aktuelle originale Status, entfällt die
Zusatzdiagnose vollständig.

Der neue, feste Privacy-Bericht enthält ausschließlich:

- `phase`: `epg-sync`, `post-epg-before-matcher`,
  `original-matcher` oder `post-matcher-publication`
- Aus der echten EPG-Sync-Datei:
  `processedBaseWindows` (maximal 56),
  `cachedBaseWindows`, `recursiveWindowSplits`,
  `retryStarts`, `startedEpgRequests` (maximal 250),
  `epgBudget` und eine **statisch geprüfte** Fehlerklasse
- Nur nach **vollständigem** EPG-Status aus der Matcher-Statusdatei:
  `processedOriginalPrograms`, `totalOriginalPrograms`,
  `originalMatchCacheHits`, begonnenen TMDB-/Algolia-/
  Serienseiten-Anfragen innerhalb ihrer separaten Budgets,
  plus ausschließlich fest definierte `JOYN_...`-Budgetfehlerklassen
  (alle fremden Strings werden `OTHER_MATCHER_ERROR`)

Weder rohe Exceptions noch Serien-/Filmtitel, Zeitfenster,
Senderkennungen, URLs, API-Tokens, TMDB-IDs oder Matcherentscheidungen
dürfen diesen Bericht verlassen. Vor Artefakt-Upload wird das gesamte
`sourceTrace` zusätzlich auf **exakte Schlüssel**, feste Enums,
logische Konsistenz und numerische Grenzen geprüft. Tests belegen
die Zurückweisung von injizierten Originaltiteln, fremden Feldern,
alten Checkpoints und ungültigen Größen.

Es wurde **keine** automatische Wiederholung oder Anhebung der bisherigen
250-EPG-/450-Gesamt-HTTPS-Grenzen eingebaut, und der produktive
Joyn-/Waipu-Adapter, Nightly und gemeinsame Index bleiben unverändert.
Erst nach grünen Checks kann ein **einziger** neuer geschützter
`capture`-Einmallauf mittels bereits bestehendem Marker die genaue
anonymisierte Phase ermitteln.

---


## Folgemessung und gezielt dimensionierter zweiter Budgetsprung (#786)

Die gesonderte echte
[Capture #43265178996](https://github.com/matthias-ennen/movie-hub/actions/runs/43265178996)
hat nach erneuter erfolgreicher privater Checkpoint-Wiederherstellung und
Waipu-Originalcache-Prüfung nochmals `JOYN_EPG_REQUEST_BUDGET` gemeldet –
**bei exakt 180 gestarteten Joyn-EPG-Anfragen**. Der anonymisierte
`joynEpg`-Bericht liefert erstmals:

| EPG-Fenster-/Transportkennzahl | Echte Messung |
| --- | ---: |
| Basisfenster, 14 Tage × 4 | 56 |
| Vollständig verarbeitete Basisfenster | 46 |
| Verbleibende Basisfenster | 10 |
| Cachehits | 0 |
| Zusätzliche Fensterteilungen (binär) | 67 |
| EPG-Requeststarts | 180 |
| Retry-Versuche | 0 |
| Alle erlaubten HTTPS-Fetches inklusive vorgelagerter Quellzugriffe | 213/300 |

Die Original-Sync-Semantik erklärt die 180 Requeststarts exakt:
**46 Basisfenster + 2 × 67 Kindfenster = 180**.
Der Mehrbedarf ist also tatsächliche Aufteilung von bei 1.000
Ergebnissen gekappten EPG-Fenstern, **kein Retry- oder fehlgeschlagener
Upstream-Request**. Die hochgerechnete Gesamtzahl bei gleicher
Dichte ist rund **219** (180 × 56 / 46); der Wert ist nur eine
**Planungsschätzung**, kein echtes vollständiges 14-Tage-Messergebnis.

**Eng kontrollierte Korrektur – nur QA-Einmaljob, nicht Produktiv:**

- Gesondertes Joyn-EPG-Budget **180 → 250**. Das lässt rund 30
  zusätzliche Requests über der plausiblen Schätzung zu, ohne eine
  unbegrenzte Quelle zu öffnen.
- Der private globale HTTPS-Deckel **300 → 450**. Denn die bisher
  unabhängig vor EPG-Matching angefallenen 33 erlaubten Requests
  plus eine voraussichtliche EPG-Vollmenge um 219 benötigen anschließend
  einen explizit abgezäunten Puffer für den tatsächlich ursprünglichen
  Joyn-Matcher. **450 ist ein harter Gesamtdeckel**; der 451. Versuch
  wird vor dem tatsächlichen `fetch` blockiert (synthetisch getestet).
- Andere explizite Grenzen (TMDB-Suchen 30, Details 10,
  Metadaten 30, Algolia 90, Serienseiten 20, Episoden 30,
  erlaubte HTTPS-Hosts, keine unbegrenzten Retries) bleiben
  unverändert. Der `capture`-Modus gibt **keinen zusätzlichen**
  Waipu-A/B-Request frei.
- Die anonyme Fensterdiagnose bleibt bei einem erneuten Budgetstopp
  strikt auf geprüfte Zahlen begrenzt; vor Upload gelten
  `configuredEpgBudget=250`, `startedEpgRequests=250`, sonst
  **fail closed**. Keine Zeitfenster, Programmtitel oder IDs.

Noch kein tatsächlicher Joyn-Capture-Erfolg und **keine**
behauptete TMDB-Einsparung. Erst der nächste echte Einmallauf kann
Original-Matcher-Quittungen bestätigen. Der Produktivindex bleibt aus.

---


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

## G1e – überprüfte Fensteraufteilung und neuer begrenzter Joyn-Test (12.11.2026)

Der zweite Echtversuch
[Actions #43245305473](https://github.com/matthias-ennen/movie-hub/actions/runs/43245305473)
hatte anonym bestätigt: `phase=joyn-original-generation`,
`failureClass=JOYN_EPG_REQUEST_BUDGET`, **105 von 300** erlaubten
HTTPS-Fetches gesamt. Die getrennte Obergrenze von **72 gestarteten
Joyn-EPG-Requests** war erreicht; der 14-Tage-Lauf noch nicht beendet.

Nach Codeprüfung: `syncJoynEpg` betrachtet **56 feste
Sechs-Stunden-Basisfenster**. Jeder Request mit **1.000 oder mehr**
Quellprogrammen gilt als gekappte Antwort; das betroffene Fenster
wird jeweils **rekursiv halbiert**, bis die Antwort vollständig
unter 1.000 Einträgen liegt. Zusätzlich sind begrenzte Wiederholungen
bei 429/5xx möglich. Ein alter/nicht mehr gültiger Checkpoint kann
Fenster nicht als Cachehit zählen. Daher ist **56 nur die Basis**,
nicht die zugesicherte Gesamtanzahl an API-Abfragen. Aus dem alten
Anonymbericht lässt sich die konkrete Aufteilung noch nicht ablesen.

**Pilot-only Änderung:** Erhöhung des *separaten* Joyn-EPG-Budgets von
**72 auf 180**. Das lässt höchstens 124 zusätzliche Requeststarts über
der Zahl der Basisfenster zu (Aufteilungen und begrenzte Retries,
abzüglich gültiger Cachehits). **Unverändert** bleiben: globale Obergrenze
**300 erlaubte HTTPS-Starts**, Host-Allowlist, Joyn-TMDB/Algolia- und
Metadatenlimits, ausschließlich die Originalmatcher-Freigaben,
`capture` ohne zusätzlichen Waipu-A/B-TMDB-Vergleich und die
produktiven Scheduler/Adapter.

**Neue Aggregat-Telemetrie:** Wenn die neue 180er-Grenze erneut
erreicht wird, liest der Runner das ohnehin lokal erzeugte
`artifacts/joyn-sync/status.json` *nur im ephemeren Prozess*,
prüft `kind`, `schemaVersion`, `status=failed`, exakt
`JOYN_EPG_REQUEST_BUDGET`, frischen Zeitstempel und konsistente,
ganzzahlige Obergrenzen. Der herunterladbare Report enthält dann nur:
`baseWindows=56`, `processedWindows`, `cacheHits`,
`subdividedWindows`, `startedEpgRequests`,
`retryAttempts`, `configuredEpgBudget=180`
und `completedFullHorizon=false`. Keine Rohfenster,
Sender, Originaltitel, TMDB-IDs, privaten Fehlertexte oder URLs.
Der Workflow validiert die Felder und Werte vor Upload nochmals.
Bei unpassendem Status entfällt dieser Diagnoseteil vollständig.

Ein Test gilt erst als erfolgreich, wenn die echte gesunde
Joyn-Originalgeneration die frischen Quittungen vollständig
erfasst und die lokale Waipu-Originalauswahl erfolgreich abgeschlossen
hat. **Keine Behauptung produktiver Einsparungen** aus Cache-Kennzahlen.
Der neue Einmallauf erfolgt separat per `[g1e-joyn-capture-once]`
nach grünen PR-Checks und wird im Issue #336 nachgewiesen.

---

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
