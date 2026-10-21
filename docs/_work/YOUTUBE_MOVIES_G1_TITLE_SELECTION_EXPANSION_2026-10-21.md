# G1 – Titelbasis des YouTube-Movies-Adapters verbreitern (21.10.2026)

**Entscheidung:** Die Auswahl der **direkt über YouTube ermittelten Filmkandidaten jetzt im G1-Forschungspilot** erweitern, nicht erst nach Produktivbeginn. Der automatische dauerhafte MovieHub-Katalogimport, ein Scheduler und neue Badges gehören **erst in das separat freizugebende G2**. Diese Trennung folgt der verbindlichen TMDB-first-/Adapter-Anreicherung aus [ADAPTER_PROGRAM.md](../ADAPTER_PROGRAM.md).

## Ausgangszahlen und wichtige Nichtverwechslung

- Der **Publisher-/Playlist-Pilot** in `scripts/youtube-api-inventory-pilot.mjs` zieht bis zu **200** Video-IDs aus vertrauten Publisher-Playlists. Das sind Publisher-Uploads, **nicht** die breite Grundgesamtheit des von YouTube selbst angebotenen Movie-Stores.
- Die neue **YouTube-Movies-Shop-ID-Prüfung** `scripts/youtube-movies-store-id-g1.mjs` enthält bisher genau **vier feste TMDB-Filmfälle** und je Fall die Suchvarianten `videoType=movie` und `any`. Nur wenige Suchtreffer werden im Detail nachgeprüft. Drei davon – Nightmare Before Christmas (`movie:9479`), Der Pate (`movie:238`) und Oppenheimer (`movie:872585`) – haben inzwischen vom Nutzer bestätigte Android-/Fire-TV-Ziele.
- Der separate G1-TMDB-Offer-Test `scripts/youtube-movies-three-offers-g1.mjs` betrifft ausschließlich diese drei Filmtitel. Vier API-GETs haben die exakten TMDB-DE-Providerklassen erfasst. Er erweitert **noch nicht** die selbstständige YouTube-Filmkandidaten-Auswahl.

## Was wir JETZT als begrenzten G1-Test erweitern

**Zielumfang: 40–60 unterschiedliche YouTube-Movies-Werke** als erste repräsentativere, nichtproduktive Stichprobe, plus separat gelistete Mehrfach-IDs, Negativ-/Verwechslungsfälle und die bestehende Publisher-Kontrollgruppe. Das ist ein Testfenster, keine behauptete Gesamtzahl oder Vollständigkeit des deutschen YouTube-Shops.

1. **YouTube-first:** Über die **dokumentierte YouTube Data API** mit `type=video`, `videoType=movie`, `regionCode=DE` und begrenzten sachlichen Film-/Genre-/Jahr-Suchanfragen zunächst YouTube-seitige Kandidaten sammeln. Die Suche ist keine vollständige offizielle Storefront-Inventarschnittstelle. Keine undokumentierten Endpunkte, kein Scraping und keine blinde Kanalnamen-Freigabe. Pro Kandidat `videoId`, echte `channelId`, Laufzeit, RegionRestrictions, Titel und genaue Fundanfrage aus `videos.list` prüfen.
2. **TMDB-first als zweite Entdeckungsrichtung:** Eine abwechslungsreiche Liste deutscher TMDB-Filmwerke mit **konkret passenden deutschen YouTube-Provider-Detailangeboten** (YouTube-Provider 192 bzw. separat YouTube Free 235 / YouTube Premium 188, soweit tatsächlich vorhanden) gezielt gegen YouTube-Suchkandidaten abgleichen. TMDB-Discover wird ausschließlich für *Kandidaten*, niemals für ungeprüfte Kombinationen von Provider und `rent/buy/free/ads` verwendet.
3. **Abwechslungsreiche Titel:** unterschiedliche Epochen, nationale/internationale Werke, Genres, Original-/deutsche Titel und große/kleinere Filme statt bloß aktueller Popularität oder erster Suchtreffer. Zu Free/Ads/Rent/Buy keine künstlichen Quoten behaupten; die angebotenen TMDB-DE-Kategorien liefern lediglich einen nachvollziehbaren Stratifikationshinweis, keine öffentliche YouTube-Shop-Garantie.
4. **Strikte Identität:** Ein Werk wird primär als `(mediaType, tmdbId)` dedupliziert. YouTube-Video-IDs bleiben separate mögliche Fassungen/regionale Filmseiten. Titel, Jahr, Laufzeit, Kanal-ID, Originaltitel und Quellenqualität gemeinsam auswerten; Trailer, Clips, Dokumentationen *über* den Film und andere Filme trotz `videoType=movie` als Fehlkandidaten protokollieren. Unsichere Zuordnungen bleiben `review`/`unknown`; keine automatische Kanonisierung.
5. **Belastbare Datentrennung:** TMDB liefert kanonisches Werk und providergebundene DE-Angebotsklassen; YouTube liefert zulässigerweise abrufbare Film-Video-IDs, Link, Laufzeit und Regionssignal. Erfolgreiches `https://www.youtube.com/watch?v=VIDEO_ID` beweist keine Preis- oder Mitgliedschaftsvariante. Keine tiefe manuelle YouTube-Mitgliedschafts-/Preisprüfung als G1-Pflicht.

