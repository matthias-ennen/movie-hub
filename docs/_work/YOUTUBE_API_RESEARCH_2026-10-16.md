# YouTube Data API – Recherche und erste Adapterbewertung

**MovieHub · Issue #388 · 16.10.2026**  
**Ergebnisstatus:** G0 Recherche, G1 24er-Smoke, 200er-Inventar **und erster echter YouTube-/TMDB-Matchinglauf erfolgreich ausgeführt** (16.10.2026); *Matchingqualität erst analysiert, nicht produktiv bestätigt; Lizenz-/DE-Wiedergabe und Geräteprüfung weiterhin ausstehend*.  
**Freigabegrenze:** noch kein Produktivadapter; G2/G3/G4 nicht erteilt oder begonnen. Die unten folgenden früheren G0-/Zugangsgate-Kapitel dokumentieren den historischen Verlauf, nicht den neuesten Status.

## G1 – Vergleichsdiagnose ohne Filmjahr vorbereitet (16.10.2026)

**Auslöser:** Der erste echte 174-Langvideo-TMDB-Lauf ([#38884328789](https://github.com/matthias-ennen/movie-hub/actions/runs/38884328789)) ergab **10** rein vorläufige Identitäten, **117** Reviews und **47** ohne Kandidaten; bei **111** Reviews fehlt das explizite Produktionsjahr im YouTube-Videotitel.

**Status dieses Folgepakets:** Code und Regressionstests vorbereitet; **zusätzliche Live-Messwerte aus dem Vergleich liegen bis zur neuen manuellen Ausführung nicht vor**. Frühere Ergebnisse werden nicht nachträglich umgedeutet.

- Bestehende **`analyzeSample`-Baseline** einschließlich des wiederverwendeten **Waipu-TMDB-Matchers v5** bleibt **unverändert**. Die Auswertung `compareYearlessReviews` ist eine *zusätzliche*, rein diagnostische Schicht im bereits isolierten, manuell gestarteten `YouTube G1 TMDB Match Research`-Workflow; keine neuen produktiven Mapper, Source-Envelopes oder Datenbanken.
- Der Vergleich berücksichtigt ausschließlich die Baseline-Kategorie `no-independent-year` und die **exakt gleiche temporäre, zeitlich verteilte 200-Video-Stichprobe**. Dadurch werden 117 Reviews und 47 Nichttreffer weiterhin separat und unverändert gemessen.
- Zunächst wird die *beste bekannte TMDB-Kandidatur* geprüft: Der aus YouTube extrahierte Filmtitel muss nach **derselben bestehenden Text-Normalisierung** exakt dem TMDB-Lokal- oder Originaltitel entsprechen. Bestehende Matcher-Signale müssen eine Punktzahl ≥70 und einen Abstand zur nächstbesten geprüften Kandidatur ≥12 ergeben. Auch dann ist die Eindeutigkeit **nur relativ zu den von TMDB zurückgegebenen Suchkandidaten**, nicht zum Weltkatalog belegt.
- Ergänzende **TMDB-Detailabfrage** nur für so vorselektierte Fälle; TMDB-Filmjahr muss zwischen Suchtreffer und Detail konsistent sein; Laufzeitdifferenz des YouTube-Videos zur TMDB-Filmlaufzeit muss **≤10 Minuten** sein. Häufig gleiche TMDB-IDs werden innerhalb des Laufs zwischengespeichert, um unnötige API-Anfragen zu sparen.
- Ergebnis kann ausschließlich **`priority-manual-review`** oder `insufficient` lauten. **Ein Review wird niemals automatisch zu `provisional-identity`, `matched` oder einer veröffentlichten Quelle hochgestuft.** Filmjahr aus dem Video-Upload-Datum ist verboten; das TMDB-Jahr ist kein unabhängiger Beweis, dass das YouTube-Video tatsächlich der angezeigte Film ist. Auch das Originaltitel-/Laufzeit-Paar beweist keine legale kostenlose DE-Wiedergabe.
- Der Bericht trennt explizit **Baseline unverändert**, **zusätzliche Prüfprioritäten**, **weiterhin ungeklärte Fälle**, Ablehnungsgründe, Detailabrufzahl und eine *begrenzt ausgegebene* Tabelle öffentlicher Beispielvideos mit TMDB-ID und Laufzeitdifferenz. Keine API-Keys, Rohantworten oder personenbezogene Daten im Bericht.
- Sicherheit/Budget: gleicher bestehender YouTube-Secret-Manager-Zugang und GitHub-`TMDB_API_READ_TOKEN`, **90** YouTube-Requests und **420** TMDB-Requests einschließlich Retry als harte Obergrenzen, keine Firestore-/Firebase-/MovieHub-Schreiboperationen. Die manuelle Ausführung kann nach Freigabe über [YouTube G1 TMDB Match Research](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-g1-tmdb-research.yml) erneut gestartet werden.

**Offene Gates:** Anzahl prioritär prüfbarer Jahreslücken **noch unbekannt**, keine automatische Filmidentität, keine aktuelle Live-MovieHub-Katalogüberschneidung, keine DE-/Fire-TV-Playback-/Rechteverifikation. Erst nach tatsächlicher Ausführung und Auswertung über nächste Qualitätsmaßnahmen entscheiden.

## G1-Livebefund – erster kombinierter YouTube-/TMDB-Matchinglauf (16.10.2026)

**Primärbeleg:** [GitHub Actions Run #38884328789](https://github.com/matthias-ennen/movie-hub/actions/runs/38884328789) – `YouTube G1 TMDB Match Research`, auf `main` manuell, **SUCCESS**, 16.10.2026 ab 10:00:32 UTC. [Originalbericht im temporären Actions-Artefakt #12039465886](https://github.com/matthias-ennen/movie-hub/actions/runs/38884328789/artifacts/12039465886) (14 Tage), Job **116918298820**. Secret Manager für YouTube und bestehender GitHub-TMDB-Token wurden erfolgreich verwendet, ohne Secrets auszugeben. Lauf war **ausschließlich lesend**: kein Firebase, keine Film-/Provider-Angebote veröffentlicht, keine produktive MovieHub-Datenänderung.

### Gesicherte Ergebnisse aus dem Log

| Kennzahl | CiNENET | Netzkino | Gesamt |
| --- | ---: | ---: | ---: |
| Für Analyse ausgewählte Videos | **24** | **176** | **200** |
| Qualitätsausschlüsse vor TMDB-Matching | **1** (anderer Kanal) | **25** (21 Shorts, 4 mittellang) | **26** |
| TMDB-geprüfte Langvideo-Kandidaten | **23** | **151** | **174** |
| **provisional-identity**: guter Match *plus* YouTube-Filmjahr identisch mit TMDB und Laufzeitdifferenz ≤15 min | **10** | **0** | **10** |
| **review**: möglicher Treffer, aber noch nicht hinreichend belegt | **6** | **111** | **117** |
| **unmatched**: kein hinreichender TMDB-Treffer | **7** | **40** | **47** |

Weitere Messpunkte: **194 tatsächliche TMDB-API-Aufrufe** einschließlich Retry (Limit 420), erfolgreiche Bearbeitung aller 174 Langvideo-Kandidaten. **Eine potenzielle TMDB-ID-Dublettengruppe** innerhalb der untersuchten YouTube-Videos: **`movie:304613`**, zwei Video-IDs; deren Zuordnung ist **keine** bestätigte Dublette des wirklichen Films. **Abgleich mit dem Live-MovieHub-Katalog nicht erfolgt**; GitHub `public/catalog.json` ist kein verlässlicher produktiver Vollbestand.

**Ursachen der nicht ausreichend bestätigten 164 Langvideo-Zuordnungen (aus dem Report):**
- **111 × `no-independent-year`** – kein eindeutig als Filmjahr aus dem Videotitel erkennbares `(YYYY)`. Der Matcher hat möglicherweise bereits einen plausiblen TMDB-Titel gefunden, aber YouTube liefert für diese Videos kein entsprechendes Identitätssignal. Das ist besonders bei Netzkino systematisch und **bedeutet nicht**, dass diese 111 Filme keinen TMDB-Eintrag besitzen.
- **47 × `no_candidate`** – der gegenwärtige Titel-/Suchansatz fand keine genügend passende TMDB-Kandidatur.
- **3 × `below_threshold`**, **1 × `year-conflict`**, **1 × `runtime-conflict`**, **1 × `missing-runtime-evidence`**. Diese dürfen nicht durch künstliche Schwellenwertabsenkung automatisch als bestätigt gelten.

### Zehn konkret belegte vorläufige Identitäten

| YouTube-Titel / exakter Filmtitel (gekürzt) | TMDB-ID | Filmjahr laut Video | YouTube-/TMDB-Laufzeitdifferenz |
| --- | ---: | ---: | ---: |
| Zwei Irre und ein Schwein | 160975 | 1995 | 0,2 min |
| Kiss me Deadly / Kiss Me Deadly – Codename: Delphi | 17286 | 2008 | 5,5 min |
| Das Netz der Freiheit | 479960 | 2017 | 10,2 min |
| The Circle – Willkommen in der Hölle | 660838 | 2020 | 6,4 min |
| Spiders On A Plane | 1135245 | 2024 | 0,7 min |
| Edgar Allan Poe's Lighthouse Keeper / Lighthouse Keeper | 388410 | 2016 | 1,0 min |
| Milano Kaliber 9 | 40022 | 1972 | 13,1 min |
| Die Schlacht um Schloss Itter | 1478055 | 2025 | 4,5 min |
| Medusa – Die Schlangenkönigin | 761563 | 2020 | 3,4 min |
| Der Diamantencoup | 237925 | 1978 | 0,8 min |

**Achtung:** Diese zehn Werte sind **forschungsinterne Identitätshypothesen**. Besonders nahe am Laufzeit-Grenzwert liegende Fälle und das lediglich aus dem YouTube-Titel abgeleitete Filmjahr müssen später manuell gegengeprüft werden. **Es sind nicht zehn nachweislich legal in DE verfügbare oder auf Fire TV nutzbare Filme.**

### Interpretation und fachlich nächste Entscheidung

Der neue Workflow beweist die technische Wiederverwendung der **Waipu-TMDB-Matchinglogik v5** und ermöglicht eine ehrliche, klar geschichtete Qualitätsmessung. Eine scheinbare Trefferquote von **10/174 ≈ 5,7 %** entspricht **nur der bewusst sehr strengen Kombination** aus YouTube-Titel-Format, Matchingentscheidung und Laufzeitgates. Sie ist **keine** Aussage über die allgemeine TMDB-Erkennbarkeit von Netzkino oder den Anteil echter Vollfilme. Das YouTube-Video-Veröffentlichungsdatum bleibt ausdrücklich **kein Filmejahr**.

Für die nächste *eigene Freigaberunde* sollte die **universelle Titel-/Metadaten-Evidenzschicht** erweitert werden, nicht ein „YouTube-Sondermatch“ entstehen:

1. Den 111 Fällen ohne Video-Filmjahr zusätzliche **unabhängige** Kandidatenevidenz gegenüberstellen (TMDB-Titelaliases/Originaltitel, Laufzeit und soweit erreichbar offizielle filmbezogene Angaben aus Publisher-Beschreibung); Werbe-Buzzwords kontrolliert entfernen. YouTube-Videoupload-Datum niemals als Filmjahr verwenden.
2. Zunächst eine **beobachtende Vergleichsdiagnose** gegen dieselben 174 Rohvideokandidaten (bestehende strenge Regeln gegen erweiterte Evidenz). Ohne belastbare zweite Bestätigung bleiben Kandidaten `review`. Möglichst keine Lockerung der bereits genutzten Waipu-/Joyn-Produktivregeln.
3. **47 `no_candidate`** gesondert untersuchen (sprachabhängige Titel, werbliche Zusätze, Übersetzungen, Episoden-/Clipfehletikettierung). Suchvarianten begrenzen und den Anfrageverbrauch beobachten.
4. **1 potenzielle Dublettengruppe** nur nach Titel-/Jahres-/Laufzeit-/Video-ID-Abgleich werten; später eigenständiger Vergleich mit dem **laufenden MovieHub-Katalog**, nicht dem leeren GitHub-Fallback.
5. Erst nach stabiler Matchingqualität und manueller Vorabprüfung **DE-Playback/Fire-TV, tatsächliche Kosten-/Werbe-/Rechtssituation** testen; weitere G2-/Produktivfreigabe bleibt **ausstehend**.

### Grenzen des aktuellen Liveberichts

Der Workflow protokolliert keine individuelle Gesamtliste der **117 Reviews** oder **47 nicht gefundenen Fälle**, sondern aggregierte Kategorien und die zehn starken Beispieltreffer. Eine solche detaillierte Fehlertyp-Diagnose benötigt gegebenenfalls eine *gezielte Erweiterung des schreibgeschützten, zeitlich begrenzten Reports*; es wurden keine Roh-API-Daten im Repository oder Katalog persistiert.

## Historische Vorbereitungsphase vor dem erfolgreichen TMDB-Livelauf

## G1-Fortsetzung – YouTube-zu-TMDB-Matchingpilot vorbereitet (16.10.2026)

**Phase:** Analysewerkzeug vorbereitet; **noch kein authentifizierter kombinierter YouTube-/TMDB-Lauf**. Die vorherige **200/200** YouTube-API-Stichprobe ist erfolgreich. Der neue Schritt untersucht auf Basis derselben seitenverteilten Erfassungsstrecke die tatsächliche Übereinstimmung der **174 Langvideo-Kandidaten** mit TMDB-Titeln. Er führt weiterhin **keinen** MovieHub-Import, kein Firestore-Update und keine Provider-/Badge-Änderung aus.

### Architektur und Wiederverwendung

- **Kein eigener Matching-Algorithmus für YouTube:** Das Skript `scripts/youtube-tmdb-match-pilot.mjs` nutzt den vorhandenen `WaipuTmdbSearchClient` und `matchWaipuProgram` aus `scripts/waipu-tmdb-matcher.mjs` (aktuelle Version **v5**). Identität bleibt **Medientyp + TMDB-ID**.
- `scripts/youtube-api-inventory-pilot.mjs` bekommt lediglich einen optionalen **In-Memory-Callback** auf die bereits normalisierten Stichprobendetails; die bestehende manuelle 200er-Probe verhält sich ohne Callback unverändert. Kein zweites, divergierendes YouTube-Pagination-/Samplingmodul und kein dauerhaftes Rohdatenarchiv.
- Das YouTube-Video wird zunächst über die bestehende Source-Qualitätsklassifikation geprüft: erwarteter Publisher-Kanal, öffentliches Video, Mindestlänge, DE-Regionssignale. Nur **`long-video-candidate`** geht zur TMDB-Suche.
- Für die Suche wird der **führende Filmtitel** vor einem expliziten Jahr in Klammern extrahiert; Werbetexte werden nur bei eindeutigen Trennungen entfernt. Ein Erscheinungsjahr wird ausschließlich aus dem YouTube-Titel **`(YYYY)`** am Titelanfang übernommen, **niemals** aus dem YouTube-Veröffentlichungsdatum. Darsteller-/Genreüberschriften können somit bewusst im Review verbleiben.
- Der wiederverwendete Matcher berücksichtigt Titelähnlichkeit, Jahr, Schwellenwerte und Abstand zum zweitbesten Kandidaten. Ein Treffer wird zusätzlich nur dann als **`provisional-identity`** gekennzeichnet, wenn **ein explizites, identisches Filmjahr** vorliegt **und** das TMDB-Detail eine Laufzeit innerhalb von **15 Minuten** der YouTube-Laufzeit bestätigt. Der TMDB-Detailabruf verwendet wiederum den existierenden TMDB-Client.
- Fehlendes Jahr, fehlende Laufzeit, falsche Laufzeit, unterhalb der Konfidenzschwelle oder zweideutige TMDB-Titel verbleiben **`review`** bzw. **`unmatched`**. **Auch `provisional-identity` ist keine finale Freigabe**, da YouTube-Titel, Schnitte, Rechte und Geräteverfügbarkeit nicht verifiziert sind.
- YouTube-Video-ID und TMDB-`movie:<id>` sind voneinander getrennte IDs. Eine mehrfache identische TMDB-ID über verschiedene Video-IDs wird **nur als potenzielle Dublette** gemeldet, nicht als Grund, Quellenlinks ohne weitere Prüfung zu überschreiben.

### Betrieb und Auswertung

- Neuer Workflow: `.github/workflows/youtube-g1-tmdb-research.yml` – ausschließlich **manuell** auf `main`, keine geplanten Nachtläufe, kein produktiver Cloud-/Firebase-Zugriff, keine MovieHub-Datenveröffentlichung.
- Sicherheit: YouTube-API-Schlüssel bleibt im bestehenden Secret Manager `YOUTUBE_API_KEY` und wird nur im Arbeitsspeicher gelesen; TMDB-Zugriff nutzt den in MovieHub bereits vorhandenen GitHub-Actions-Secret **`TMDB_API_READ_TOKEN`**. Keine Ausgabe der beiden Zugangsdaten in GitHub-Logs oder Reports.
- Schutzgrenzen: höchstens **90** YouTube-Abfragen, **200** ausgewählte Videos, **420** TMDB-API-Anfragen einschließlich Retry; sequenzielles TMDB-Suchbudget, kontrollierte Pace, bei unvollständigem Pilot kein Ergebnis als Erfolg ausgeben.
- Report: geprüfte Videoanzahl je Publisher, `provisional-identity`/`review`/`unmatched`, Gründe, Beispieltreffer (öffentliche Filmtitel und TMDB-IDs), mögliche Sample-Dubletten und tatsächliche API-Zahlen; 14 Tage als Actions-Artefakt und zusätzlich bereinigt im Job-Log.
- **Keine Behauptung von Überschneidungen mit dem aktuellen Live-MovieHub-Katalog.** Das versionierte `public/catalog.json` enthält lediglich einen leeren Fallback; eine belastbare Gegenprüfung benötigt separat den aktuellen, veröffentlichten kanonischen Titelbestand. Diese Phase dokumentiert nur Mehrfachidentitäten **innerhalb der YouTube-Stichprobe**.
- Prüfungen: synthetische Unit-Tests für Titel-/Jahres-Extraktion, fehlende Jahre, Konflikte bei der Laufzeit, Fremdkanäle und doppelte TMDB-ID; normaler CI-/Android-Build vor Aufnahme in `main`.

**Nächstes fachliches Gate nach dem echten Lauf:** Die Anzahl `provisional-identity` ist **keine automatische Matchquote**. Erst die manuelle Einzelfallprüfung und später die tatsächliche DE-/Android-/Fire-TV-Wiedergabe erlauben eine fundierte Entscheidung über künftige Adapteraktivierung, Aktualisierungsrhythmus und Filterqualität. **G2 weiterhin nicht freigegeben.**

## G1-Livebefund – vollständige Playlist-ID-Inventarisierung und 200er-Stichprobe erfolgreich (16.10.2026)

**Primärbeleg:** [GitHub Actions Run #38878217586](https://github.com/matthias-ennen/movie-hub/actions/runs/38878217586), manuell auf `main`, vollständig **SUCCESS**. [14-Tage-Report als GitHub-Artefakt #12036217546](https://github.com/matthias-ennen/movie-hub/actions/runs/38878217586/artifacts/12036217546), Job **116898314139**. Erzeugung 2026-10-16 09:07:05 UTC, Ende des Laufes rund 09:07:21 UTC. Alle API-Abfragen, Secret-Manager-Zugriffe und Artefakt-Upload erfolgreich. Dieser Abschnitt gibt **tatsächliche, im Job-Log gelesene Messdaten** wieder, nicht vorweggenommene Erwartungen.

### Inventar- und Stichprobengrößen

| Kennzahl | CiNENET Deutschland | Netzkino | Gesamt |
| --- | ---: | ---: | ---: |
| Quelle | UCM.ONE-verlinkte Themenplaylist „Silvester 2025“ | Kanal-Upload-Playlist | Zwei unterschiedlich kuratierte Eingänge |
| YouTube-`playlists.list.contentDetails.itemCount` | **24** | **2.766** | **2.790 Listeneinträge**, **keine** 2.790 bewiesenen Filme |
| Vollständig inventarisierte gültige eindeutige Video-IDs | **24** | **2.766** | **2.790** (innerhalb der Einzellisten) |
| `playlistItems.list`-Seiten zur Erfassung | **1** | **56** | **57** |
| Bewusst ausgewählte Video-IDs | **24** | **176** | **200 eindeutige IDs** |
| Durch `videos.list` aufgelöste Metadatensätze | **24/24** | **176/176** | **200/200** |
| Langvideo-Kandidaten (ab 45 Minuten, eigener Kanal) | **23** | **151** | **174** |
| Kurzvideos unter 20 Minuten | 0 | **21** | **21** |
| Mittlere Laufzeit 20–44 Minuten | 0 | **4** | **4** |
| Video aus anderem Kanal in der Publisher-Playlist | **1** | 0 | **1** |
| Explizites `DE` in `regionRestriction.allowed` | **22** | **172** | **194** |
| Kein eindeutiges DE-Regionssignal | **2** | **4** | **6** |
| Explizite DE-Sperre / DE nicht in Allowlist | 0 | 0 | **0** |

**API-Verbrauch:** **64 erfolgreiche GET-Abfragen** laut laufendem Script: `channels.list` ×1; `playlists.list` ×2; `playlistItems.list` ×57; `videos.list` ×4. Innerhalb der festen Grenzen 70 Seiten pro Playlist, 90 API-Aufrufe insgesamt und maximal 200 Metadaten-IDs. API-Quota in Google Cloud nicht unabhängig gemessen.

**Absolut wichtig:** Eine Upload-Playlist von **2.766** Einträgen ist ein Video-Inventar, keine Ansammlung 2.766 bestätigter Vollfilme. Auch die 174 als Langvideo eingestuften Datensätze sind **nur vorläufige Kandidaten** ohne TMDB- oder Rechtsprüfung. Die **194 DE-Allowlist-Signale** belegen ausschließlich ein Metadatenmerkmal, keine tatsächliche Abspielbarkeit in Deutschland oder auf Fire TV.

### Qualitätsbefunde aus genau dieser Stichprobe

- Die **21 Shorts/Clips unter 20 Minuten** allein bei Netzkino beweisen, dass Kanal-Uploads vor dem Filmabgleich gefiltert werden müssen. Die vier Fälle zwischen 20 und 44 Minuten bleiben **Review-Kandidaten**, nicht automatische Ablehnungen.
- Der **fremde Upload-Kanal in einer CiNENET-kuratierten Playlist** ist eine Provenienz-Abweichung. Das Playlist-Vertrauenssignal darf **nicht** auf den tatsächlichen Eigentümer eines Videos übertragen werden. Diesen Datensatz für **separate Publisher-/Lizenzprüfung** kennzeichnen, nicht automatisch als rechtlich ungültig oder endgültig zu löschen deklarieren.
- **Netzkino-Sampling:** neueste 20 Einträge sowie über die gesamte Upload-Playlist gleichmäßig verteilte Positionen, insgesamt 176 ausgewählte IDs. **CiNENET:** alle 24 Einträge dieser Publisherplaylist. Deterministisch, aber **keine repräsentative Zufallsstichprobe**. Die 151/176 ≈ **85,8 %** Langvideo-Kandidaten gelten **nur für die untersuchte Netzkino-Auswahl**, nicht für sämtliche 2.766 Einträge.
- Der sichtbare Aufrufzahl-Rang ist **kein globales Top-Ranking** aller Netzkino-Uploads. Ein Ranking des ganzen Kanals verlangte `statistics.viewCount` für sämtliche relevanten Videos – nicht allein die ID-Inventarisierung.
- **Beispiele aus der temporären Rangliste (Messmoment 16.10.2026):** CiNENET „Viking Blood“ ist unter den gemessenen Langvideo-Kandidaten vorn; Netzkino „Die Rache der Putzfrauen“ vor „American Soldiers – Ein Tag im Irak“ und „Mitten im Sturm“. **Keine** dauerhafte Speicherung dynamischer `viewCount`-Einzelwerte im Repository; Original-Ranking siehe befristetes Actions-Artefakt.
- `statistics.viewCount` (YouTube-Popularität) kann ein **nachrangiges Discovery-/Priorisierungssignal** sein; nach bestätigtem TMDB-Match sollte im kanonischen Titelmodell weiterhin TMDB-basierte Identität/Qualität/Popularität getrennt bleiben. Der bekannte zeitlich verteilte Probenplan ist eine **Datenbeschaffungsstrategie**, kein Produktionssortiervertrag.

### Nachweisstand und nächstes Gate

**Bestätigt:** Secret-/WIF-Verbindung, offizielle read-only API, tatsächliche seitenvollständige ID-Inventarisierung der beiden *ausgewählten* Playlists, die 200er-Metadatenprobe, Publisher-/Kurzvideo-/Laufzeit- und DE-Metadatengruppierung, erste nach Aufrufen sortierte **Stichproben-Rangliste**, erfolgreiches separates Artefakt.

**Noch offen:** konservative TMDB-Suche/Normalisierung (deutscher Titel, Originaltitel, Releasejahr, Laufzeit, Medientyp), genaue TMDB-Matchquote, Dubletten zwischen unterschiedlich hochgeladenen Videos bzw. existierenden Netzkino-Angeboten in MovieHub, Beleg für legal verfügbare Vollfilme, tatsächlich kostenlose Verfügbarkeit, DE-Playback, Fire-TV-Route und Endgeräteabnahme. **Nicht alle möglichen CiNENET-/UCM.ONE-Playlists oder Kanäle wurden inventarisiert**, nur die eine bestätigte Themenplaylist.

**Empfohlene nächste isolierte Untersuchung:** 200er-Stichprobe mit dem vorhandenen zentralen TMDB-Katalog bzw. bestehenden sicheren TMDB-Zugang vergleichen, **ohne** neue Filmidentitäten aus unbestätigten Videotiteln zu erzeugen. Normalize/Match mit Confidence, eindeutigen Entscheidungen, Review-/Reject-Gründen und bereits vorhandenen Media-IDs; nicht vorzeitig einen Produktivadapter oder Quellen-Badges einschalten. Für die vollständige dynamische Kanal-Popularität wären zusätzliche `videos.list`-Batches nötig, das ist **nicht** Inhalt des abgeschlossenen G1-Piloten.

**G1-Teilentscheidung:** Erstes Quellen-Inventar und technische 200er-Datenprobe **abgenommen auf technischer Ebene durch erfolgreiche Automation**; **inhaltliche Rechte-/Match- und Endgeräte-Abnahme bleibt ausstehend**. #388 bleibt offen, keine G2/G3/G4-Freigabe.

---

## Historischer G1-200er-Implementierungsplan vor dem erfolgreichen Live-Lauf

## G1-Vertiefung – größere, zeitlich verteilte Stichprobe in Vorbereitung (16.10.2026)

**Ausgangsentscheidung:** Nach erfolgreichem 24-Video-Smoke-Test und der Diskussion zur YouTube-Sortierung soll der Adapter zunächst **die vollständige Playlist-ID-Inventarisierung** demonstrieren und **höchstens 200 Videodetails** über eine bewusst gemischte Stichprobe abrufen. Der Pilot wird **separat** vom bisherigen 12+12-Smoke-Test entwickelt; **noch nicht live ausgeführt**, daher fehlen gemessene neue Zahlen. Kein Produktivauftrag.

### Methodik der neuen Teststrecke

- Neuer **manueller** Workflow `.github/workflows/youtube-api-g1-inventory.yml`, nur auf `main`, kein Zeittrigger, keine automatische Cloud-Veröffentlichung, kein Zugriff auf Firebase oder TMDB.
- `scripts/youtube-api-inventory-pilot.mjs` nutzt denselben vorhandenen `YOUTUBE_API_KEY`-Secret-Manager-Zugriff und ausschließlich die offiziellen **GET**-Methoden `channels.list`, `playlists.list`, `playlistItems.list` und `videos.list`.
- **Alle Seiten** der beiden nachgewiesenen Publisherquellen inventarisieren (CiNENET-Publisherplaylist, Netzkino-Kanal-Uploadliste). Bis **50 Einträge/Seite**, maximal **70 Seiten je Playlist**; bei Überlauf, fehlerhafter Pagination oder fehlgeschlagenen API-Aufrufen **abbrechen statt Teildaten als vollständig ausgeben**.
- Stichprobe aus dem vollständigen ID-Inventar: maximal **40 CiNENET-Videos** (derzeit nach G1-Messung 24), plus verbleibende Slots aus Netzkino bis **200 eindeutige IDs**. Von Netzkino die ersten bis zu 20 Uploads bevorzugen, die übrigen **deterministisch über die gesamte Liste verteilen**, damit nicht nur die neuesten Uploads berücksichtigt werden.
- Gesammelte max. 200 Video-IDs in `videos.list`-Batches zu je maximal 50 abfragen, einschließlich `statistics.viewCount`, Laufzeit, Kanalzuordnung, DE-Regionalsignalen und Status. **Kein permanentes API-Datenarchiv.**
- Reiner Vorfilter: Clips unter **20 Minuten** ausschließen, **20–44 Minuten** als unklar einstufen, ab **45 Minuten** nur als **Langvideo-Kandidat**. Fremdkanäle, nichtöffentliche und für DE ausdrücklich eingeschränkte Videos getrennt diagnostizieren. **Länge und Videotitel allein beweisen keine vollständigen oder lizenzrechtlich einwandfreien Filme.**
- **YouTube-Aufrufzahl als provisorisches Sortiersignal:** Ranking der **geeigneten Langvideo-Kandidaten nur innerhalb der höchstens 200 gewählten Videos**. `viewCount` ist kein TMDB-Rating und seit August 2026 auch um Starts/Autoplay/Hover beeinflusst; nicht als globale Netzkino-Topliste oder Qualitätssiegel interpretieren.
- Bericht mit tatsächlichen Playlistgrößen, gezählten IDs, Sampling-Positionen (aktuell/älter), Filterausschlüssen, Regionshinweisen, bis zu zwölf bestplatzierten YouTube-Links pro Quelle und API-Aufrufzahlen. Es werden weder geheime Zugangsdaten noch vollständige Rohantworten geloggt; GitHub-Artefakt wird **14 Tage** aufbewahrt.
- Harte Limits: **max. 90** YouTube-API-Requests insgesamt, **max. 70** Listen-Seiten je Quelle, **max. 200** verschiedene Video-IDs. Kein `search.list` zur vermeintlich vollständigen Kanalabdeckung.

**Gates:** Dieses Paket misst Inventarkonsistenz, zeitlich gestreute Datenqualität und eine **erste API-basierte YouTube-Sortierung**. Der nächste, separat zu entscheidende Analyseschritt ist die konservative TMDB-Zuordnung der Langfilm-Kandidaten, inklusive Originaltitel/Jahr/Laufzeit, Unsicherheiten und Duplikaten. **Noch keine seriöse TMDB-Trefferquote, keine Einzelvideo-Lizenz- oder tatsächliche DE-/Fire-TV-Wiedergabebestätigung.**

**Offizielle API-Nachweise:**
- [playlistItems.list – Pagination, maximal 50 Items, keine freie Sortierung](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list)
- [videos.list – Metadaten/Statisik abrufen](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)
- [videos statistics.viewCount – Definition seit 24.08.2026](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- [YouTube-Quota-Kosten](https://developers.google.com/youtube/data/determine_quota_cost)

## G1 – Quantitativer Erstbefund: YouTube Data API liefert echte Filmdaten (16.10.2026)

**Beleg:** [Run #38874604617](https://github.com/matthias-ennen/movie-hub/actions/runs/38874604617) · [reduzierter Originalbericht, GitHub-Artefakt](https://github.com/matthias-ennen/movie-hub/actions/runs/38874604617/artifacts/12034467922), 14 Tage Aufbewahrung · Job **116886514755**. Start 08:34:33 UTC / **10:34 Uhr Europe/Berlin**, erfolgreich abgeschlossen; Videoantworten im **Job-Log** überprüft. Diese Zahlen entstammen **echten authentifizierten YouTube-Data-API-v3-Antworten**, nicht hypothetischen Annahmen oder Tests mit Fixtures. Der Test lief ausschließlich manuell und schreibgeschützt.

### 1. Gemessene Zahlen

| Kenngröße | CiNENET Deutschland | Netzkino | Zusammen |
| --- | ---: | ---: | ---: |
| Untersuchte Quelle | CiNENET-Playlist „Silvester 2025“ | offizieller Kanal-Uploadbestand | zwei unterschiedliche Quelletypen |
| Von `playlists.list` gemeldete **Playlist-Einträge** | **24** | **2.766** | **2.790 Playlist-Einträge** *unterschiedlicher Listen*, **keine 2.790 geprüften Filme** |
| Mit `playlistItems.list` abgefragte Einträge | **12** | **12** | **24** |
| Eindeutige formal gültige Video-IDs in den abgefragten Einträgen | 12 | 12 | 24 |
| Durch `videos.list` tatsächlich aufgelöste Videos | 12 | 12 | **24 von 24** |
| `regionRestriction.allowed` enthält `DE` | **11** | **11** | **22** |
| Kein ausdrückliches DE-Regionssignal | **1** | **1** | **2** |
| Mit `regionRestriction.blocked` gesperrtes `DE` in Stichprobe | **0** | **0** | **0** |
| Offenkundige Kurzclips, Laufzeit unter 20 Minuten | **0** | **1** | **1** |

**API-Aufrufe insgesamt: genau 6** (1 × `channels.list` für beide Kanäle, je 2 × `playlists.list` und `playlistItems.list`, 1 × `videos.list` für alle eindeutigen IDs). Die sechs erfolgreichen Aufrufe verbrauchten nach dokumentierter Regel **rechnerisch sechs Quota-Einheiten**; ein konkreter Google-Cloud-Quota-Dashboard-Messwert liegt **nicht** vor.

**Wichtige Unterscheidungen:** `playlists.list.contentDetails.itemCount=2766` erfasst die **Upload-Playlist** eines YouTube-Kanals; sie ist **kein verifizierter Katalog von 2.766 vollständigen kostenlosen Filmen**. Die CiNENET-Liste ist dagegen eine von UCM.ONE selbst verlinkte Themen-Playlist und hat hier tatsächlich 24 API-Einträge. Aufgelöste IDs bedeutet **nicht** bewiesener vollständiger Film, Lizenz oder DE-Playback.

### 2. Erste Qualitätsbefunde

- **CiNENET:** Alle zwölf betrachteten Videos haben Laufzeiten in der Größenordnung ungefähr 72 bis 120 Minuten; elf führen `DE` in der ausdrücklichen Freigabeliste. Der Titel **„Spiders On A Plane“** (2024) hat im API-Bericht bei rund 78 Minuten **kein DE-Regionalsignal**. Das ist **keine** nachgewiesene Sperre, sondern erfordert einen separaten Playbacktest.
- **Netzkino:** Elf der zwölf untersuchten Uploads sind von ihrer Länge her mögliche Langfilm-Kandidaten. Der zwölfte ist ein **32-Sekunden-Short** (Titel beginnt „Blutiges Bett ... #shorts“). Er besitzt **kein DE-Regionalsignal**. Das bestätigt, dass ein Kanal-Uploadfeed **auch Nicht-Filme** enthält und wir eine klare Film-/Clip-Filterung benötigen.
- YouTube-Titel enthalten teils Zusätze wie „ganzer Film“, Darsteller, Genre oder Werbewörter. Solche Formulierungen sind **nur schwache Hinweise** und dürfen nicht allein als TMDB-Identität oder Nachweis der vollständigen Werkfassung dienen.
- Die beiden Listen enthielten in den betrachteten 24 Einträgen **keine doppelte Video-ID**. **Nicht** geprüft wurden Duplikate desselben TMDB-Films über unterschiedliche Videos oder die Überlappung mit dem bestehenden Netzkino-Angebot in MovieHub.
- Es gab keine Secret-/IAM-/API-Fehler; der manuelle Workflow, einschließlich Artefakt-Upload, war erfolgreich. Es wurden **keine** MovieHub-Titel, Poster, Provider-Badges, Firestore-Daten, Workflows für Nachtläufe oder Live-Adapter verändert.

### 3. Was die Messwerte ausdrücklich **nicht** beweisen

- Aus `regionRestriction.allowed=DE` folgt **nur ein YouTube-Metadatenhinweis** auf die Region. Ob der Film aktuell aus Deutschland auf Android/Fire TV tatsächlich zu öffnen und kostenlos vollständig anzusehen ist, bleibt zu testen.
- Weder die zwölf Langfilm-Kandidaten von CiNENET noch die elf von Netzkino sind bislang automatisiert gegen **TMDB-ID + Medientyp + Laufzeit/Jahr/Originaltitel** gematcht. **Eindeutige TMDB-Treffer: noch nicht erhoben.**
- 24 Videodatensätze sind eine **technische Funktionsprobe**, **keine repräsentative Stichprobe** für Rechtslage, Angebotstyp, deutschen Katalog, Filmschnitt oder Matchingquote.
- Publisher-Verifikation ist nicht gleich Lizenzbeweis für jedes einzelne Video, und `licensedContent` ist kein generelles DE-/FREE-Rechtsmerkmal.
- Rohlisten oder vollständige öffentliche YouTube-API-Metadaten werden nicht als dauerhafter Katalog in GitHub eingefroren; der reduktive Testbericht ist nur temporär als Actions-Artefakt verfügbar (14 Tage).

### 4. Nächstes G1-Untersuchungspaket, noch **nicht durchgeführt**

Eine **kontrollierte Erweiterung auf 100–200 eindeutige Video-IDs** aus mehreren verifizierten Publisher-Playlists/Uploadfenstern, mit Pagination, Kanalvalidierung, Laufzeit/Trailer/Shorts-/Serienfilter, verlässlichem Jahres-/Titelabgleich, konservativem TMDB-Matching und eindeutigem Reject-/Review-Pfad. Dabei getrennt ausweisen: Roh-Videos, ausgesonderte Shorts, Filmkandidaten, sichere/unsichere TMDB-Matches, YouTube-ID-Dubletten, Titel-Dubletten, Regionen und tatsächlich manuell validierte YouTube-App-Absprünge.

**Schutzgrenzen:** weiter ausschließlich lesender, manuell auslösbarer Diagnoseweg; kein produktiver Adapter/Import, keine unbelegte FREE-/ADS-Badges und keine Festlegung eines dauerhaften YouTube-Datenbestands, bevor API-Rechte, Aktualisierungsregeln und Laufzeitqualität geklärt sind.

**Einordnung:** G1 *erste technische Datenprobe bestanden*; **G1 Vollanalyse noch offen**. G2/Produktiveinführung weiterhin nicht freigegeben.

## Historischer Ablauf des ersten API-Tests (vor Verfügbarkeit des auslesbaren Berichts)

## G1 – erster authentifizierter API-Lauf erfolgreich (16.10.2026)

**Tatsächlicher Nachweis:** [GitHub Actions Run 38873598607](https://github.com/matthias-ennen/movie-hub/actions/runs/38873598607), manuell ausgelöst auf `main`, wurde erfolgreich abgeschlossen (Start 08:25:33 UTC / 10:25:33 Europe/Berlin, Abschluss 08:25:57 UTC). [Job 116883253037](https://github.com/matthias-ennen/movie-hub/actions/runs/38873598607) hat sämtliche Schritte erfolgreich durchlaufen: Workload Identity, `gcloud`-Einrichtung, isolierte Script-Syntax, `node scripts/youtube-api-smoke.mjs`, Abschluss. Der Job meldet ausdrücklich `Read-only YouTube API smoke abgeschlossen`. Da der Scriptpfad die ersten sechs offiziellen Abfragen nur nach Erfolg aller Abfragen vollständig beendet, ist **die technische Lesbarkeit des Secret-Werts, der API-Key und die grundsätzliche Abrufbarkeit der beiden Quellen bestätigt**. Es sind **keine** produktiven MovieHub-Daten verändert worden.

**Abgrenzung:** Dieser erste Lauf schrieb seinen Inhalt ausschließlich als **GitHub-Actions-Job-Zusammenfassung** (`GITHUB_STEP_SUMMARY`), nicht in die herunterladbaren Artefakte oder den regulären Job-Log. Die Verbindung zum GitHub-Repository bestätigt den grünen Lauf und die Log-Erfolgsmeldung, **kann die Job-Zusammenfassung aber nicht direkt auslesen**. Deshalb sind konkrete Playlistgrößen, Titel, tatsächliche Netto-ID-Zahlen oder regional gesperrte Videos derzeit **noch nicht belegbar**; kein geratenes Ergebnis. Technische Abrufbarkeit ist auch **kein Lizenz-/Gratis-/Vollfilm-/DE-Playback-Nachweis**.

**Historischer Zwischenstand (mittlerweile in PR #467 umgesetzt):** Die isolierte Probe sollte zusätzlich denselben **bereinigten öffentlichen Metadatenbericht** in die normalen GitHub-Logs schreiben und als `artifacts/youtube-api-g1/report.md` für 14 Tage in ein GitHub-Actions-Artefakt aufnehmen. API-Key, URL-Schlüsselparameter, rohe Fehlerantworten, TMDB-/Nutzerinhalte und Secrets sind ausdrücklich nicht Bestandteil. Die folgende erneute Ausführung ist separat manuell auszulösen; CI/Bereitstellung ersetzen keine zweite, echte Datenauswertung.

**Gates:** G0 Dokumentationsrecherche abgeschlossen; **G1 Grundfunktion der YouTube-API nachgewiesen**; erste quantitative Inhaltsauswertung ausstehend; G2/Produktivadapter weiterhin nicht freigegeben.

## G1-Testwerkzeug – nach Secret-Freigabe vorbereitet (16.10.2026)

**Nutzerbestätigung:** Das Secret `YOUTUBE_API_KEY` ist angelegt, und dem bestehenden Workload-Identity-Dienstkonto wurde am **einzelnen Secret** nach Rückmeldung des Nutzers die Rolle `Secret Manager Secret Accessor` zugewiesen. Tatsächliche Berechtigung, aktive Secret-Version und API-Key-Gültigkeit werden **erst durch den realen GitHub-Test nachgewiesen**.

**Implementierung ausschließlich als Diagnosewerkzeug:**

- Workflow `.github/workflows/youtube-api-g1-readonly.yml` mit **nur `workflow_dispatch`**, nur auf `main`. Kein Zeitplan, kein Trigger durch Pull Requests oder Pushes.
- Nutzt ausschließlich vorhandene GitHub-OIDC-/Workload-Identity-Konfiguration `github-movie-hub-deploy@movie-hub-62459.iam.gserviceaccount.com`; **keine** neue Service-Account-Schlüsseldatei und keine GitHub-Secret-Kopie des API-Keys.
- `scripts/youtube-api-smoke.mjs`: liest `YOUTUBE_API_KEY` aus Google Cloud Secret Manager **nur im Prozessspeicher**, sendet ihn als `x-goog-api-key`-Header (nicht URL), loggt weder den Schlüssel noch Rohfehlerkörper.
- Durchführt **maximal sechs** dokumentierte YouTube-Leseabfragen: `channels.list` für CiNENET/Netzkino (1), `playlists.list` für beide (2), `playlistItems.list` je Publisher (2; jeweils höchstens 12 Einträge), `videos.list` gemeinsam (1). Die konkrete CiNENET-Playlist ist `PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD`; Netzkino nutzt die API-bestätigte Upload-Playlist. **Keine weiteren Seiten und kein 100–200-Video-Import in dieser ersten Berechtigungsprobe.**
- Bericht ausschließlich als **GitHub-Actions-Jobzusammenfassung**: API-Playlist-Länge, Abrufzahlen, Video-ID-Treffer und öffentliche Stichprobentitel/Laufzeiten/technische DE-Regionssignale. Keine TMDB-IDs, keine Rechte-/Kostenfreigabe, kein Playbackversprechen.
- `tests/youtube-api-smoke.test.js` prüft ohne echte Keys/API-Abfragen Status-/Regionsbehandlung, sichere Schlüsselübergabe, Fehlermeldung und Ausgabe.
- **Kein** Daten-/Firebase-Schreibzugriff, kein MovieHub-Badge, keine neue Katalog-/Cloud-Funktion und kein Live-Deploy durch diesen Workflow.

**Ausführung, erst wenn Workflow auf `main` verfügbar:** GitHub → Actions → **YouTube API G1 Read-only Smoke** → **Run workflow** → Branch `main` → Start. Anschließend Schritt-/Job-Zusammenfassung in GitHub auswerten; Link zum Lauf in #388 nachtragen. **Nicht** das bestehende **Deploy Firebase**-Workflow starten.

**Sicherheitsaspekt bei Veröffentlichung:** Ein normaler Commit auf `main` löst den vorhandenen `Deploy Firebase`-Workflow aus, der nicht Teil dieser isolierten Probe sein soll. Zunächst eigenständigen PR samt Test-CI prüfen; Veröffentlichung des Diagnoseschritts möglichst ohne automatisches Deploy (z. B. nach grüner PR-CI mit **`[skip ci]`** im finalen Merge-Commit). GitHub verweist darauf, dass das Commit-Wort nur Push-/PR-Workflows überspringt, nicht den späteren `workflow_dispatch`-Test: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs . Vor einer Überspringung sicherstellen, dass Branchschutz/Required-Checks weiterhin erfüllbar sind.

## G1-Zugangsprüfung und konkretisierte Datenprobe – 16.10.2026

**Auftrag:** Nach Freigabe von G0 mit dem geplanten echten API-Test für CiNENET und Netzkino fortfahren. **Ergebnis:** Quellenidentität und API-Aufrufplan konkretisiert; **authentifizierter Abruf derzeit nicht ausgeführt, weil kein verwendbarer YouTube-API-Zugang über die verbundenen Werkzeuge vorliegt.** Die verbundenen GitHub-Werkzeuge ermöglichen die Einsicht in Repository-Dateien, aber keinen Abruf aus Google Cloud Console/Secret Manager und kein Auslesen eines bestehenden API-Schlüssels. Ob im Google-Cloud-Projekt `movie-hub-62459` bereits die YouTube Data API aktiviert oder ein Key eingerichtet ist, **konnte daher weder bestätigt noch ausgeschlossen werden**. Ein direkter Abruf über den hier verfügbaren Webzugang wurde technisch nicht bereitgestellt; das ist **keine** gemessene YouTube-API-Fehlerantwort und kein Nachweis eines 403/fehlgeschlagenen Schlüssels.

### Neu konkret verifizierte Publisher-Playlist

- **Herausgeber/Primärquelle:** [UCM.ONE – „Silvester 2025“ bei CiNENET Deutschland](https://ucm.one/de/silvester-2025-playlist-bei-cinenet-deutschland/), publiziert 28.12.2025.
- **Offizieller von UCM.ONE verlinkter YouTube-Pfad:** https://www.youtube.com/playlist?list=PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD
- **Playlist-ID:** `PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD`.
- **Publisher-Kanal:** CiNENET Deutschland `UClyuw-OWE6taGFv0reZI6eQ`; diese ID ist durch weitere UCM-/Verbraucherreferenzen als Kanal der Filmreihe belegbar.
- **Beispiele laut Publishertext (nicht per API bestätigt):** „Die Uhr des Grauens“, „Wollen Sie mit mir tanzen?“, „Josie – Gefährliche Begegnung“, „Milano Kaliber 9“, „Viking Blood“. Die Publisherseite enthält weitere Titel.
- **Wichtig:** Die Playlist vom Jahreswechsel ist ein **verifizierter Einstieg zur technischen Datenprobe**, aber **ihre heutige Zahl und regionale Abrufbarkeit wurden nicht gemessen**. Sie könnte deutlich unter 100–200 Items liegen. Daher zunächst deren tatsächliche Länge über die API prüfen, danach für das größere Sample weitere ausdrücklich vom Publisher gepflegte Playlists oder dessen offizielle Upload-Playlist einbeziehen.

### Exakte geplante Leseaufrufe (keine Anfragen ausgeführt)

1. **Kanalidentität/Uploadliste:** `GET https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=UClyuw-OWE6taGFv0reZI6eQ`. Benötigt einen gültigen API-Key; liefert bei Erfolg insbesondere `contentDetails.relatedPlaylists.uploads`.
2. **Direkt verlinkte Playlist prüfen:** `GET https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD`. `itemCount`, Owner und öffentlichen Status erfassen.
3. **Playlist-IDs lesen:** `GET https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD` und über `nextPageToken` seitenweise fortsetzen.
4. **Video-Metadaten anreichern:** `GET https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=<kommagetrennte Video-IDs>`, maximal 50 IDs je Batch. Fehlende/entfernte Videos, Besitzerkanal-ID, Laufzeit, Sprache und Region als getrennte Spalten auswerten.
5. **Falls die Publisher-Playlist zu klein ist:** weitere auf dem Kanal selbst gepflegte, öffentlich zugängliche Playlists oder die über Schritt 1 gelieferte Upload-Playlist sequenziell lesen, bis höchstens 200 unterschiedliche Video-IDs gesammelt wurden; **keine** Suche/Community-Playlist zum Auffüllen ungeprüfter Quellen.
6. **Netzkino Kontrollstichprobe:** dieselbe Sequenz mit Channel-ID `UCGkHFrwE8KEuOHPVsIOskAg` und einer dann tatsächlich per API bestätigten eigenen Playlist/Uploads; Vergleiche mit dem bereits im MovieHub-Katalog enthaltenen Netzkino-Angebot.

**Sichere Authentifizierung:** Für öffentliche Daten ist laut Google ein API-Key ausreichend, kein YouTube-OAuth-Login zum Publisherkanal. API-Key nur aus sicherer Umgebung verwenden, z. B. als Umgebungsvariable in geschütztem Prüflauf oder Secret Manager; bei Requests bevorzugt `x-goog-api-key`-Header verwenden und Schlüssel/Antworten mit Geheimnissen nie in GitHub-Kommentare, Repository oder ungeschützte Logs schreiben. Vor Installation neuen Infrastrukturzugang/Secret-Handling gesondert abstimmen. Dokumentation: https://developers.google.com/youtube/v3/getting-started und https://developers.google.com/youtube/v3/quickstart/java .

### G1-Status-Tabelle

| Prüfschritt | Status | Beleg/Grenze |
| --- | --- | --- |
| Publisher-Identität CiNENET | **Publisherbeleg vorhanden** | UCM.ONE (eigene Filmkanäle/AVOD-Angebot) |
| Konkrete Video-Playlist-ID | **Publisherbeleg vorhanden** | `PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD` |
| API-Methodik und Kontingentkosten | **Dokumentation geprüft** | Offizielle Google Data-API-Dokumente |
| Projekt-API-Aktivierung und Schlüssel | **Ungeprüft / Zugang fehlt in dieser Sitzung** | Kein Google-Cloud-/Secret-Manager-Zugriff |
| Echte Playlist-/Video-API-Antwort | **Nicht durchgeführt** | Nicht behaupten, dass 50/100/200 Videos abgerufen wurden |
| Tatsächliche Anzahl CiNENET-/Netzkino-Videos | **Unbekannt** | Erst aus `itemCount` / tatsächlichen `items` ermitteln |
| TMDB-Matchquote und Filmanteil | **Unbekannt** | Erst nach G1-Sample berechnen |
| DE-Wiedergabe / Rechte / Fire-TV-Absprung | **Nicht getestet** | API-Metadaten allein genügen nicht |

**Weiteres Vorgehen bei Freischaltung:** genau die sechs Schritte durchführen, mit niedrigem Abrufbudget und ohne Live-Import; anschließend erst echte statistische Befunde und unklare Daten im Issue #388 berichten. Keine App- oder Adapterimplementierung durch diese Zugangsprüfung.

## 1. Zusammenfassung

Die **offizielle YouTube Data API v3** eignet sich grundsätzlich, bekannte öffentliche Filmplaylists oder Uploadlisten verifizierter Publisher automatisiert zu inventarisieren, Video-IDs mit Metadaten nachzuladen und diese **als Kandidaten** konservativ gegen TMDB abzugleichen. Die API liefert aber **keinen im dokumentierten Methodenbestand bestätigten** vollständigen Feed des deutschen kostenlosen YouTube-Primetime-Katalogs und **kein verlässliches allgemeines Einzelvideo-Feld für FREE/ADS/RENT/BUY oder territoriale Verwertungsrechte**.

**Praktische Empfehlung:** mit einer **Publisher-Whitelist** (zuerst **CiNENET Deutschland**, daneben **Netzkino** als unabhängiger Kontrollfall) und einem 100–200-Video-Dry-run beginnen. Die Publisher-Angaben zu lizenzierten AVOD-Filmen sind gute Quellenhinweise, **keine pauschale Rechte-/DE-/Abspielgarantie für jedes Video**. Der zuvor gesammelte internationale Community-Playlistkatalog bleibt allenfalls ein späterer Stresstest, nicht Startpunkt für den Produktivkatalog.

## 2. API-Matrix

| Methode | Abrufbare Daten | Grenzen und Einsatz in MovieHub |
| --- | --- | --- |
| `channels.list` | Kanal-ID, Bezeichnung/Beschreibung, Upload-Playlist-ID über `contentDetails.relatedPlaylists.uploads`; weitere Kanalmetadaten | Verifizierbaren Publisher-Kanal als Quelle inventarisieren; keine eigene Prüfung des Rechtsumfangs |
| `playlists.list` | Playlist-ID, Titel, Beschreibung, Kanal und `contentDetails.itemCount` | Quellen identifizieren, Umfang vorab schätzen; Playlist kann Trailer/Clips/Mischformen enthalten |
| `playlistItems.list` | Pro Playlist Seite für Seite Video-ID (`snippet.resourceId.videoId`), Titel, Beschreibung, Position, Upload-Referenzen und Page Tokens | **0–50 Items je Seite**, `nextPageToken` bis Ende; kostengünstig, nur erreichbare Playlist; Kanaluploads über deren Upload-Playlist |
| `videos.list` | Batchweise Video-ID, Titel, Beschreibung, Channel-ID, Veröffentlichungsdatum, Thumbnail-URLs, Sprache, Laufzeit (ISO 8601), Regionseinschränkung, `licensedContent`, `privacyStatus`, `embeddable`, ggf. Alterseinstufungen, `madeForKids` und weitere Statusfelder | **bis 50 IDs pro Batch**; Laufzeit = Filterhilfe, kein Vollfilmbeweis; regionales Feld = Hilfsevidenz, kein vollständiger Test echter DE-Abspielbarkeit |
| `search.list` | Suche nach `q`, `type=video`, `regionCode=DE`, `relevanceLanguage=de`, `videoDuration=long` (>20 Min.), `videoType=movie`, `videoEmbeddable` u. a. | **Entdeckung**, kein vollständiger Katalog. `videoType=movie` bedeutet **nicht** „kostenloser Primetime-Vollfilm“. Bei `channelId + type=video` ohne Content-Owner-Spezialfilter auf max. 500 Ergebnisse begrenzt: für vollständige Kanalerfassung Upload-Playlist statt Search verwenden |
| `i18nLanguages.list`, `i18nRegions.list`, `videoCategories.list` | unterstützte Sprach-/Regions-/Kategorieverzeichnisse | Hilfsdaten, nicht zwingend für Pilot |

### 2.1 Wichtige tatsächliche Felder

**Quellenidentität:** `playlistId`, `videoId`, `channelId`, tatsächliche Besitzerkanal-ID (`videoOwnerChannelId`, soweit vorhanden), Playlist-Position. Ein Playlistbetreiber ist nicht automatisch der Uploader/Rechteinhaber.

**Kandidatenerkennung:** `snippet.title`, `description`, `publishedAt`, `defaultLanguage`, `defaultAudioLanguage`, `contentDetails.duration`, ggf. lokalisierte Texte. Veröffentlichungsdatum eines YouTube-Uploads ist **nicht** das Erscheinungsjahr des Films.

**Technische Sichtbarkeit:** `privacyStatus`, `regionRestriction.allowed/blocked`, `embeddable`, `contentRating`. Keine der Eigenschaften garantiert für jeden realen Nutzer zu jeder Zeit unbeschränkte Wiedergabe; `embeddable=true` kann auch wegen Rechteansprüchen scheitern.

**Lizenzindikator:** `licensedContent` bedeutet laut Google, dass ein Upload einem YouTube-Content-Partner zugeordnet und vom Partner beansprucht wurde; es bestätigt **nicht**, dass für MovieHub eine eigenständige Download-/Nutzungs-/Unterlizenz besteht. Das Metadatenfeld `status.license` (Standard-/Creative-Commons-Lizenz) ist ebenfalls **keine** automatische Freigabe, ein fremdes Werk selbst zu verbreiten.

**Nicht bestätigt als öffentliches Standardfeld:** verbindliche Zuordnung YouTube-Video ↔ TMDB-ID, Kinofilm als vollständige Werkfassung, exakter DE-Preisstatus `FREE/ADS/RENT/BUY`, DE-Verwertungslizenz oder planbares Verfügbarkeitsende.

## 3. API-Kontingente – am 15.10.2026 geänderte offizielle Dokumentation

**Aktueller Stand 16.10.2026:** Die Google-Dokumentation nennt für **`search.list` einen eigenen Standard-Bucket von 100 Aufrufen täglich**, pro Aufruf **1 Einheit**. Für alle anderen üblichen Data-API-Endpunkte zusammen beträgt das dokumentierte Standardkontingent **10.000 Einheiten täglich**; `playlistItems.list`, `videos.list`, `channels.list`, `playlists.list` jeweils **1 Einheit pro Abruf**. `videos.insert` hat ebenfalls einen separaten Bucket, für uns irrelevant. Diese Werte können pro Cloud-Projekt angepasst werden; echte Quotas beim API-Key-Projekt prüfen.

**WICHTIG:** Frühere Tabellen/Artikel können `search.list = 100 Einheiten` angeben. Für diese Untersuchung gilt die aktuelle offizielle Quota-Tabelle mit Update **15.10.2026**, die **100 tägliche Suchaufrufe à 1 Einheit** festhält. Nicht den alten Suchkostenwert in Berechnungen übernehmen.

### Rechenbeispiele, **nicht ausgeführt**

- **200 Einträge aus bekannter Playlist:** vier `playlistItems.list`-Seiten (50/Seite) plus vier `videos.list`-Batches = **8 Einheiten**, ohne Quellenermittlung, Fehler und Wiederholungen. Zusätzliche `channels.list`-/`playlists.list`-Prüfungen jeweils 1 Einheit.
- **1.000 Einträge:** 20 Playlist-Seiten + 20 Videodetail-Batches = **40 Einheiten** unter denselben Idealannahmen.
- Suchvorgänge müssen wegen des **separaten 100-pro-Tag-Limits** sparsam eingesetzt werden. Bekanntes Quelleninventar direkt über Playlists statt tägliche `search.list`-Abfragen überwachen.

**Belege:**  
- https://developers.google.com/youtube/data/determine_quota_cost  
- https://developers.google.com/youtube/data/getting-started  
- https://developers.google.com/youtube/data/reference/rest/v3/search/list

## 4. Zwei getrennte Filmeintrittspfade

### 4.1 Kostenloser offizieller YouTube-Primetime-Katalog

YouTube bestätigt in der Hilfe, dass kostenlose werbeunterstützte Primetime-Filme **in Deutschland** existieren und `youtube.com/movies` den Nutzerkatalog zeigt. Gleichzeitig bietet YouTube auch Leih- und Kaufangebote. Aus den dokumentierten Data-API-Methoden wurde **kein spezieller maschinenlesbarer Komplettfeed** identifiziert, der ausschließlich alle deutschen `FREE/ADS`-Primetime-Filme oder die Einzelpreise ausgibt. Weder `regionCode=DE` noch `videoType=movie` ersetzt diese Angebotsklassifizierung.

**Status:** interessantes Fernziel, **vorerst No-Go für automatischen vollständigen Primetime-Katalog ohne dokumentierten Zugriff**. Keine HTML-/Player-/Internal-API-Extraktion als Ersatz.

Belege:  
https://support.google.com/youtube/answer/16618963?hl=de  
https://support.google.com/youtube/answer/9674101?hl=de  
https://developers.google.com/youtube/data/reference/rest/v3/search/list

### 4.2 Öffentliche Filmkanäle und ihre Playlists

Für bekannte seriöse Publisherkanäle sind Kanal-/Playlist-/Videoabfragen dokumentiert. Die API lässt sich so als Datenquelle für **Kandidaten** einsetzen. Publisheridentität und Lizenzbehauptung müssen unabhängig verifiziert werden, insbesondere bei Playlists mit Videos fremder Uploader.

**Empfohlener erster Quellenkandidat: [CiNENET Deutschland](https://www.youtube.com/channel/UClyuw-OWE6taGFv0reZI6eQ)**, Channel-ID `UClyuw-OWE6taGFv0reZI6eQ`. Kanal nennt den Betreiber **UCM.ONE GmbH** und beschreibt seine Filme als lizenziert und kostenlos. [UCM.ONE beschreibt den CiNENET-Vertrieb über YouTube und weitere Plattformen ausdrücklich als AVOD-Angebot](https://ucm.one/de/cinenet/). Für die Analyse besonders interessant: anderer Rechteinhaber/Publisher als das bereits in MovieHub angezeigte Netzkino.

**Zweiter Kandidat / Kontrollfall: [Netzkino](https://www.youtube.com/channel/UCGkHFrwE8KEuOHPVsIOskAg)**, Channel-ID `UCGkHFrwE8KEuOHPVsIOskAg`, Betreiber laut verifiziertem Kanal **PLAION PICTURES GmbH**, beschreibt ganze lizenzierte Filme als werbefinanziertes Angebot. MovieHub hat Netzkino bereits als Anbieter; **YouTube darf deshalb keine künstlichen neuen Filmtitel oder doppelte Anbieterwahrheit erzeugen**, sondern allenfalls einen belegten zusätzlichen Playbackweg zum selben TMDB-Titel.

**Weitere vorhandene Issue-Kandidaten:** DEFA Filmwelt, Movies Select, große kuratierte Community-Playlist. Erst nach gesonderter Source-/Publisherprüfung einbeziehen; Community-Playlist nicht als verifizierten Rechtekatalog behandeln.

## 5. Verbindliche Plattform-/Compliance-Grenzen

Aus den offiziellen YouTube API Services Developer Policies und den Required Minimum Functionality-Regeln ergeben sich mindestens diese Prüfpflichten:

1. **Keine audiovisuelle Extraktion:** YouTube-Videos nicht ohne vorherige schriftliche Genehmigung herunterladen, spiegeln, puffern, in eigenen MovieHub-Player remuxen oder als direkte Stream-URL extrahieren. YouTube-App bzw. regelkonformer YouTube-Player verwenden.
2. **Kein Scraping/undokumentierte APIs:** YouTube-Weboberflächen und interne Player-APIs sind kein Ersatz für den dokumentierten Datenzugang.
3. **API-Daten nur kontrolliert vorhalten:** Für nicht autorisierte API-Daten (öffentlich abgefragte Fremdkanal-/Video-Metadaten) gilt im Regelfall **spätestens nach 30 Kalendertagen löschen oder erneuern**. Änderungs-/Löschsignale frühzeitig reflektieren. Das ist ein wichtiges Design-Gate für inkrementelle Snapshot-Aktualisierung.
4. **YouTube-Attribution:** Quelle YouTube an den dargestellten YouTube-Daten/Resultaten gemäß Branding-Regeln kenntlich machen. Fremde Quellen-/YouTube-Daten nicht täuschend vermischen.
5. **Wiedergabeintegrität:** Ads nicht unterdrücken; YouTube-Playerfunktionen nicht verdecken oder verändern; keine Umgehung von Alters-, Region-, DRM- oder Loginregeln. Bei eingebettetem Player zusätzlich Referer und weitere Mindestfunktionen prüfen; `madeForKids`-/Datenschutzvorgaben beachten.
6. **Separater rechtlicher Review:** Es ist zu klären, ob Aggregation, TMDB-Matching und Anzeige als MovieHub-Verfügbarkeit im geplanten Umfang mit den aktuellen API-Policies sowie Publisherrechten vereinbar sind. Die Recherche ist **keine juristische Freigabe** und ersetzt Issue #112 nicht.
7. **Keine Schlüssel im Client/Repo:** Öffentliche Daten für den späteren Adapter serverseitig über einen entsprechend begrenzten API-Key abrufen; Schlüsselhaltung und Quota-Budget nach bestehender Projektarchitektur prüfen.

Belege:  
https://developers.google.com/youtube/terms/developer-policies  
https://developers.google.com/youtube/terms/required-minimum-functionality  
https://developers.google.com/youtube/terms/branding-guidelines

## 6. Geplanter nichtproduktiver G1-Datenpilot – erst nach Freigabe

### 6.1 Methodische Reihenfolge

1. Cloud-Projekt/YouTube-API-Aktivierung, Schlüsselablage, tatsächliche Quota, erlaubte Nutzung **lesen und prüfen**, keine produktive Veränderung.
2. **CiNENET-Kanal-ID** über `channels.list(part=snippet,contentDetails, id=...)` lesen; Upload-Playlist-ID und ggf. explizite Filmplaylists über `playlists.list` feststellen.
3. Eine tatsächlich bestehende freigegebene Filmplaylist bevorzugen; andernfalls Channel-Uploads nur als **ungefiltertes Kandidatenset** behandeln. **100–200 Einträge** mit `playlistItems.list(part=snippet,contentDetails,maxResults=50,playlistId=...)` lesen.
4. Zurückgegebene `videoId`s mit `videos.list(part=snippet,contentDetails,status,id=<CSV der IDs>)` in Batches anreichern. Fehler, fehlende Videos, Quota-Auslastung, Regionssignale dokumentieren; nicht in die produktive App schreiben.
5. Film-/Trailer-/Serien-/Clip-Kandidaten anhand Titel, Originalfilmlaufzeit und Publisher getrennt klassifizieren. Mögliche TMDB-Matches nur bei ausreichender Evidenz übernehmen; unklare Kandidaten offen lassen.
6. **Individuelle deutsche Wiedergabeproben** kontrolliert in der YouTube-App/Weboberfläche, danach auf realem Smartphone/Fire TV; keine Vorwegnahme tatsächlicher Nutzerabnahme.
7. **G1-Ergebnisbericht:** abgerufene Playlist-Videos, bereinigte IDs, volle Filme, eindeutig/uneindeutig/nicht gematcht, durch DE-Probe gültige Angebote, funktionierende Video-ID-Sprünge, kosten-/regionsbedingte Ausfälle, API-Kosten und rechtliche Risiken.
8. Nur nach Nutzerentscheidung **G2** eine kleine produktive Adapterumsetzung planen.

### 6.2 Erforderliche Soll-/Ist-Abgrenzungen

- **Kann:** Kanal/Playlist/Video-Metadaten via dokumentierter API abrufen; bekannte Video-IDs stabil referenzieren.
- **Nicht belegt:** vollständige deutsche Free-Primetime-Bestandsabfrage, verlässliche aktuelle Gratis-Preisart je Video, automatisches Erkennen vollständig lizenzierter Filmwerke, zwingend funktionierender Fire-TV-Absprung.
- **Erst im Pilot bestimmbar:** Treffer-/Fehlerraten, DE-Abspielbarkeit, Matchabdeckung, Full-Movie-Qualität, tatsächlicher Quota-Verbrauch und Aktualisierungsausfälle.

### 6.3 Architektur-Zielbild bei möglicher späterer Umsetzung

`Publisher/Kanal + Playlist → YouTube Data API → evidenzierte Video-ID/Kandidat → konservativer TMDB-Abgleich → bestehender kanonischer Titel → getrennte Quelle/Provider/YouTube-PlaybackRoute → validierter Snapshot`.

TMDB bleibt die kanonische Titel- und Posterbasis. `YouTube` bezeichnet die Wiedergabeplattform; der lizensierende Anbieter/Publisher wird nicht automatisch durch das Plattformbranding ersetzt. Den Viewer nur zu einem tatsächlich zum Titel gehörenden Video schicken, mit sicherem Fallback, ohne Netzwerkanfrage pro Poster. Unter Vorbehalt der Plattform- und Copyright-Prüfung.

## 7. Ergebnis / Entscheidungsvorschlag

**G0: Informationsrecherche abgeschlossen, technische Eignung für einen begrenzten offiziellen Playlist-/Kanal-API-Pilot plausibel.**  
**G1: Noch nicht durchgeführt.**  
**G2/G3/G4: Weder freigegeben noch begonnen.**

**Empfehlung für die nächste Sitzung:** CiNENET als erste Quelle und Netzkino als Kontrollkanal in einer begrenzten offiziellen API-Stichprobe prüfen. Zunächst Quota/API-Key-Berechtigung und exakte Filmplaylist ermitteln; falls der Zugriff nicht sicher bereitsteht, keine erfundenen Zahlen melden. Noch keine UI, Firestore-Daten, Badges, Playback-App oder Nightly verändern.

## 8. Offizielle Quellen (Stand 16.10.2026)

- API-Methoden: https://developers.google.com/youtube/data/reference/rest/v3/channels/list
- Playlist-Methoden: https://developers.google.com/youtube/data/reference/rest/v3/playlists/list
- Playlist-Items: https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list
- Videos: https://developers.google.com/youtube/data/reference/rest/v3/videos und https://developers.google.com/youtube/data/reference/rest/v3/videos/list
- Suche: https://developers.google.com/youtube/data/reference/rest/v3/search/list
- Kontingente (aktualisiert 15.10.2026): https://developers.google.com/youtube/data/determine_quota_cost
- API-Überblick: https://developers.google.com/youtube/data/getting-started
- Kostenlose Filme in DE: https://support.google.com/youtube/answer/16618963?hl=de
- Filme leihen/kaufen: https://support.google.com/youtube/answer/9674101?hl=de
- API-Richtlinien: https://developers.google.com/youtube/terms/developer-policies
- Wiedergabepflichten: https://developers.google.com/youtube/terms/required-minimum-functionality
- UCM.ONE/CiNENET: https://ucm.one/de/cinenet/
- CiNENET-Kanal: https://www.youtube.com/channel/UClyuw-OWE6taGFv0reZI6eQ
- Netzkino-Kanal: https://www.youtube.com/channel/UCGkHFrwE8KEuOHPVsIOskAg