## Limitierte Durchführung und Qualitätssicherung

- Start in **schrittweisen Chargen** (zuerst etwa 15–20 Filmwerke, dann weitere bei sauberer Matchqualität) statt einem unkontrollierten Suchlauf. `search.list` kostet laut offizieller YouTube-Data-API 100 Quota-Einheiten; 60 Suchanfragen entsprächen schon etwa 6000 Einheiten. Ein festes Budget pro Pilotlauf, höchstens eine reguläre gezielte Suchanfrage je TMDB-Werk, sowie ein expliziter Abbruch bei Ausschöpfung sind nötig. Erweiterte Suchvarianten nur in gesonderten Diagnosefällen und mit dokumentiertem Kontingent.
- Video-Metadaten soweit zulässig **gebündelt** mit `videos.list` nachprüfen; unterschiedliche Treffer mit einer echten Video-ID nicht mehrfach abrufen. Nicht automatisch alle YouTube-Suchresultate als licensed Movies übernehmen.
- Je Quelle/Stichprobengruppe protokollieren: **gefunden, Videos-Metadaten vorhanden, potenzieller Vollfilm, deutsches Regionssignal, eindeutig gematchte TMDB-ID, nur manuelle Review, falsch zugeordnet, mehrere Film-IDs zu gleichem Werk, App-Link stichprobengetestet, aktuell nicht mehr verfügbar**.
- Fehlende Suchresultate sind **keine** bewiesene Nichtverfügbarkeit im YouTube-Movies-Shop (beim bisherigen G1-ID-Pilot tauchten vorhandene IDs nicht unter den ersten zehn Treffern auf). Ein leerer Treffer oder fehlender DE-Detailsatz bleibt `unknown`.
- Der Pilot darf **keine** neuen MovieHub-Inhalte, Anbieterbadges, Firestore-/Firebase-Daten, produktiven Film-Deep-Links oder APKs veröffentlichen. Seine Outputs sind temporäre Prüfberichte für die G1-Go-/No-Go-Entscheidung.

## G1-/G2-Grenze

**JETZT:** Testfall-Auswahl und read-only YouTube-Kandidaten-Discovery samt TMDB-Matching und Qualitätsstatistik für 40–60 Filme ausweiten. **SPÄTER – separat freizugebendes G2:** dauerhafte Produktionsabfrage, Zeitplanung, Frische-/Takedown-Logik, echte MovieHub-Kataloganreicherung, zentrale Provider-/Badge-Merge-Tests und Rollout. Ein belastbarer und erlaubter Vollkatalog-/Shop-ID-Feed ist bisher **nicht nachgewiesen**; die öffentliche YouTube-Filmsuche darf nicht als solcher dargestellt werden.

**Priorität als nächstes Technikpaket:** bestehende `FILMS`-Viererliste des G1-YouTube-Movies-Pilots in ein konfiguriertes und nachvollziehbar geschichtetes **Kandidaten-/Stichprobenmodell** überführen, nicht sofort den bestehenden 200er-Publisher-Pilot größer machen. Danach read-only Livebericht, nicht schon Produktionsintegration. Vor G2 erneut explizites Nutzer-Go einholen.

## Direktfreigabe 21.10.2026: 50-Titel-Research-Pilot auf main implementiert

**Nutzerauftrag: „Lass uns bitte direkt mit 50 Titel starten“**. Die frühere Empfehlung einer 15–20er-Zwischenstufe ist daher **aufgehoben**. Das neue Research-Tool ist explizit direkt auf **50 unterschiedliche YouTube-first-Filmkandidaten** ausgelegt; nicht zunächst 15 oder 20 Titel.

**Implementiert auf `main`:** [PR #491](https://github.com/matthias-ennen/movie-hub/pull/491) mit vier strikt isolierten G1-Forschungsdateien, Merge `9003a44768905f9e80e715a63f3f40e0d354d9d0` mit `[skip ci]`; [CI #39583563200](https://github.com/matthias-ennen/movie-hub/actions/runs/39583563200) **SUCCESS** (189 Testdateien und 1.220 Tests, einschließlich gemocktem 50-Titel-Research), [Android APK #39583563164](https://github.com/matthias-ennen/movie-hub/actions/runs/39583563164) **SUCCESS**. Research-Skript, Tests und Workflow wurden nach dem Merge auf `main` geprüft. Keine Produktivcode- oder Datenänderungen.

**Manuell ausführbarer [YouTube Movies G1 Fifty Titles (Read-only)](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-fifty-g1.yml)** prüft genau folgendes:

- **Quellenorientierung YouTube-first:** 20 genre-, epochen- und sprachenverschiedene Suchstrata in der **offiziellen YouTube Data API** (`search.list`, `type=video`, `videoType=movie`, `regionCode=DE`); je Suchstratum maximal die ersten 20 Video-IDs für Videos-Detailprüfung. Dies sind 20 Suchrichtungen, **nicht** die 15–20 Titel-Zwischenstufe. Ziel sind **50** unterschiedliche Filmkandidaten.
- **Feste, überwachte Budgets:** höchstens 20 `search.list` (je 100 API-Quota-Einheiten), bis zu acht gebündelte `videos.list`-Abrufe (je 1), Gesamtbudget 2.100 (rechnerischer Maximalverbrauch 2.008) und maximal 105 separate TMDB-GETs. Bereits vorhandenes YouTube-Secret kommt über GitHub-OIDC/Google Secret Manager, TMDB über bestehenden GitHub-Secret. Beide werden weder ins Repo noch in Artefakte geschrieben.
- **Auswahl:** YouTube-Kanal-Label `YouTube Movies` / `YouTube Movies & TV` (oder lokaler Name) als **vorläufiges Signal**, vollständige Laufzeit ab 60 Minuten, kein expliziter DE-Regionsausschluss, gültige Video-ID, öffentliche Video-Metadaten, Titel-/Video-ID-Deduplizierung; Round-Robin über alle Strata, **höchstens 50 unterschiedliche** YouTube-Titel. Titel/Kanalname/Region sind **keine** nachgewiesene Rechte-/Shop-/Angebotsfreigabe.
- **TMDB-Nachprüfung:** Je ausgewähltem YouTube-Titel eine begrenzte `search/movie`-Abfrage, bei genau einem exakten Titel-Alias zusätzlich ein TMDB-Filmdetail für den Laufzeitvergleich. Selbst identischer Titel/Laufzeit ergibt **nur einen plausiblen Review-Hinweis**, keinen automatischen kanonischen TMDB-Match. Mehrdeutige oder nicht gefundene Werke bleiben ausdrücklich offen.
- **Messbericht:** temporäres 14-Tage-Research-Artefakt `fifty-youtube-first.md` mit **echter** erreichten Titelzahl, Video-/Regionsdaten, TMDB-Vorschlagsstatus, Quota-Verbrauch und Liste sämtlicher ausgewählter Kandidaten. Falls YouTube nicht 50 geeignete eindeutige Kandidaten liefert, wird die **niedrigere tatsächliche Zahl** unverändert ausgewiesen, nicht durch fremde Trailer/Playlists erfunden.

**Wichtig zum Status:** PR/CI/APK belegen ausschließlich, dass der Pilot **technisch integriert und mit Mocks getestet** ist. Ein **echter Live-YouTube-50-Titel-Lauf wurde zum Dokumentationszeitpunkt noch nicht beobachtet/ausgewertet**. Nächste Aktion ist die einmalige manuelle Ausführung des Read-only-Workflows auf `main` und danach eine anhand des tatsächlichen Artefakts vorgenommene Match-/Coverage-Bewertung. G1 bleibt offen, G2–G4 und jeder produktive Titelimport bleiben ohne Freigabe.

## Erster echter 50-Titel-YouTube-first-Lauf – 21.10.2026, 10:25 UTC

**Originallauf und Originalartefakt:** [Workflow #39584388602](https://github.com/matthias-ennen/movie-hub/actions/runs/39584388602) **SUCCESS**, [Archiv #12337893476](https://github.com/matthias-ennen/movie-hub/actions/runs/39584388602/artifacts/12337893476) tatsächlich heruntergeladen und `fifty-youtube-first.md` vollständig gelesen. Start 21.10.2026, 10:24 UTC; Report 10:25 UTC. **Erster echter 50-Titel-Test liefert nicht 50, sondern 12 Kandidaten.** Technisch erfolgreich heißt nicht, dass 50 Filme identifiziert wurden.

| Messgröße | Echter Befund |
| --- | ---: |
| Ziel verschiedene Filmkandidaten | 50 |
| `search.list`-Abfragen (20 Genres/Epochen/Sprachen) | 20 |
| Eindeutige Such-Video-IDs (erste höchstens 20 je Stratum) | 307 |
| `videos.list`-Batches | 7 |
| Erfolgreich aufgelöste Videos | 307 |
| Nach Kanaltitel-/Vollfilmlänge-/DE-Regions-/Deduplizierungsfilter ausgewählte Kandidaten | **12** |
| TMDB-GETs | 19 |
| Plausibler TMDB-Titel plus ähnliche Laufzeit, weiterhin nur `review` | **6** |
| Mehrdeutiger TMDB-Titelmatch | 4 |
| Kein exakter TMDB-Titelalias | 1 |
| Exakter Titel, Laufzeit nicht ausreichend passend / noch Review | 1 |
| YouTube-Quota-Verbrauch nach klassischem 100-pro-search-Kostenmodell (Schätzung) | 2007 |

### Die zwölf tatsächlich ermittelten YouTube-Movies-Video-IDs (G1-Kandidaten)

| Film-Titel laut YouTube-API | Video-ID | Vorläufige TMDB-ID | Prüfstatus |
| --- | --- | ---: | --- |
| The Aristocats | `RY32dCRpRvE` | 10112 | plausible-review |
| 2010: The Year We Make Contact | `3ivgYkh5Res` | ? | unmatched-or-title-variant |
| In die Sonne schauen | `24u6ps_a_c4` | 1221061 | plausible-review |
| War Story | `cVubTPv90f4` | ? | ambiguous-review |
| Lügen haben kurze Beine | `j5PHSqJ7xl0` | ? | ambiguous-review |
| Everything Will Change | `RLsHxwsFVqY` | 788921 | plausible-review |
| My Name Is Khan | `m-hwfIKIb5w` | 26022 | title-exact-review |
| The Beast | `TPSkKEl65sE` | ? | ambiguous-review |
| Police Story | `IxL_x8G1_FU` | ? | ambiguous-review |
| T2 Trainspotting | `WRZ0-JNo5BE` | 180863 | plausible-review |
| Rambo II - Der Auftrag | `WlzWW8zfJSI` | 1369 | plausible-review |
| Als wir träumten | `u_Sf2eOZtiQ` | 311301 | plausible-review |

**Evidenzgrenze:** Die 12 resultieren aus dem simplen Filmlaufzeit-/DE-Signal-/Kanalnamen-Screening. Es sind **nicht** zwölf unabhängig nachgewiesene legitime YouTube-DE-Shop-Angebote, und die sechs plausiblen TMDB-Referenzen sind **noch keine automatisiert freigabefähigen Matches**. VideoChannelName `YouTube Movies` allein ist kein Lizenzbeweis. Keine Angebote/Badges, keine Filme in Firestore geschrieben.

**Wichtiger Befund für das Ziel 50:** Die 20 breiten Suchbegriffe haben bereits 307 individuelle Videos produziert; der einfache YouTube-Movies-Filter ergab nur zwölf eindeutige Filmkandidaten. **Weitere identische breite Suchrunden wären ineffizient.** Bessere erlaubte Quellenerschließung nötig, nicht Filter aufweichen und Trailer/Publisher als eigene Movies-Angebote zählen. Jetzt priorisieren: die hinter den zwölf IDs liegenden echten Kanal-IDs und öffentlich via Data API verfügbare Upload-Playlist-Metadaten auf möglichen legitimen Film-Katalog-Pfad untersuchen; falls kein Katalogfeed, anschließend gezieltere TMDB-Provider-seed-basierten Video-ID-Lookups evaluieren. Für alle Wege bleiben TMDB-Kanonisierung und sichere Video-ID-/Regions-/Linkvalidierung obligatorisch.

**Status:** G1 offen, 50er-Stichprobe **erst zu 12/50 Kandidaten abgedeckt**, 50er-Produktivimport **nicht** angestoßen. Kein G2-Go.
