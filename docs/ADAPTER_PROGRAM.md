# Movie Hub – Adapterprogramm und Quellen-Ausbau

## OPERATIVER STAND / MAẞGEBLICHE ÜBERGABE – 28.10.2026

**Ersetzt alle älteren untenstehenden G0/G1-No-Go-Priorisierungen als Beschreibung des IST-Implementierungsstands, nicht deren historische Forschungsergebnisse.** Waipu und Joyn laufen produktiv; YouTube hat die implementierte V1-Plattform mit **zwei Playlists, TMDB-first-Suche, Matchv1.1, privatem Kandidaten-Checkpoint, `videos.list`-Known-Recheck und automatischer Veröffentlichung eindeutiger Best-Effort-Video-Watch-Links am bereits bestehenden YouTube-Badge**. Die letzten produktiven Schritte sind [PR #692](https://github.com/matthias-ennen/movie-hub/pull/692) und [PR #693](https://github.com/matthias-ennen/movie-hub/pull/693).

**Freigaberegel:** YouTube-Match als genauer Film-Video-Link bei eindeutiger Werkidentität; **keine zusätzliche Freigabebedingung nach TMDB `rent`/`buy`/`free`/`ads`/`flatrate`**. Tarif-/DE-Wiedergaberechte werden nicht vom Matcher bewiesen und nicht als unabhängig verifiziert dargestellt. Trailer/Konkurrenztreffer/Sequel-Verwechslungen bleiben ausgeschlossen.

**Noch offen:** 2–3 echte `event=schedule`-Nachtläufe ab **29.10.2026** für den neuen zentralen **00:10 Europe/Berlin**-Workflow und dessen veröffentlichtes `youtube-best-effort-title-links.json`; konkrete Matcher-Tuning-Aufgaben erst aus den gemessenen Fehlergruppen ableiten; persönliche Endabnahme unter [#388](https://github.com/matthias-ennen/movie-hub/issues/388), das bis dahin offen bleibt.

**Parallel planbar:** [#336 DVB-I G0/Go-No-Go](https://github.com/matthias-ennen/movie-hub/issues/336) als nächster Quellenpilot, nachgeordnet [#391 Prime Video](https://github.com/matthias-ennen/movie-hub/issues/391). Waipu [#329](https://github.com/matthias-ennen/movie-hub/issues/329) / Joyn [#481](https://github.com/matthias-ennen/movie-hub/issues/481) als getrennte Qualitäts-/Fehlernacharbeit. Eigenständiges Recht-/Policy-Release-Gate [#112](https://github.com/matthias-ennen/movie-hub/issues/112) bleibt.

**Einziger verlässlicher Wieder-Einstieg:** [Adapter- und Nachtlauf-Handover 28.10.2026](ADAPTER_NIGHTLY_HANDOFF_2026-10-28.md). Alter Forschungsinhalt darunter wird nicht gelöscht, aber darf nicht erneut als „noch kein produktiver YouTube-Adapter“ missverstanden werden.


## G1-Live-Ergebnis 21.10.2026 – Top-3-QA der 34 Problemfälle

**Echter GitHub-Actions-Lauf [#39636101093](https://github.com/matthias-ennen/movie-hub/actions/runs/39636101093) SUCCESS; [Original-Artefakt #12362130138](https://github.com/matthias-ennen/movie-hub/actions/runs/39636101093/artifacts/12362130138) heruntergeladen und vollständig ausgewertet.** Die QA untersuchte **34** bereits bestehende YouTube-Video-IDs (zuerst alle 13 Neben-Kategorie-Fälle, danach 21 priorisierte Kategorie-30-Fälle) gegen maximal drei **bereits gefundene** TMDB-Film-IDs je Video: **77** lesende Film-Detailabrufe, **0** weitere YouTube-/TMDB-Suchanfragen. Bei **10/34** Fällen ist der bisherige Ersttreffer nicht mehr der höchstbewertete Kandidat.

**Diagnosen (nicht produktive Filmwerke):** **21** deutlich führende Filmhypothesen, **4** ähnlich plausible Mehrfachwerke, **4** ungelöste Laufzeit-/Fassungsabweichungen, **3** ohne passenden alten TMDB-Filmhinweis, **2** Inhaltsrisiken (Gaming/Staffel/Lernen). `War Story` (2014, TMDB 246013, Δ0,7 Min.), `Man Bites Dog` ↔ `Mann beißt Hund` (TMDB 10086, Δ3 Min.) und `2010` ↔ `2010: The Year We Make Contact` (TMDB 4437, Δ0,2 Min.) werden im Top-3-Scorer besser rangiert. Making-ofs/Sequel-Kollisionen sind nun deutlich schwächer. **Nichts davon beweist die reale YouTube-Filmfassung oder ein DE-Angebot.**

**Offen:** Vier ähnliche Werkgruppen, vier deutliche Laufzeit-/Fassungsprobleme, die zwei Inhaltsrisiken und die drei ungelösten Dokumentations-/Filmhinweise; außerdem **66** des ursprünglichen 100-Video-Samples wurden in dieser zusätzlichen QA noch nicht neu bewertet. **Keine** automatische `(movie,tmdbId)`-Übernahme, kein YouTube-Badge, keine bestätigte Gratis-/Ads-/Leih-/Kauf-/Abofreigabe. Vor G2 weiter die [YouTube API Developer Policies III.E.2](https://developers.google.com/youtube/terms/developer-policies) zur Datenaggregation über mehrere Content-Owner klären. [Detaillierter Originalbefund und Fortsetzung](_work/YOUTUBE_MOVIES_G1_TOP3_MATCHER_QA_LIVE_2026-10-21.md). **G1 #388 offen.**

---

## G1-Liveergebnis 21.10.2026 – 100 originale Video-IDs mit TMDB geprüft (G1 weiterhin offen)

**Echter manueller [100er-TMDB-Review-Lauf #39628463786](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786) erfolgreich, [Originalreport #12358536690](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786/artifacts/12358536690) heruntergeladen, vollständig gelesen.** Exakte ursprüngliche 100 YouTube-VIDEO-IDs der 31-Kategorien-Forschung anhand SHA-256 geprüft; **13** Neben-Kategorien zuerst, danach **87** Kategorie-30; **287** lesende TMDB-GETs, keine API-Quota-Unterbrechung und **kein** weiterer YouTube-API-Call. **40** `single-movie-hypothesis-review`, **43** `multiple-works-or-film-TV-review`, **13** `unmatched-or-alias-review`, **2** `movie-hypothesis-runtime-conflict`, **2** `content-type-risk-review`. **0** fachlich bestätigte Werk-/Video-Fassung, **0** Angebote/Anbieterbadges/Produktivdaten aktualisiert.

**Wesentliche neue Qualitätserkenntnis:** Die bisherigen Statuszahlen messen die **unscharfe TMDB-Suchheuristik**, nicht reale Werkidentität. Bei `War Story` wurde für den zuerst gelisteten **falschen gleichnamigen Film** eine Differenz von 83,3 min ausgewiesen, obwohl zuvor TMDB `246013` mit 0,7 min nahe lag; bei `Man Bites Dog` wird das sichtbare deutsche Filmwerk `Mann beißt Hund` (TMDB `10086`) fälschlich nicht bevorzugt; `2010: The Year We Make Contact` wird gegenüber dem TMDB-Titel `2010` als unmatched behandelt. Making-of/Sequel/gleiche Titeljahre erzeugen weitere falsche Mehrdeutigkeitsalarme. **Nächstes G1-Gate ist deshalb zuerst bessere Alias-/Jahr-/Mehrkandidaten-Laufzeitdiagnose mit konservativen Review-Status**, nicht ein automatischer Import aus den 40 Single-Film-Hypothesen oder eine erneute breite YouTube-Kategorien-Suche.

**Dauerhafter Ergebnisbericht:** [G1 Original 100 – TMDB Live-Report und Matcher-QA](_work/YOUTUBE_MOVIES_G1_100_TMDB_LIVE_RESULT_2026-10-21.md). Die 100 YouTube-VIDEO-IDs sind weiterhin **keine** 100 bestätigten Filme oder DE-Verfügbarkeiten. Produktiver G2-Adapter bleibt bis echter Werk-/Fassungsprüfung und konkreter [YouTube API Developer Policies E.2](https://developers.google.com/youtube/terms/developer-policies)-Compliance-Klärung **No-Go**.

---

## G1-Liveergebnis 21.10.2026 – 31 YouTube-Kategorien und 100 Filmvideo-Kandidaten

**Echter manueller API-Test [#39618878080](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080) SUCCESS, [Originalartefakt #12353497700](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080/artifacts/12353497700) vollständig heruntergeladen und geprüft.** Ergebnis: **100/100** unterschiedliche öffentlich aufgelöste plausible Film-**VIDEO-IDs** einschließlich **45** erneut verifizierter früherer IDs und **55** neu beobachteter. **31/31** der offiziell für Deutschland gemeldeten Kategorien mit Basissuche untersucht, **988** unterschiedliche rohe Suchtreffer und **1.030** Detailvideo-Metadatensätze geprüft. **54** `search.list`-GETs, **21** `videos.list`-Batch-GETs und **2** Kategorie-GETs, dann Quotenbegrenzung beim teilweisen zweiten Film-Kategorien-Pass.

**Schlüsselbefund:** **87** der 100 Videokandidaten (`45` bekannt + `42` neu) kommen aus der Haupt-Filmkategorie **30**; die anderen **13** stammen aus Nebenbereichen und sind besonders auf Gameplay, Sprachlern-Staffeln und anderes Nichtfilm-/Episodenmaterial zu prüfen. Die filmbezogenen Unterkategorien **31–42** lieferten in dieser `q=ganzer film`-Basissuche **0**, die Serienkategorie **43** zwar **50** Basistreffer, aber keinen separaten bestätigten Filmnachweis. **88** der gewählten IDs mit DE-Allow-Metadatensignal, **12** unbekannt. **100 Video-IDs ≠ 100 unterschiedliche oder eindeutig identifizierte Filmwerke** und ≠ 100 lizenzierte DE-Angebote. **0** automatische TMDB-/MovieHub-Zuordnungen.

**Nächster G1-Gate:** Die jetzt vorhandenen **100** Kandidaten gezielt nach Film-vs.-Serie/Nichtfilm, TMDB-Werkidentität, Jahr, Titelalias und Fassung bewerten; zunächst die **13 Neben-Kategorie-Risiken**. Kategorie **30** nach gemessener Ergiebigkeit als erste Discovery-Quelle priorisieren. Keine weitere ungerichtete Quota-Suche und kein G2-Go ohne konkrete YouTube-API-Compliance-Abklärung zur Owner-übergreifenden Datenaggregation. Vollständiges Kategorien- und Test-Ergebnis: [G1 100-Kandidaten Livebericht](_work/YOUTUBE_MOVIES_G1_ALL_CATEGORIES_100_LIVE_2026-10-21.md).

---

## G1-Livebefund 21.10.2026 – fünf Filmfassungen ohne unabhängige YouTube-ID-Bestätigung; produktive Aggregation bleibt No-Go

**Echter Original-Runs-Nachweis:** [YouTube Five Work/Version Evidence #39613093627](https://github.com/matthias-ennen/movie-hub/actions/runs/39613093627) **SUCCESS**; reales [Forschungsartefakt #12351731463](https://github.com/matthias-ennen/movie-hub/actions/runs/39613093627/artifacts/12351731463) vom **2026-10-21T14:01:26Z** als ZIP heruntergeladen und gelesen. Genau **1** YouTube-`videos.list`-Batch für die fünf bekannten Originalvideo-IDs und **5** TMDB-Detailabrufe mit Film-Credits/Originaltiteln/externer IMDb-ID. **5/5 Fälle** ergaben `review-title-runtime-only`, **0/5** ausdrückliche unabhängige Year-/Director-/IMDb-Beschreibungsbelege aus YouTube-Metadaten. Titel/Jahr/Regie/Laufzeit sind intern konsistent; die exakte YouTube-Filmfassung bleibt **unbestätigt**. Keine Produktivimporte, DE-Rechte, Shopangebote oder Anbieterbadges freigegeben.

**Architekturentscheidung / Forschungseffizienz:** Gleichartige reine Titel-/Laufzeit-GETs bringen ohne neue qualifizierende Quelle keinen entscheidenden Zugewinn mehr. Die **YouTube-first + TMDB-first**-Discovery bleibt als G1-Konzept bestehen, aber das automatische `videoId → (movie, tmdbId)`-Mapping und die daraus resultierende angebliche DE-Verfügbarkeit werden **nicht** produktiv freigegeben.

**Konkretes G2-Compliance-Stoppschild:** Die offiziellen [YouTube Developer Policies III.E.2](https://developers.google.com/youtube/terms/developer-policies) beschränken API-Data-Aggregation verschiedener Content-Owner deutlich; der [offizielle Compliance Guide](https://developers.google.com/youtube/terms/developer-policies-guide) nennt andererseits klar als YouTube gekennzeichnete, unabhängige Plattform-Suchergebnisse als Beispiel für unabhängigen Mehrwert. Diese Aussagen machen die konkrete von MovieHub geplante Zusammenführung von YouTube-`videoId`/TMDB-Daten zu **einem öffentlichen Anbieterbadge und vereinigten Filmbestand** **nicht automatisch zulässig**. Keine Policy-Schlussfolgerung per Implementierung voraussetzen, kein Scraping als Umgehung. Vor G2 fachliche Klärung/ggf. API Compliance Audit erforderlich. RegionRestrictions/Embeddable belegen keine `free/ads/flat/rent/buy`-Tarifart.

**Dokumentierte Fortsetzung:** [G1 Five Work Live Evidence und No-Go-Gate](_work/YOUTUBE_MOVIES_G1_FIVE_WORK_LIVE_POLICY_GATE_2026-10-21.md); [vorbereiteter, ausdrücklich nicht abgesendeter Compliance-Anfrageentwurf](_work/YOUTUBE_MOVIES_G1_YOUTUBE_API_COMPLIANCE_REQUEST_DRAFT_2026-10-21.md). Nächste fachliche Schritte: begrenzter manueller DE-App-Wiedergabetest und unabhängige Filmfassungsbelege, konkrete Rechte-/API-Datenflussklärung, gesonderte G2-Freigabe nach dokumentierten Positivnachweisen. **G1 #388 offen.**

---

## G1-Liveergebnis 21.10.2026 – 21 TMDB-Klärungen und öffentlicher MovieHub-Indexabgleich mit 26 Filmhinweisen

**Beide tatsächlichen manuellen Forschungsläufe abgeschlossen und Originalartefakte eingesehen:** [21 TMDB-Aliase #39609488229](https://github.com/matthias-ennen/movie-hub/actions/runs/39609488229) **SUCCESS** ([Originalartefakt #12349258409](https://github.com/matthias-ennen/movie-hub/actions/runs/39609488229/artifacts/12349258409)), **103** lesende TMDB-GETs, **0** weitere YouTube-API-Requests; die **21** unklaren Originalfälle ergaben **5 Single-Film-Hypothesen**, **10 mehrdeutige Film-/TV-Hypothesen**, **2 TV-Titel-Hypothesen**, **2 ungeklärte Werke** und **2 Nichtfilm-Risiken**. Alle nur `review`; weder 5 noch 21 geprüfte Filmversionen.

**Öffentlicher Bestandsvergleich tatsächlich ausgeführt:** [26 öffentliche TMDB-ID-Hinweise #39609504832](https://github.com/matthias-ennen/movie-hub/actions/runs/39609504832) **SUCCESS** ([Originalartefakt #12349283359](https://github.com/matthias-ennen/movie-hub/actions/runs/39609504832/artifacts/12349283359)). Der **tatsächlich veröffentlichte öffentliche** `search-index.json` vom **2026-10-21T01:54:14.490Z** enthielt **20.671** Titel: **13 der 26** zuvor vorgeschlagenen TMDB-Movie-IDs enthalten, **13 von 26** nicht darin enthalten. Der öffentliche `catalog.json`-Vergleich wurde **nicht** gültig abgeschlossen (`unavailable-or-invalid`), daher zu `Browse` **unbekannt** statt 0. **Das sind KEINE 13 bestätigten neuen MovieHub-Filme:** Identitäts-/Fassungsprüfung fehlt, persönlich/kontogebundene Katalogteile sind nicht im öffentlichen Suchindex enthalten.

**Nächster G1-Gate:** fünf besonders starke Filmhypothesen auf Identität/Fassung prüfen, 10 Ambiguitäten gezielt auflösen und fehlende Aliasfälle weiter vorsichtig kennzeichnen. Separat den Fehler des öffentlichen Browse-Katalog-GET diagnostizieren; falls nicht prüfbar, `unknown` beibehalten. YouTube API Developer Policies **III.E.2** (kanal-/rechteinhaberübergreifende API-Datenaggregation) als echtes **Compliance-Blockergate** vor jeglicher G2-Veröffentlichung behandeln, nicht von einer automatisch erlaubten Multi-Provider-Darstellung ausgehen. Kein G2-Go und keine produktiven Anbieterbadges oder Titelimporte.

**Dauerhafte Originalbefund-/Übergabedokumentation:** [G1 – 21 Alias-/26 Index-Liveergebnisse](_work/YOUTUBE_MOVIES_G1_21_26_LIVE_RESULTS_2026-10-21.md).

---

## G1-Fortsetzung 21.10.2026 – gezielte Film-/Serien-/Aliasprüfung der 21 unklaren YouTube-Video-IDs

**Aktueller Forschungsstand vor dieser Änderung:** Der vorherige echte 47-Video-Audit [#39602961148](https://github.com/matthias-ennen/movie-hub/actions/runs/39602961148) hat **47/47** YouTube Movies Video-IDs geprüft und **25 plausible + 1 titelgenauen, aber laufzeit-ungeklärten TMDB-Filmhinweis** gefunden, daneben **10 mehrdeutige, 2 TV-Titel- und 9 nicht exakt gematchte Fälle**. **0** verifizierte/aufgenommene Filmwerke. Die vorherige Überlegung, weitere rating-Suchergebnisseiten ungefiltert abzurufen, wird zunächst zugunsten der fachlichen Qualitätsprüfung dieser 21 ungelösten Fälle zurückgestellt. Die jüngste, verbindliche Zwei-Wege-Architektur **YouTube-first unabhängig von TMDB-Providerbestand PLUS TMDB-first** bleibt voll gültig.

**G1-Arbeit umgesetzt:** [PR #498](https://github.com/matthias-ennen/movie-hub/pull/498) nach [CI #39606353075](https://github.com/matthias-ennen/movie-hub/actions/runs/39606353075) **SUCCESS mit 1.225 Anwendungstests** und [Android APK #39606352882](https://github.com/matthias-ennen/movie-hub/actions/runs/39606352882) **SUCCESS** auf `main` per `[skip ci]` Squash `451f6f3165cc51284a05507d3d3cc9871ae71387` übernommen. Ausschließlich fünf neue G1-Forschungsdateien: konservatives JSON-Manifest mit den **21 genauen 47er-Livebericht-Fällen**, Forschungsskript mit nur **offiziellen lesenden TMDB-Anfragen**, isolierte Mock-Tests, Vitest-Wrapper, nur manuell startbares Workflow-YAML. Kein Produktiv-, Firebase-/Firestore-, Android-/Fire-TV-, Anbieterbadge-, Nachtlauf- oder Katalogänderung.

**Manueller Forschungsworkflow [YouTube Movies G1 21 Unclear Titles TMDB Review](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-twenty-one-g1.yml):** `workflow_dispatch` auf `main`. Benutzt ausschließlich bereits belegte Titel, Video-IDs und Laufzeiten des realen 47er-Laufs, **keinen neuen YouTube-API-Call und keine Suche im YouTube-Index**. Für jeden der 21 Fälle bis zu zwei aus dem Originaltitel unmittelbar abgeleitete `TMDB /search/movie`-Queries (z. B. Entfernen von OmU/Fassungssuffix oder erklärendem deutschen Untertitel), eine separate `TMDB /search/tv`-Abfrage, Details/Laufzeit für maximal drei konkrete Filmtreffer. Hartes Cap **140 TMDB-GETs**; Teilfehler erscheinen als Ungewissheit, nicht als fehlender Film. Bis zu drei TMDB-Vorschläge plus Serienkollisionen im temporären 14-Tage-Bericht, **alle nur `review`**; weder sichere Film-/TV-Typbestätigung noch automatische Werks-ID. Konzertmitschnitt und Serienteil als explizite Negativkontrollen.

**Offener G1-Live-Schritt:** CI-/Mock-Ergebnisse beweisen keine neue TMDB-Zuordnung. Aktuell **kein echter 21er-TMDB-API-Lauf**; Nutzer muss den obigen Workflow einmal per `Run workflow → main → Run workflow` auslösen. Anschließend echtes 14-Tage-Artefakt `artifacts/youtube-movies-g1/21-identity-alias-review.md` lesen, mindestens Mehrdeutigkeiten/Fassungen manuell nachprüfen und neue vs. bekannte Filmwerke **erst mit einem realen, erreichbaren öffentlichen MovieHub-Suchindex** vergleichen. Im GitHub-Checkout enthält `public/catalog.json` nur ein **leeres Fallback**, `public/search-index.json` ist nicht vorhanden; beides ist kein Nachweis für fehlende produktive Titel. YouTube Multi-Owner-Aggregation nach Policies E.2 bleibt eigenständiger **G2-Blocker**.

**Status:** G1 #388 offen, 47 Video-IDs mit 26 **unbestätigten** Filmwerkhypothesen und 21 weiteren Prüfungen; 0 produktive Filme/Badges/Deep-Links/Verfügbarkeiten aus diesen Forschungen übernommen. Kein G2–G4-Go.

---
## G1-Livebefund 21.10.2026 – 47 Video-IDs erfolgreich einzeln geprüft, 26 reine TMDB-Filmhinweise

**Echter manuell gestarteter read-only Workflow:** [YouTube Movies G1 47 Video IDs – Identity Audit #39602961148](https://github.com/matthias-ennen/movie-hub/actions/runs/39602961148) **SUCCESS**; [Originalreport-Artefakt #12347785136](https://github.com/matthias-ennen/movie-hub/actions/runs/39602961148/artifacts/12347785136), `forty-seven-identity-review.md`, vollständig heruntergeladen und gelesen. **1 YouTube-`videos.list`-Call** für 47/47 aufgelöste öffentliche Video-IDs; bei allen meldet die API DE in der regionalen Freigabeliste. **73 TMDB-GETs**. Ergebnis: **25 `plausible-review`, 1 `title-exact-review`, 10 `ambiguous-work-or-media-type-review`, 2 `series-title-review`, 9 `unmatched-or-title-variant`**. 26 verschiedene vorgeschlagene TMDB-Film-IDs, **0 automatisch bestätigte Filmidentitäten**, **0** produktiv ergänzte MovieHub-Titel. Die 2 `series-title-review` sind **keine** bestätigten Serien; reine TMDB-Suchergebnis-Typkollisionen.

**Zentraler Befund:** Von den 47 beobachteten YouTube-Video-IDs brauchen **21** zunächst eine filmfachliche Werk-/Typ-/Aliasprüfung. Ein direkter Vergleich der 26 TMDB-Filmhinweise mit `public/search-index.json` ist bislang **nicht gelaufen**; folglich ist die Anzahl tatsächlich **neuer MovieHub-Titel unbekannt**. Auch die 47 erlaubten DE-Regionssignale belegen **keine** tatsächliche Wiedergabe, Verfügbarkeit oder Tarifart.

**G1-Fortsetzung:** Erst die **21 unklaren Fälle gezielt** abgleichen, dann kanonische TMDB-Werke read-only mit dem **tatsächlich aktuellen öffentlichen** MovieHub-Titelindex vergleichen. Vor jeder produktiven Aggregation kanal-/rechteinhaberübergreifender YouTube-Daten die aktuellen YouTube API Developer Policies, insbesondere E.2, und den konkret vorgesehenen Such-/Quellenanzeigefall ausdrücklich prüfen. Kein G2-Go, keine App-/Badge-/Katalog-/Cloud-Änderung.

**Dauerhafter detailgetreuer Ergebnisbericht:** [G1 – 47 IDs Live-Review](_work/YOUTUBE_MOVIES_G1_47_IDENTITY_LIVE_2026-10-21.md).

---

## G1-Architekturpräzisierung 21.10.2026 – YouTube-first UND TMDB-first, keine TMDB-Discovery-Sperre

**Auslöser / Freigabe:** Matthias hat ausdrücklich darauf hingewiesen, dass ein ausschließlich TMDB-basierter Suchpfad neue, nur direkt bei YouTube entdeckte Filme übersehen würde, und nach der erläuterten Zwei-Wege-Architektur mit „Okay weiter“ die Fortsetzung des G1-Arbeitspakets freigegeben. **Dies ist eine Discovery- und Forschungsentscheidung, keine G2-Freigabe zur Veröffentlichung.** Diese Präzisierung ersetzt ältere Formulierungen, die den nächsten G1-Schritt allein auf TMDB-DE-YouTube-Seeds begrenzen.

**Verbindliche Unterscheidung:** TMDB bleibt die kanonische **Werkidentität** `(mediaType, tmdbId)` und Grundlage für Metadaten; die **Entdeckung** neuer Kandidaten ist aber quelloffen. Ein YouTube-Treffer darf auch dann ein G1-Filmkandidat bleiben, wenn der Film bislang **nicht** im MovieHub-Titelbestand oder bei den TMDB-DE-YouTube-Watch-Providern auftaucht. Ein fehlender Provider-Eintrag ist keine Negativbestätigung. Eine eindeutige TMDB-Werkzuordnung ist weiterhin vor einer normalen produktiven Aufnahme erforderlich; unklare/neuartige Titel bleiben im Review statt stillschweigend zu verschwinden.

**Zwei unabhängige Eingangsspuren in dieselbe Normalisierung:**

1. **YouTube-first / neue Filmwerke entdecken:** Nur dokumentierte, zulässige YouTube-Data-API-Quellen (z. B. `search.list` mit `videoType=movie`, geprüfte öffentliche Publisher-Playlists) lesen → echte `videoId`, Quellnachweis, Laufzeit, Sichtbarkeit und DE-Regionssignal erfassen → Film/Konzert/Serie/Clip vorsichtig klassifizieren → TMDB per Titel/Alias/Jahr/Laufzeit als Kandidat suchen → gegen vorhandene MovieHub-Identitäten prüfen. Ein tatsächlich neuer Film kann damit als **neue TMDB-Identität** vorgemerkt werden. YouTube-Movies-Label und Langformat sind nur Screening, weder gesicherte Werkidentität noch Rechte-/Shop- oder Tarifbeweis.
2. **TMDB-first / bekannte Werke anreichern:** Eine kontrollierte Stichprobe bestehender MovieHub-/TMDB-Werke und zusätzlich providergebundener DE-Watch-Provider-Werke als Seeds wählen → gezielt nach **exakter** YouTube-Filmvideo-ID suchen → nur belastbare Treffer als mögliche weitere PlaybackRoute zu der vorhandenen Identität protokollieren. TMDB-Discover-Filter sind nicht gleich providergebundene `/movie/{id}/watch/providers`-Detailangebote; keine Angebotsart von einem anderen Anbieter übernehmen.

**Gemeinsamer, nichtproduktiver Befund:** `sourceId`, `sourceVideoId`, `sourceChannelId`, Erhebungszeit, DE-Signal, Content-Type-Prüfung, `candidateTmdbId`, Matching-Begründung, vorhandene MovieHub-Werkidentität (sofern getrennt und datenschutzkonform verifiziert), Match-Status (`plausible-review`, `ambiguous-review`, `unmatched`), Duplikat-/Fassungsbeziehung und Replay-Route strikt getrennt halten. Kandidaten ohne sichere Identität **nicht** zu veröffentlichten Katalogfilmen oder Anbieterbadges hochstufen. Ein bestätigter neuer TMDB-Film wäre in G2/G3 als dieselbe normale Filmidentität anzulegen, nicht als YouTube-eigener Paralleltitel.

**Messbares nächstes G1-Gate:** Zuerst die bereits beobachteten **47 verschiedenen YouTube-Movies-Video-IDs** (nicht 47 verifizierte Filmwerke) für Werk-/Typ-/Fassungs-/DE-Signal und Mehrfachbelegung konsolidieren. Anschließend zwei **getrennte, begrenzte** Samples vergleichen: Wie viele eindeutige Filmwerke entdeckt der YouTube-first-Pfad, die vorher nicht im untersuchten MovieHub-Sample lagen? Wie viele zusätzliche exakte Videorouten findet TMDB-first? Berichten: Roh-IDs, unterschiedliche geprüfte Filmwerke, bereits bekannte Werke, neue TMDB-Werke, unresolved/ambiguous, Fehlklassifikationen, API-Kosten sowie nachweisbare gegenüber unbekannter Deutschland-Verfügbarkeit. **Nicht** aus `47` oder einem TMDB-Suchtreffer eine bestätigte Zahl neuer MovieHub-Filme ableiten. Bestehende API-Werkzeuge und Forschungsartefakte soweit möglich wiederverwenden, keine weitere breite Suche ohne konkreten Nutzen.

**Externe Grenze:** Ein globaler, vollständiger offizieller YouTube-Movies-Storefront-Feed ist mit den bisherigen Quellen **nicht nachgewiesen**. Die YouTube API Developer Policies regeln unter anderem Kanal-/Rechteinhaber-übergreifende API-Datenaggregation, Quellenkennzeichnung, erlaubte Datennutzung und Scraping. **Vor jeder automatischen produktiven Zusammenführung von YouTube-Metadaten und öffentlicher Filmverfügbarkeitsanzeige** ist deshalb die Policy-/Rechteprüfung des genauen Anwendungsfalls nötig; ein erfolgreicher Forschungs-GET ist keine Produktfreigabe. Referenzen: https://developers.google.com/youtube/terms/developer-policies und https://developer.themoviedb.org/reference/discover-movie.

**Änderungsgrenze:** G1 nur Analyse/abgegrenzte read-only Research-Tests. Kein automatischer Live-Import, keine Firestore-/Firebase-, Anbieterbadge-, App-, Fire-TV-, Android- oder Nightly-Änderung; G2–G4 bleiben gesondert freigabepflichtig. Das Issue #388 bleibt offen.

---

## G1-Livebefund 21.10.2026 – Sortierung `rating` liefert 18/50 YouTube-Movies-Kandidaten

**Echter User-freigegebener Pilot jetzt ausgeführt:** [YouTube Movies G1 Three Search Sort Modes #39597247661](https://github.com/matthias-ennen/movie-hub/actions/runs/39597247661) **SUCCESS**; [GitHub-Research-Artefakt #12344466389](https://github.com/matthias-ennen/movie-hub/actions/runs/39597247661/artifacts/12344466389), Datei `three-sort-compare.md`, wurde tatsächlich heruntergeladen und komplett gelesen. Auf `main` ausgeführt, **keine Produktion geändert**.

**Messergebnis bei jeweils exakt 50 DE `videoType=movie`-Ergebnissen, zuerst 50 pro `order`, dann `videos.list`-Prüfung auf echten Kanalnamen `YouTube Movies`, öffentlich, ≥60 Minuten, DE nicht ausdrücklich ausgeschlossen:** `viewCount` **5/50**, `date` **1/50**, `rating` **18/50**. Über alle drei 150 Treffer **140** unterschiedliche rohe Videosuch-IDs, davon **24** verschiedene qualifizierte `YouTube Movies`-Videos. **0** Überschneidungen in den drei gefilterten G1-Listen. API: `search.list` **3**; `videos.list` **3**; TMDB **36** Requests.

**TMDB-Vorprüfung für diese 24 Kandidaten:** **12** `plausible-review` (exakter Titeltreffer + plausibler Laufzeitabgleich), **4** `ambiguous-review`, **8** `unmatched-or-title-variant`. Das liefert **keine** freigegebene Werkidentität/Offer-Kategorie. Bei den 24 `YouTube Movies`-Videos waren die in `statistics.viewCount` angeforderten **echten Abrufzahlen nicht lesbar (`?`)** – `order=viewCount` ist nur ein Search-Ranking, **keine eigene verlässliche MovieHub-Beliebtheitssortierung**. `rating`-Treffer beinhalten auch Konzertvideos und offenbar episodisches Material; Video-Dauer und Label alleine erfüllen **keinen** Film-Werk-Abgleich.

**Deduplizierung mit drei vorherigen realen G1-Läufen:** `12` YouTube-first Kandidaten + `2` wirklich neue Upload-Feed-IDs = **14**; aus den 24 sortierten Kandidaten sind **2** schon bekannt (`Police Story`, `Jagdgeschwader Wildkatze`), ergo **22** neu. Aus den zwölf manuell gesammelten Links sind **11** öffentliche `YouTube Movies`-Langform-ID-Kandidaten zusätzlich, keine IDs mit vorherigen 36 überschneidend; der eine **unlisted Suno-Music-Kurzclip** ist ausgeschlossen. Macht **47 unterschiedliche vorläufige YouTube-Movies-VIDEO_IDs** – **keine** 47 verifizierten Filme oder TMDB-Identitäten. Der 50-**Werk**-Gate wird **nicht** als erreicht gemeldet; derselbe Film kann mehrere Video-IDs besitzen und Nicht-Film-Fälle müssen ausgesondert werden.

**Folgerung:** Für **weitere kontrollierte Discovery-Stichproben** `rating` von den drei getesteten Varianten bevorzugen (18 statt 5/1), aber nicht als Endnutzer-MovieHub-Ranking. Als nächste **separat freizugebende** G1-Ausbaustufe **TMDB-DE-Watch-Provider-YouTube-Filmseeds → gezielte YouTube-Movie-IDs → konservatives Werk-/Fassungs-/DE-Rechte-Review** statt blind weiteres globales Scrapen, Sortieren oder Preis-/Abo-Deep-Dives. G1 #388 bleibt offen, G2–G4 nicht freigegeben.

**Detailbericht und alle 24 Roh-Video-IDs:** [G1-Dreiersortierungs-Livebericht](_work/YOUTUBE_MOVIES_G1_THREE_SORTS_LIVE_2026-10-21.md).

---
## G1 – Drei YouTube-Film-Sortierungen für Deutschland: read-only Vergleich implementiert

**Nutzerentscheidung 21.10.2026:** Der von uns vorgeschlagene Vergleich von **drei** YouTube-Data-API-Suchen für Deutschland – `order=viewCount`, `date`, `rating` – wurde ausdrücklich freigegeben („Okay so machen wir weiter“). Freigabe **nur für G1-Forschung**, kein G2-Produktivimport.

**Implementierung:** [Pull Request #494](https://github.com/matthias-ennen/movie-hub/pull/494) **merged** nach `main`, Squash-Commit `2014d16190e25884cb6155926877c816bd968208` `[skip ci]`. Ausschließlich vier zusätzliche isolierte Dateien: `scripts/youtube-movies-three-sorts-g1.mjs`, `.check.mjs`, `tests/youtube-movies-three-sorts-g1.test.js`, `.github/workflows/youtube-movies-three-sorts-g1.yml`. Keine Änderung an App-, Android-, TV-, Firebase-/Firestore-, Badge-, Anbieter- oder Scheduler-Code. [CI #39596491195](https://github.com/matthias-ennen/movie-hub/actions/runs/39596491195) **SUCCESS**, **1223 Anwendungstests** (neuer Mock-Test inklusive); [Android #39596491288](https://github.com/matthias-ennen/movie-hub/actions/runs/39596491288) **SUCCESS**.

**Exakte API-Abfrage für beide DE-Filter und jede Sortierung identisch:** `search.list(part=snippet,type=video,videoType=movie,regionCode=DE,maxResults=50,order=...)`, **ohne `q` und ohne `channelId`**. Zunächst exakt **drei** Suche-Calls, keine Pagination oder verdeckten Ausweichstrategien. Anschließend bis zu **150** deduplizierte Such-Video-IDs in höchstens drei `videos.list(part=snippet,contentDetails,status,statistics)`-Calls. Kanalname muss echter `YouTube Movies`-Anzeigename sein, öffentliche Vollfilmlänge ≥60 Minuten, DE darf nicht ausdrücklich gesperrt sein. Im G1-Bericht erscheinen pro Sortierung die tatsächlichen Treffer, tatsächlichen YouTube-Movies-Label-Treffer, qualifizierte Filmkandidaten, andere Kanäle, Views, IDs, Ränge, Überschneidungen und API-Fehler (beispielsweise eine einzelne `rating`-Ablehnung).

**Vorsichtige TMDB-Anreicherung:** maximal **35** deduplizierte Kandidaten für eine begrenzte TMDB-DE-`search/movie`-Titelprüfung mit optionalem `/movie/{id}`-Laufzeitabgleich; maximal 80 TMDB-Anfragen. Genaue Titel- und Laufzeitähnlichkeit ist nur **`review`**, niemals ein verbindlicher TMDB-Match oder ein Angebotsnachweis. Von YouTube berechnete Sortierung `rating` ist interner Score, `viewCount` sind Videoviews, **keine Leih-/Kaufzahlen**. Suchindex und Sortierung können weniger als 50 liefern; selbst 50 gefundene Treffer sind **nicht** der komplette deutsche YouTube-Filmshop.

**Echter API-Lauf NOCH AUSSTEHEND:** Kein tatsächlicher Live-Dreiersortierbericht liegt vor. Der getrennte Forschungsworkflow [YouTube Movies G1 Three Search Sort Modes (Read-only)](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-three-sorts-g1.yml) muss **einmal manuell auf `main`** per `Run workflow` gestartet werden. Erst danach das temporäre (14 Tage) GitHub-Artefakt `three-sort-compare.md` herunterladen, reale Zahlen und Unterschiede analysieren, Issue #388 mit einem Live-Beleg ergänzen und entscheiden, ob die Sortierungen für den 50er-Pool taugen oder TMDB-DE-seedbasierte gezielte Filmabfragen erforderlich werden.

**Status:** Code und Tests abgeschlossen; tatsächliche YouTube-Suche und TMDB-Prüfung stehen ausdrücklich noch aus. G1 #388 offen, G2–G4 nicht freigegeben.

---
## G1-Livebefund 21.10.2026 – zwölf Nutzerfilmlinks aufgelöst, kein gemeinsamer öffentlicher Playlist-Katalog

**Neuer echter G1-API-Lauf** [YouTube Movies G1 User Twelve Links #39593679849](https://github.com/matthias-ennen/movie-hub/actions/runs/39593679849) wurde manuell auf `main` ausgeführt, GitHub Actions meldet **SUCCESS**. Das [Originalartefakt #12343545125](https://github.com/matthias-ennen/movie-hub/actions/runs/39593679849/artifacts/12343545125) ist tatsächlich heruntergeladen und vollständig ausgewertet. **12/12** vom Nutzer gelieferte Video-IDs via einem einzigen `videos.list` aufgelöst; 37 lesende YouTube-API-Requests insgesamt (`videos 1`, `channels 1`, `playlists 12`, `playlistItems 23`).

**Entscheidender neuer Befund:** Elf IDs sind öffentlich gelistete Vollfilmlaufzeit-Videos mit Kanalnamen `YouTube Movies` und `DE`-Freigabelisten-Signal; **jedes dieser elf Videos hat eine ANDERE echte `snippet.channelId`**. Die zwölfte Nutzer-ID ist **ein fremdes, nicht gelistetes Suno-Music-Kurzvideo von ~52 Sekunden**, kein Film – deshalb streng aus der Filme-Stichprobe ausschließen. Ursprünglicher nicht gelisteter Link/ID wird in neuen veröffentlichten Evidenzdokumenten bewusst nicht erneut abgedruckt. Die normale Kanalanzeige `YouTube Movies` ist **kein eindeutiger technischer Publisher-/Katalogschlüssel**.

**Öffentliche Playlist-Analyse:** In zwölf Kanälen wurden 56 öffentliche Playlists auf jeweils der ersten `playlists.list`-Seite gelistet, davon wegen der absichtlichen Begrenzung auf bis zu fünf kuratierte Playlists je Kanal und getrennte Uploads **23 Listen** untersucht (`playlistItems.list`, jeweils nur deren erste bis zu 50 Einträge). Dabei wurde in genau **fünf** Nutzer-Videos eine Mitgliedschaft beobachtet: **ein Film** (Robert The Bruce) in einer echten benannten `Movies`-Playlist mit **nur einem Eintrag** und zugleich in seiner Uploads-Liste; **vier** weitere Filme lediglich in ihren jeweiligen automatisch generierten Uploads-Listen. **Kein gemeinsamer öffentlicher Playlist-Katalog für die elf YouTube-Movies-Filme im untersuchten Sample nachgewiesen.** Fehlende Membership auf der ersten geprüften Seite beweist keine weltweite Nichtmitgliedschaft.

**Architekturrelevante Schlussfolgerung:** YouTube Movies präsentiert beim dokumentierten G1-Beispiel ein gemeinsames Anbieter-**Label**, jedoch viele **titelgetrennte Kanal-IDs**. Channel-Upload-Playlists oder `playlists.list?channelId=` sind damit **kein belegter globaler Film-Shop-Feed**. Konkrete YouTube-Film-Video-IDs als per-Werk-Anreicherung speichern, kanonischer Identitätsanker **TMDB MediaType + TMDB-ID**. Weiterhin keine automatischen Anbieterbadges ohne echte TMDB-DE-Providerdetails, keine Werkszuordnung nur aus Titel-/Kanalnamengleichheit.

**Nächster G1-Schritt:** Für eine skalierbarere 50-Film-Titelauswahl einen **TMDB-DE-YouTube-Provider-Film-Seed → gezielte YouTube-`videoType=movie`-Suche → `videos.list`-Detail → konservatives TMDB-/Laufzeit-/Version-Matching**-Versuch spezifizieren. Die elf usergelieferten YouTube-Film-IDs und bisherigen 12+2 G1-Kandidaten **nicht blind addieren**: zuerst Werkidentität, Duplikate, DE-Zugang und tatsächliches Playback sauber gegenprüfen. Kein neues G2-Go; der neue Zwölf-Links-Forschungslauf ändert weder MovieHub-Katalog noch Firebase/Firestore, Badges, Live-Adapter oder Android.

**Originalmessungen und elf öffentlich identifizierte Filmtitel:** [G1 Livebeleg – zwölf Nutzerlinks](_work/YOUTUBE_MOVIES_G1_USER_12_LIVE_EVIDENCE_2026-10-21.md). Issue #388 bleibt als Forschungspaket offen.

---
## G1 – zwölf reale vom Nutzer bereitgestellte YouTube-Filmlinks: Playlist-Prüfworkflow freigegeben

**Neue Nutzerfreigabe 21.10.2026:** Nach der reinen Link-Sammlung (12 verschiedene vom Nutzer per `youtu.be` gelieferte IDs) ausdrücklich freigegeben: kleiner **ausschließlich lesender** API-Forschungsworkflow, keine Produktion-/Katalogänderung. [PR #493](https://github.com/matthias-ennen/movie-hub/pull/493) wurde nach grüner [CI #39593003951](https://github.com/matthias-ennen/movie-hub/actions/runs/39593003951) (**191 Testdateien, 1222 Anwendungstests**; neue isolierte API-Mocks bestanden) und [Android APK #39593003972](https://github.com/matthias-ennen/movie-hub/actions/runs/39593003972) **SUCCESS** via `[skip ci]`-Squash-Merge `182e00edbe2e153b045a96a4387eb464256d317e` nach `main` übernommen. Nur vier neue G1-Research-Dateien; keine Runtime-, Anbieter-, Badge-, Firebase-/Firestore- oder Android-Änderung.

**Exakt untersuchte Nutzervideos (Originalreihenfolge):** `q9Gba51rkHw`, `2SwHXYoQQeQ`, `rzIyI-OME3M`, `PZC6NS-IFCk`, `KVgUc8b5gvs`, `tGPvABsHlu4`, `Etlfq9KD78Q`, `DxRslNY7hDw`, `EBiseL2xAz8`, `Ln4NNpDD5q8`, `rSn7jQolX_c`, `h4Tv29mk4LE`. Die zugelieferten URLs enthielten `is=...`, **keine** `list=`-Playlist-ID; doppelt zugesandter vierter Link wurde nur einmal gezählt.

**Manueller neuer [YouTube Movies G1 User Twelve Links (Read-only)](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-user-twelve-g1.yml)-Workflow:** Skript `scripts/youtube-movies-user-twelve-g1.mjs` ruft die zwölf IDs zusammen in einer `videos.list`-Abfrage ab; erfasst wirkliche `channelId`-Kanal-/Längen-/DE-Metadaten, fragt via `channels.list` Kanal-Metadaten ab und prüft nur über offizielle `playlists.list` und `playlistItems.list` die ersten **fünf öffentlich gelisteten Playlists** pro gefundenem Kanal sowie separat die systemgenerierte Uploads-Liste auf **tatsächliches Vorkommen** der bekannten Video-IDs. Nur die **erste 50-Item-Seite** pro Playlist wird gelesen. Höchstens zwölf Kanäle, **maximal 90** lesende YouTube-API-Anfragen, **keine** kostenintensive `search.list`, kein Scraping, keine undocumented Endpoints.

**Grenzen:** `videos.list` erlaubt keine globale Playlist-Reverse-Suche. Playlistnamen dürfen nur aus realen API-Playlists stammen; die automatisch erzeugte Uploads-Liste ist **keine** kuratierte YouTube-Filmsammlung. Eine aus den geprüften ersten Seiten *nicht* sichtbare Zugehörigkeit beweist nicht, dass ein Video in keiner Playlist vorkommt. `YouTube Movies` als Kanalname, `regionRestriction` und Video-Existenz beweisen weder Rechte, Preis, Abonnement, tatsächliche DE-Wiedergabe noch sicheren TMDB-Match. TMDB bleibt kanonische Filmidentität; Adapter reichern nur belegte Werte an.

**Offener echter API-Schritt:** Zum Dokumentationszeitpunkt hat der Workflow **noch keinen neuen Live-YouTube-Bericht für diese zwölf Links** erzeugt. Das CI-Testgrün ist keine bestätigte YouTube-Videotitelliste. Workflow auf GitHub **manuell auf `main` starten**, dann Artifact `user-twelve-playlists.md` herunterladen/auswerten und in Issue #388 die wirklichen Titel, Kanäle, Playlistnamen und nachgewiesene Film-Memberships dokumentieren. **G1 bleibt offen, G2–G4 nicht freigegeben.**

---
## Verbindliche Architekturentscheidung 21.10.2026 – TMDB-Basis und nachgelagerte Adapter

**Nutzerentscheidung nach erfolgreichem Android-/Fire-TV-Linktest und dem realen TMDB-DE-Angebotsvergleich:** „TMDB als Grundlage. Die nachgelagerten Adapter reichern Metadaten an und oder verbessern und oder ergänzen diese.“ Die zusätzliche Recherche einzelner YouTube-Mitgliedschaften, Kanalabos, Preisstaffelungen und des sekundären `Als Mitglied ansehen`-Dialogs geht über den gewünschten Umfang hinaus und ist **kein verpflichtender G1-Gate** mehr. Diese Präzisierung ersetzt insofern frühere Aufforderungen zu weiteren Tarif-Screenshots; historische Testergebnisse bleiben als Forschung dokumentiert.

**Verbindlicher Datenweg:**
1. **TMDB ist das kanonische Werk- und Titelsystem:** TMDB-MediaType/ID als stabiler Join-Schlüssel, zentrale Titeldaten und **providergebundene** deutsche `movie/{id}/watch/providers`- beziehungsweise TV-Detailangebote als fachlicher Ausgangspunkt. TMDB-Discover liefert nur Kandidaten, niemals ungeprüft gepaarte Tarifangebote.
2. **Nachgelagerte Anbieter-/Quellenadapter** (Waipu, Joyn, YouTube, Publisher und weitere) ergänzen **ihre nachweisbar eigene Sachinformation**: z. B. EPG-Sendezeiten und Sender, reale Video-IDs und geprüfte Deep-Links, spezifische Metadaten, Verfügbarkeitssignale oder verlässlichere Korrekturen. Der Adapter darf seine fachliche Zuständigkeit nicht auf andere Anbieter übertragen.
3. **Zentrale Zusammenführung mit Herkunft, Aktualität und Konfliktregeln:** Daten werden pro Werk und Datenfeld konsolidiert, nicht per blindem Last-Write-Wins überschrieben. EPG-Adapter dürfen für reale TV-Sendezeiten autoritativer sein als TMDB; ein YouTube-Video-Link ist gegenüber einer generischen TMDB-Anbieterübersichtsseite die präzisere **Route**, aber keine automatische Aussage über Tarif-/Shop-Entitlements. Bei nicht belegtem Wert `unknown`, nicht spekulieren.
4. **Ein gemeinsamer MovieHub-Ausgabestand** erzeugt die Anbieter-/Angebotsbadges, einheitliche Poster/Detailseiten, Reihen und PlaybackRoutes. Dieselbe normalisierte Anbieterreihenfolge und derselbe `offerTypes`-Stand müssen allen Ansichten zugrunde liegen. `offerTypes:['catalog']` aus Discover-Kandidaten bedeutet **keine** bestätigte Leihe, kostenlose Verfügbarkeit oder Mitgliedschaft.

**Speziell für YouTube Movies:** Bestehende `https://www.youtube.com/watch?v=<echte ID>`-Links, die vom Nutzer auf Android und Fire TV positiv geprüft wurden, als mögliche exakt zielende Routen behandeln. Angebotsarten aus dem **exakt passenden TMDB-DE-Providerdetail** ableiten (`rent`, `buy`, `free`, `ads`, `flatrate`), mit klarer Provider-Identität und Datenherkunft. `YouTube`, `YouTube Free`, `YouTube Premium` und andere tatsächliche TMDB-IDs bleiben getrennt; niemals eine Video-ID oder einen sichtbaren allgemeinen Mitgliedschaftsbutton automatisch zu `flat`, `free` oder YouTube Premium umdeuten. **Keine Pflicht zu einer manuellen Bestätigung jeder einzelnen YouTube-Shop-Tarifvariante**. Individuelle Preise, Primetime-Kanal-Mitgliedschaftsmatrix, Shop-Entitlements und das Aufklären des UI-Jahres 1977 bei Der Pate sind für G1 nicht erforderlich.

**G1-Fokus ab jetzt:** belastbare, rechtmäßig abrufbare Film-ID/Link-Quelle; robuste Matching-/Region-/Lösch- und Verfügbarkeitsregeln; source-aware Merge-/Badge-Qualitätsprüfung mit repräsentativen Fällen; dokumentierte G1-Go-/No-Go-Abnahme vor G2. **Kein produktiver Adapter, Firestore-Katalog-Write, Badge-Umbau oder Deployment ohne separate Freigabe.** Issue #388 bleibt offen; die abgesagte tiefe YouTube-Shop-Tarifprüfung blockiert G1 nicht mehr.

---
## G1-Fortsetzung 21.10.2026 – Public-Uploads-Forschungsprobe technisch abgeschlossen

**Gezielter Quellen-Zugangs-Gate implementiert:** [PR #492](https://github.com/matthias-ennen/movie-hub/pull/492) nach erfolgreicher [CI #39585428175](https://github.com/matthias-ennen/movie-hub/actions/runs/39585428175) und [Android APK #39585428062](https://github.com/matthias-ennen/movie-hub/actions/runs/39585428062) kontrolliert mit `[skip ci]` nach main übernommen (Commit `39badc8cf4d7c45489c6aee3a5de14278f3c74f2`). Vier isolierte G1-Forschungsdateien nachgelesen; keine produktive App-/Datenänderung.

**Manueller neuer Workflow:** [YouTube Movies G1 Public Upload Feeds (Read-only)](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-channel-uploads-g1.yml), ausschließlich `workflow_dispatch` auf `main`. Das Skript `scripts/youtube-movies-channel-uploads-g1.mjs` beginnt bei den zwölf echten Filmlinks aus dem vorigen Livebericht; liest per YouTube `videos.list` die Kanal-IDs, prüft per `channels.list` die öffentliche `relatedPlaylists.uploads`-Information und gegebenenfalls bis zu 6 Kanäle × maximal 2 Seiten `playlistItems.list`, insgesamt höchstens 300 weitere eindeutige Upload-Video-IDs. Erneute gebündelte Video-Details für Länge, Region, privat/öffentlich, Titeldeduplizierung. **Harter Höchstwert 22 offizielle YouTube-API-Requests, keine neuen `search.list`-Abfragen**, keine nichtdokumentierten YouTube-APIs. Mocktests decken zugängliche und nicht zugängliche Upload-Feeds ab.

**Interpretationsgrenze:** Kanal-Titel `YouTube Movies`, gemeinsame Channel-ID, Uploads-Playlist, Videos mit 60+ Minuten und positiver DE-Region belegen zusammen **keine** Film-Shop-Lizenz, tatsächliche Verfügbarkeit, Preise oder sicheren TMDB-Match. Ein leerer/nicht zugänglicher Upload-Feed darf nicht zu „YouTube hat keine Filme“ führen. **Ein echter Livebericht dieses neuen Workflows liegt noch nicht vor**; CI-Grün bedeutet ausschließlich getestete Werkzeugfunktion.

**Nächster Schritt:** manuellen Workflow auf `main` einmal ausführen und den tatsächlichen Reachability-/Titelbericht auswerten. Falls sich darüber kein hinreichender Katalogpfad erschließen lässt, vor weiterem 50er-Lauf gezielt TMDB-DE-YouTube-providerbestätigte Werk-/Titelkandidaten suchen und gegen genau passende YouTube-Movies-Filmvideo-IDs und Regionen prüfen. Ziel **50 verschiedene** bleibt aktiv; Ergebnis bisher **12 Kandidaten**, davon **0 produktiv freigegeben**. G1 offen, G2–G4 gesperrt.

---
## G1-Livebefund 21.10.2026 – 50 geplant, 12 gefunden; Quellenzugang verbessern

**Echter 50er-YouTube-API-Run liegt vor:** [#39584388602](https://github.com/matthias-ennen/movie-hub/actions/runs/39584388602), **SUCCESS**, [originales Reportartefakt #12337893476](https://github.com/matthias-ennen/movie-hub/actions/runs/39584388602/artifacts/12337893476) tatsächlich heruntergeladen und gelesen. **20 YouTube search.list + 7 videos.list**, 307 Video-IDs gefunden und auch im Metadaten-Detail aufgelöst. Aus diesen erreichte der konservative Kanaltitel-/≥60-Minuten-/DE-nicht-explizit-gesperrt-/Titel-Deduplikationsfilter **nur 12 statt der angestrebten 50 Titel**. 19 TMDB-GETs; 6 plausible `review`, 4 mehrdeutige, 1 ohne exakten Titelalias, 1 weitere nur exakte Titelreview. **Keine 50 bestätigten Filme und noch kein G2-Go.**

**Fachlicher Befund:** Die zwanzig breiten Genre-/Jahrzehnt-/Sprachsuchen liefern mit dem `videoType=movie`-Filter sehr viele andere/nicht zuordenbare Videos. Einfach dieselben breiten Suchen zu wiederholen oder die 200 Publisher-Videos zum YouTube-eigenen Shop hinzuzuzählen, wäre fachlich falsch. Stattdessen **die tatsächlichen Kanal-IDs hinter den zwölf zuvor gefundenen Film-IDs** auf zugängliche, offiziell dokumentierte `channels.list`-`relatedPlaylists.uploads`-Feeds und `playlistItems.list` prüfen; nur falls brauchbar, weitere Film-ID-Kandidaten nachschalten. Öffentliche Upload-Listen sind **kein** bestätigter YouTube-Shop-/Lizenz-/Angebotsfeed.

**Folgeprüfung in Vorbereitung:** [PR #492](https://github.com/matthias-ennen/movie-hub/pull/492), strikt read-only, maximal 22 YouTube-Data-API-Aufrufe, höchstens sechs beobachtete Kanal-IDs und je zwei Upload-Playlistseiten; bis 300 neue Video-IDs batched nachprüfen. CI/Android laufen zum Zeitpunkt dieser Notiz; deshalb weder Merge noch Live-Ergebnis behaupten. Falls der Upload-Feed unbrauchbar ist, als nächstes gezieltere **TMDB-DE-providerbasierte Filmseed-Liste → legitime YouTube-Titel-ID-Suche** mit konservativem Matching erforschen.

**Vollständige echte 12 Kandidaten und Messzahlen** im [G1-50-Titel-Evidenzbericht](_work/YOUTUBE_MOVIES_G1_TITLE_SELECTION_EXPANSION_2026-10-21.md). G1 offen; kein produktiver MovieHub-Katalog, kein Badge und kein Firebase-Deployment geändert.

---
## G1-Umsetzung 21.10.2026 – direkter 50-Titel-YouTube-first-Pilot auf main

**Nutzer hat die Stufung ausdrücklich auf 50 Filme in einem ersten Test umgestellt:** „Lass uns bitte direkt mit 50 Titel starten“. Deshalb **keine vorgeschaltete 15–20-Titel-Testphase** mehr. Die Erweiterung bezieht sich auf die **direkt aus YouTube Movies per YouTube Data API eingelesene Filmauswahl**, nicht auf den separaten alten Publisher-Playlist-200er-Pilot.

**Technisch auf main:** [PR #491](https://github.com/matthias-ennen/movie-hub/pull/491) wurde nach CI [#39583563200](https://github.com/matthias-ennen/movie-hub/actions/runs/39583563200) SUCCESS (**189 Testdateien / 1220 Tests**, darunter gemockter 50-Titel-Forschungsfall) und Android APK [#39583563164](https://github.com/matthias-ennen/movie-hub/actions/runs/39583563164) SUCCESS mit `9003a44768905f9e80e715a63f3f40e0d354d9d0` `[skip ci]` kontrolliert übernommen. Vier Forschungsdateien, kein Produktivcode. Der neue [YouTube Movies G1 Fifty Titles (Read-only)](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-fifty-g1.yml) lässt sich **manuell auf main** starten.

**Algorithmus:** 20 unterschiedlich ausgerichtete YouTube-first-Film-/Genre-/Zeitfenster-`search.list`-Anfragen (nicht 20 Titel), max. 20 zur Detailprüfung berücksichtigte Film-IDs je Anfrage, max. 8 gebündelte `videos.list`-Metadatenabfragen. Auswahl bis **50 unterschiedliche Titel** nach Laufzeit >=60 Min., schwachem YouTube-Movies-Kanaltitelsignal, ohne expliziten DE-Ausschluss und stabiler Video-/Titeldeduplizierung über ein Round-Robin der Suchstrata. Danach maximal 105 TMDB-GETs für zunächst **nur provisional** Film-Identität/Runtime-Hinweise. Harte YouTube-Quota-Höchstgrenze 2100 (theoretisch höchstens 2008). Die öffentliche Filmsuche bleibt ein **unvollständiges und fehleranfälliges Kandidatensignal**, kein bestätigter 50er-Angebotsfeed.

**Noch offen (nicht als erledigt darstellen):** Der neue echte Live-YouTube-Abruf der 50 Zielkandidaten muss manuell gestartet und sein temporäres 14-Tage-Artefakt gelesen werden. Mocks erreichen exakt 50, reale YouTube-Daten können **weniger** geeignete eindeutige Titel liefern; dann offen als weniger berichten und Verbesserungsbedarf begründen. G1 bleibt bis zur geprüften Werks-/Linkqualität und rechtmäßigem Datenweg offen. G2–G4, Badge-/Katalog-/Firestore-/Firebase-/Native-Änderungen weiterhin gesperrt. Voller Bericht-/Testplan: [G1 50-Titel-Auswahl](_work/YOUTUBE_MOVIES_G1_TITLE_SELECTION_EXPANSION_2026-10-21.md).

---
## G1-Priorität 21.10.2026 – Titel-Auswahl direkt aus YouTube jetzt vergrößern

**Neue Nutzer-Rückfrage/Entscheidung:** Die bisherige Auswahl der **direkt von YouTube selbst eingelesenen Filme** ist zu klein und muss erweitert werden. **Zeitpunkt: bereits in G1 als read-only Auswahl-/Matchingtest, nicht erst nach produktiver Freigabe.** Die automatische Veröffentlichung vergrößerter Titelbestände in MovieHub wird hingegen erst in **separat freizugebendem G2** umgesetzt.

**Abgrenzung des Ist-Stands:** Der alte Publisher-Playlist-Forschungspilot untersucht bis zu **200 Videos**, primär Publisher-Uploads; dies sind **keine 200 direkt aus YouTube Movies/Film-Shop ermittelten Filme**. Der neue offizielle Movies-ID-Test umfasst bisher nur **vier fest codierte Filmfälle**, davon drei reale Android-/Fire-TV-Gerätetests. Eine breitere Auswahl darf deshalb nicht durch bloßes Hochsetzen der Publisher-Pilotgröße vorgetäuscht werden.

**Jetzt priorisierte nächste G1-Technikarbeit:** Die feste Vier-Fälle-Liste in `scripts/youtube-movies-store-id-g1.mjs` als begrenztes, transparentes Auswahlmodell auf **40–60 unterschiedliche YouTube-Movies-Werke** erweitern. Quellenrichtungs-Mix: (a) Kandidaten **direkt aus dokumentierter öffentlicher YouTube-Data-API-`videoType=movie`-Suche**, (b) TMDB-first-Kandidaten mit **genau zugeordneten deutschen YouTube-Watch-Provider-Details**. Genre-/Epochen-/Sprach- und Popularitätsmix sowie Negativfälle berücksichtigen, Duplikate nach TMDB-Werkidentität filtern. YouTube-Film-ID und Kanal-ID, Titel, Laufzeit, Region, Provenienz und qualitätsgesichertes TMDB-Matching dokumentieren. Breiter Pool bedeutet **nicht**, dass YouTube `search.list` einen vollständigen DE-Movies-Shop liefert.

**Technische Grenzen:** YouTube `search.list` kostet 100 API-Quota-Einheiten je Aufruf. Pilot in überschaubaren Chargen (anfangs 15–20 Fälle) mit harter Kosten-/Call-Grenze, gebündeltem `videos.list`, strikter Klassifikation **match/review/unmatched** und separater Statistik für **direkt aus YouTube entdeckte** vs. **TMDB-first gefundene** Filme. Keine automatischen Badge-/Angebotsannahmen aus Video-ID, Providername oder freier Suche. Keine undokumentierten APIs, kein YouTube-Web-Scraping, kein Publisher-200er-Sample als Shop-Katalog verkaufen.

**Freigaberegel:** G1 erarbeitet nur wiederholbare read-only Kandidaten, ID-Abgleich und Zahlenbericht. Produktive Importe, Scheduler, Badge-/Provider-Merge, Firestore-/Firebase-Datenänderungen erst mit G2-Go. Keine verpflichtende tiefe Prüfung aller YouTube-Mitgliedschaften/Einzelpreise. Vollständiger G1-Test-/Auswahlplan: [YouTube Movies G1 Titel-Auswahl-Erweiterung](_work/YOUTUBE_MOVIES_G1_TITLE_SELECTION_EXPANSION_2026-10-21.md). #388 bleibt offen.

---
## Aktuelle Zielkorrektur – 21.10.2026: YouTube Movies vor Publisher-Playlists

**Neues fachliches Ziel nach Nutzerklärung:** MovieHub soll **von YouTube selbst über YouTube Movies/Film-Shop angebotene Filme in Deutschland** erschließen, nicht nur kostenlose Filme und nicht primär vollständige YouTube-Uploads von Publishern. Zu unterscheiden sind **FREE/ADS** (kostenlos/werbeunterstützt), **RENT** (Leihe), **BUY** (Kauf) und, soweit tatsächlich belegbar, **SUBSCRIPTION** (Primetime-Kanalabo). Derselbe Film kann mehrere Angebotsarten besitzen. Nicht belegte Angebote/Preise bleiben **unbekannt**; keine erfundenen Badges. Publisher-Playlists wie Netzkino/CiNENET bleiben ein **Kontroll- und Ergänzungsszenario**, nicht das primäre Produktziel. Frühere auf kostenlose Playlists begrenzte Zieltexte sind insofern historisch; der bestehende G1-200er-API-/TMDB-Befund bleibt unverändert und gültig.

### G1-Testszenario vor Produktiv-Coding ausweiten

1. **Katalog-/API-Zugang klären:** Dokumentierte, zulässige Schnittstellen oder offiziell lizenzierte Katalogquellen für den *deutschen YouTube-Movies-Shop einschließlich Angebotsart und Preisen* ermitteln. Die dokumentierte YouTube Data API kennt u.a. die Filmsuche mit videoType=movie und Videos-Metadaten; sie ist **bisher kein nachgewiesener vollständiger DE-Shop-/Preisfeed**. Der Parameter videoPaidProductPlacement betrifft Creator-Werbung, nicht Rent/Buy. Ohne belastbaren Feed kein automatischer Vollkatalog.
2. **Separate offizielle Shop-Stichprobe:** **40–60 anhand der offiziellen YouTube-Movies-Oberfläche ermittelte Testfälle**, möglichst über FREE/ADS, RENT, BUY, belegbare Abo-Fälle und Negativfälle verteilt. Bestehende 200er-Publisher-Stichprobe weiter als Kontrollfall nutzen. Falls eine Klasse nicht belegbar ist, die Lücke statt fiktiver Fälle ausweisen.
3. **Fallakte je Film:** offizieller Film-/Share-Link, belegte Film-/Video-ID, Titel/Originaltitel/Jahr/Version, Medientyp+TMDB-ID, Preis-/Angebotsart(en), ggf. EUR-Betrag und Qualität, Quelle/Publisher, DE-Region, Zeitpunkt, Anmelde-/Kanalabo-Voraussetzung, Filmseite/Kaufdialog/Wiedergabe unterscheiden. Unbekanntes nicht aus anderen Videoattributen ableiten.
4. **API-Kontrollvergleich:** Shop-Stichprobe gegen dokumentierte search.list-/videos.list-Felder halten. Messen, welche Filme und IDs auffindbar sind und welche Preis-/Angebotsklasse **wirklich aus offizieller Datenquelle** ableitbar ist. Region oder Filmtyp allein ist kein Kosten-/Rechtenachweis.
5. **Exakte Geräteziele:** Bei hinreichend belegten Film-IDs kontrollieren, ob Android-Smartphone, Tablet und Fire TV die richtige YouTube-Filmseite, den Leih-/Kaufdialog oder die tatsächliche Wiedergabe öffnen; Web-Fallback/Entitlement dokumentieren. Keine Testkäufe ohne ausdrücklichen Auftrag und keine erfundene Geräteabnahme.
6. **Kanonische Identität und Lebenszyklus:** TMDB-ID+Medientyp weiterhin zentral; gleiche Filme aus YouTube-Shop und Publishern nicht duplizieren. Änderungen bei Preis, Region, Gratis-Angebot, Abo oder Entfernung getrennt erfassen.
7. **Gate-Entscheidung:** G1-Zahlenbericht je Klasse: offizielle Katalogabdeckung, sichere Titel-IDs, Preis-/Availability-Daten, Matchquote, Links/Fire TV, Frische/Quota/Rechte, **Go / begrenztes Teil-Go / No-Go**. G2 erst nach erneuter Nutzerfreigabe.

**Grenzen:** kein Scraping, keine internen undokumentierten APIs, keine Preisbehauptung aus normalen Video-Metadaten, kein automatischer Massenimport oder Produktiv-Code. Eine kleine kuratierte Film-Link-Liste ist allenfalls ein **später separat freizugebendes** Teilziel, kein Ersatz für bewiesene Shop-Automatisierung.

**Offizielle Referenzen:** [YouTube Filme kaufen/leihen](https://support.google.com/youtube/answer/9674101?hl=de) · [YouTube kostenlose Primetime-Filme](https://support.google.com/youtube/answer/16618963?hl=de) · [Data API search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list) · [Videos](https://developers.google.com/youtube/data/reference/rest/v3/videos) · [Developer Policies](https://developers.google.com/youtube/terms/developer-policies).

---

**Stand:** 16.10.2026  
**Status:** Verbindliche Priorisierung und erste Analyse; **keine Implementierungs- oder Produktivfreigabe**.  
**Leit-Issue:** [#271 – Modulare Quellenplattform](https://github.com/matthias-ennen/movie-hub/issues/271).  
**Nächster Einzelauftrag:** [#388 – YouTube-Quellenadapter](https://github.com/matthias-ennen/movie-hub/issues/388).

## G1-Fortsetzung 21.10.2026 – Offizielle Quellenprüfung zur YouTube-Movies-Shop-Abdeckung

**Ergebnisstatus:** Dokumentation und zulässige API-Oberflächen **recherchiert**. **Kein authentifizierter neuer TMDB-/YouTube-/JustWatch-Liveabruf, keine repräsentative 40–60er-YouTube-Shop-Stichprobe und kein echter App-/Fire-TV-Gerätetest in dieser Runde.** Die vorherigen G1-200er-YouTube-Publisher-/TMDB-Tests werden nicht umgedeutet.

### Neu belegte drei Datenspuren

1. **TMDB Watch-Provider / Discover – erste Wahl für das G1-Katalogscreening:** `GET /3/watch/providers/movie?watch_region=DE` liefert die regionalen Provider (IDs **erst aus echtem Payload ermitteln**, niemals raten). `GET /3/discover/movie?watch_region=DE&with_watch_providers=<provider_id>&with_watch_monetization_types=<ads|free|rent|buy|flatrate>` erlaubt auf TMDB-Werkidentität bezogene Kandidatenrecherche je Anbieter/Angebotsklasse. Anschließend `GET /3/movie/{movie_id}/watch/providers` für die landesbezogene Provider-Aufschlüsselung. **TMDB stellt laut offizieller Dokumentation keine direkten Anbieterdeeplinks bereit**, sondern einen TMDB-Watch-Link; **JustWatch-Namensnennung/Attribution verpflichtend**. G1 muss herausfinden, ob es in DE getrennte Treffer für YouTube und Google Play/Google TV gibt, wie korrekt diese Angebotskanäle bezeichnet sind und wie viel Shop-Abdeckung tatsächlich vorliegt. **Google TV-Angebot ist nicht automatisch dieselbe YouTube-PlaybackRoute.** Die bestehende MovieHub-Watch-Provider-/Badge-Strecke vor jedem neuen Adapter prüfen.
2. **Lizenzierte JustWatch Content-Partner-API/Datenexport – potenzieller vollständiger Angebots-/Linkpfad:** Offiziell dokumentierte Partner-Angebotsdatensätze enthalten Monetization-Type `flatrate/rent/buy/ads/free`, Preis/Währung, Qualitätsstufe und providerbezogenen Filmseitenlink; tägliche Datenexporte sind möglich. **Partnervertrag/Zugangstoken erforderlich**, kein öffentlicher unbeschränkter Scraping-Feed und **noch nicht bestätigt**, dass genau der deutsche YouTube-Movies-Shop vollständig und mit App-fähigen Links abgedeckt ist. Vor G2: Verfügbarkeit der Provider-Datensätze, Konditionen, zulässige Caching-/Darstellungs-/Deep-Link-Nutzung, JustWatch-Branding und #112 prüfen. Keine Kontaktaufnahme/Kosten ohne Nutzerfreigabe.
3. **YouTube Data API – kontrollierte Identitäts-/Link-Gegenprobe, keine Shop-Preiswahrheit:** `search.list` unterstützt `videoType=movie`, `videos.list` liefert Video-Evidenz, aber aktuell kein belegter dokumentierter Komplettfeed für Deutschland inklusive `RENT/BUY/ADS`-Preisangebote und YouTube-Primetime-Kanalabo-Entitlements. `licensedContent`, `regionRestriction`, `paidProductPlacementDetails` sind **keine** belastbare Rent/Buy-/Free-Preisauszeichnung. Offizielle Quota-Dokumentation (Stand 17.09.2026) nennt standardmäßig **100 `search.list`-Aufrufe/Tag als separaten Bucket** sowie **10.000 Units/Tag für andere Endpunkte insgesamt**, nicht pauschal das ältere Kostenmodell für die Suche. Bestehenden Projektstand/aktuelle Cloud-Quotas vor Tests prüfen.

### Nächstes **nichtproduktives** G1-Messpaket (Reihenfolge)

- [ ] **Provider-Klassifikation (read-only):** TMDB-Providerliste `watch_region=DE` aus echtem API-Payload; YouTube, Google Play Movies/Google TV und YouTube Premium getrennt erfassen, auch falls einzelne fehlen. Keine ID oder Gleichwertigkeit vermuten.
- [ ] **Katalogmatrix:** Pro tatsächlich unterstützter Klasse `free`, `ads`, `rent`, `buy`, `flatrate` getrennten `discover/movie`-Read-only-Abruf auf DE/Provider; dokumentierte total_results/paging, Überschneidungen, Angebotsklassen je `movie/{id}/watch/providers`, eventuelle Bezeichnungs- und Katalogfehler. TMDB-Daten nicht als Echtzeitpreis/100%-Abdeckung ausgeben.
- [ ] **Shop-Gegenprobe:** Unabhängige ca. 40–60er Auswahl nach manueller Sichtung offizieller YouTube-Movies-Oberfläche; jede belegte Angebotsart einschließlich Rent/Buy und ggf. Primetime-Kanäle, Negativfälle. Erfassbar: Titel, Jahr, TMDB-ID, originales verifiziertes YouTube-Share-/Filmseitenziel, sichtbarer Preis/Angebotsart/Region und Prüfzeitpunkt; fehlende Fälle explizit nennen.
- [ ] **Link-Gate:** TMDB-Watch-Link / lizenzierter JustWatch-Providerlink / offizieller YouTube-Share-Link strikt unterscheiden. Nicht jede Linkart ist eine genaue Film-PlaybackRoute. Android/Tablet/Fire TV nur nach tatsächlich durchgeführter Geräteprüfung als bestanden kennzeichnen, keine Käufe tätigen.
- [ ] **Entscheidungsbericht:** Treffermengen und Vollständigkeit pro Anbieterklasse, Filmidentitäts- und Angebotswahrheit, Anbieterverwechslung YouTube vs. Google TV, direkter Linkerfolg, Kosten/Lizenz/Quota und **Go/Teil-Go/No-Go**. Ohne exakte erlaubte Route nur neutralen Watch-Link/Fallback getrennt kennzeichnen, keinen „direkt abspielbar“-Claim.

**Abgrenzung:** Dies ist ein Recherchenachtrag mit API-Dokumentationsbelegen, **kein ausgeführter produktiver Datenlauf** und keine Implementierungsfreigabe. Quellen: [TMDB Movie Watch Providers](https://developer.themoviedb.org/reference/movie-watch-providers) · [TMDB Discover Movie](https://developer.themoviedb.org/reference/discover-movie) · [TMDB Provider List](https://developer.themoviedb.org/reference/watch-providers-movie-list) · [JustWatch Partner Features](https://apis.justwatch.com/docs/content_partner/) · [JustWatch Partner API (Vertrag/Token)](https://apis.justwatch.com/docs/api/) · [YouTube Search](https://developers.google.com/youtube/data/reference/rest/v3/search/list) · [YouTube Video Resource](https://developers.google.com/youtube/data/reference/rest/v3/videos) · [offizielle YouTube-Quotas](https://developers.google.com/youtube/data/determine_quota_cost).

---

## G1-Realbefund 21.10.2026 – deutsche TMDB-Anbieter, Discover-Konflikte und erweiterte Diagnose

**Echter erfolgreicher Read-only-Lauf:** [Actions #39562949571](https://github.com/matthias-ennen/movie-hub/actions/runs/39562949571) auf `main`, 21.10.2026 07:34 UTC, 26/48 TMDB-Anfragen; echtes Job-Log und [14-Tage-Bericht](https://github.com/matthias-ennen/movie-hub/actions/runs/39562949571/artifacts/12328107583) ausgewertet. **Keine YouTube-Movies-Shop-/Preis-/Deep-Link-/Geräteprüfung.**

**Echte DE-Provider-IDs:** YouTube `192`, YouTube Free `235`, YouTube Premium `188`. Google Play Movies und Google TV erschienen im gefilterten TMDB-Film-Verzeichnis nicht als eigene Treffer. Diese Identitäten nicht gleichsetzen.

**TMDB-Discover-Treffermengen nach Anbieter und Monetarisierungsfilter** – ausdrücklich nur **unbestätigte Kandidatenzahlen**, **keine** geprüften Film-Shop-Bestände:

| TMDB-Anbieter | free | ads | rent | buy | flatrate |
| --- | ---: | ---: | ---: | ---: | ---: |
| YouTube (192) | 1362 | 4079 | 19061 | 19290 | 11265 |
| YouTube Free (235) | 72 | 1113 | 896 | 899 | 721 |
| YouTube Premium (188) | 0 | 2 | 4 | 11 | 29 |

**Entscheidender Befund:** Bei der ersten streng `TMDB-ID + Provider-ID + Monetarisierungstyp` verglichenen 10er-Film-Stichprobe stimmten **nur 3 von 10** Discover-Anfrageklassen mit den deutschen `movie/{id}/watch/providers`-Detaildaten überein; **7 von 10 wichen ab**. Beispielsweise wurde **Der Pate** (`movie:238`) unter `free` für YouTube (192) von Discover vorgeschlagen, die konkrete TMDB-Detailantwort nannte für YouTube nur `rent,buy`. Auch **Der wilde Roboter** (`movie:1184918`) unter `ads` zeigte in den Details nur `rent,buy`. **Ursache noch unbewiesen** (z.B. Filtersemantik/Frische); Detaildaten belegen ihrerseits keine aktuelle YouTube-App-Wiedergabe oder Preise.

**Technische Konsequenz:** `discover.total_results` konsequent als Suchkandidaten behandeln, niemals automatisch als `verifiedOffers`, `free`-, `rent`- oder `buy`-Badges interpretieren. Die bestehende Produktivkatalog-Logik in `scripts/provider-catalogs.mjs` übernimmt Discover-Kandidaten zunächst als Mitgliedschaft (`offerTypes:['catalog']`) und reichert danach echte Detailangebote an; daher ein **potenzielles**, noch nicht als UI-Bug bewiesenes Integrationsrisiko gesondert prüfen. Produktiven Renderer/Normalizer bisher nicht verändert.

**Qualitätsnachtrag:** [PR #486](https://github.com/matthias-ennen/movie-hub/pull/486) nach [grüner CI #39563658427](https://github.com/matthias-ennen/movie-hub/actions/runs/39563658427) und [grüner Android-APK #39563658412](https://github.com/matthias-ennen/movie-hub/actions/runs/39563658412) mit Squash `2710f8306ef7f99f2a808fbe3e053be464a99e97` in `main` übernommen. **Ausschließlich G1-Forschungsdiagnose und eigene Node-Tests**, manuell auszulösender Workflow unverändert. Nun bis zu **30 Kombinationen** (maximal zwei Discover-Titel je Provider/Typ), zwischengespeicherte Details, getrennte `detail-agrees` / `detail-disagrees`-Auswertung und unverändert maximal **48** lesende TMDB-Anfragen. Änderungen erfolgreich nachgelesen; noch **kein erneuter Live-Datenlauf** des verbesserten Tools.

**Nächster Schritt:** [YouTube Movies G1 TMDB Provider Audit](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-tmdb-provider-g1.yml) auf `main` erneut **manuell** starten. Danach echten neuen Bericht auf provider-/offer-gebundene Trefferquote auswerten und getrennt einen unabhängigen **offiziellen YouTube-Movies-Shop-Test mit 40–60 Fällen** inklusive Original-Filmseitenlinks, Deutschland-Preis/Angebotsklasse, Identität und Android-/Fire-TV-App-Öffnung vorbereiten. Die [offizielle YouTube-Hilfe](https://support.google.com/youtube/answer/9679194?hl=de) bestätigt Filme/Käufe in der YouTube-App auf Fire TV, **aber keinen konkreten für MovieHub bestätigten Filmtitel-Deep-Link**.

**Freigabegrenze:** G1 research-only; kein produktiver YouTube-Adapter, keine neuen Badges/Anbieterreihen, kein Scraping, keine Testkäufe, keine G2-/G3-/G4-Freigabe.

---

## G1-Nachlauf 21.10.2026 – 28 Anbieter/Monetarisierungs-Vergleiche und offene Filtersemantik

**Echter Folgelauf, erfolgreich:** [GitHub Actions #39564348305](https://github.com/matthias-ennen/movie-hub/actions/runs/39564348305), 21.10.2026 07:46 UTC, [Reportartefakt #12329191808](https://github.com/matthias-ennen/movie-hub/actions/runs/39564348305/artifacts/12329191808). **30/48** read-only TMDB-Anfragen; 3 deutsche TMDB-Provider (`192 YouTube`, `235 YouTube Free`, `188 YouTube Premium`), 15 Provider-/Angebotstyp-Discover-Abfragen, **14 verschiedene Film-Detaildatensätze** und **28 Vergleiche** (gezielt die ersten ein bis zwei Filme je Filter, teilweise wiederholte Filme).

**Resultat: nur 8/28 Übereinstimmungen**, **20/28 Abweichungen** beim exakten Paar `Provider-ID + Monetarisierungsart`. Dies ist **keine** repräsentative Fehlerquote für alle YouTube-Filme. Die beobachteten `discover.total_results`-Zahlen dürfen weiterhin nicht als bestätigte Movie-Shop-Angebote oder Preis-/Verfügbarkeits-Badges interpretiert werden.

| Anbieter in TMDB | free | ads | rent | buy | flatrate |
| --- | --- | --- | --- | --- | --- |
| YouTube (192) | 0/2 | 0/2 | 2/2 | 2/2 | 0/2 |
| YouTube Free (235) | 0/2 | 2/2 | 0/2 | 0/2 | 0/2 |
| YouTube Premium (188) | 0 Fälle | 0/2 | 0/2 | 0/2 | 2/2 |

**Arbeits-Hypothese, nicht bestätigt:** TMDB könnte Anbieter- und Monetarisierungsfilter ohne Bindung an *denselben* Anbieter erfüllen (beispielsweise Film bei YouTube als Kauf und bei einem anderen Anbieter als Free). [Offizielles Discover-Referenzdokument](https://developer.themoviedb.org/reference/discover-movie) benennt die Filter, beweist deren innere Datenbankverknüpfung aber nicht. Datenfrische oder unterschiedliche Datenindizes bleiben mögliche Alternativerklärungen.

**Geprüfte zusätzliche G1-Diagnose implementiert:** [PR #487](https://github.com/matthias-ennen/movie-hub/pull/487) mit [CI grün #39564874423](https://github.com/matthias-ennen/movie-hub/actions/runs/39564874423) und [Android APK grün #39564874383](https://github.com/matthias-ennen/movie-hub/actions/runs/39564874383) nach `main` gemergt (Commit `9510257ffbb82d2b8528eb4bdae587b88ff97ad8`, `[skip ci]`). Nur zwei isolierte Forschungsdateien geändert, keine Cloud-/Produktiv-Daten. Der nächste Bericht klassifiziert jede der beobachteten Abweichungen in `other-provider-only` (Typ bei anderem Anbieter), `type-not-in-DE-details` (Typ in DE-Detaildaten fehlt) oder `same-provider`. **Keine zusätzlichen API-Calls**, bestehender Maximaldeckel 48, bisheriger manueller Workflow unverändert. Nach Merge per Readback verifiziert; **noch kein neuer tatsächlicher API-Lauf für diese zusätzliche Diagnose**.

**Nächster sinnvoller Schritt:** Noch **ein** begrenzter manuell ausgelöster [YouTube Movies G1 TMDB Provider Audit](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-tmdb-provider-g1.yml) auf `main` zur Diagnose der Filterverknüpfung. Unabhängig davon dann **offizielle YouTube-Movies-Filmseiten/Share-Links** anhand einer ausgewogenen Free/Ads/Rent/Buy-/optional-Primetime-Stichprobe erfassen; Anbieter-TMDB-Daten liefern keine gesicherten YouTube-ID-/Preis- oder App-Deep-Link-Informationen. Später nur tatsächlich bestätigte App-Ziele auf Android/Fire TV als bestandene Playback-Gates deklarieren. **#388 bleibt G1, G2/G3/G4 nicht freigegeben.**

---

## G1-Abschlussbefund 21.10.2026 – Filter und YouTube-Film-ID

**Echter dritter TMDB-G1-Lauf:** [GitHub Actions #39566078265](https://github.com/matthias-ennen/movie-hub/actions/runs/39566078265), 08:00 UTC, SUCCESS, tatsächliches [Reportartefakt #12329747051](https://github.com/matthias-ennen/movie-hub/actions/runs/39566078265/artifacts/12329747051) gelesen. Die **20 Abweichungen in 28 gezielt ausgewählten Provider-/Angebotstyp-Kombinationen** waren in allen **20 Fällen** mit dem gesuchten Angebotstyp bei **einem anderen DE-Anbieter** verknüpft, nicht beim gesuchten YouTube-Provider; **0** Fälle, in denen der Angebotstyp in den DE-Details überhaupt nicht existierte. **8** provider- und typgebundene Treffer. Dies ist ein starkes Indiz für getrennte TMDB-Discover-Filterbedingungen, **kein Beweis der inneren TMDB-Implementierung und keine repräsentative Katalog-Fehlerquote**. Die Filterursachenforschung wird damit vorerst beendet: **Discover nur Kandidaten**, `movie/{id}/watch/providers` zur providergebundenen TMDB-Evidenz, **nie** als eigenständiger YouTube-Shop-Preis-/App-Beleg.

**Neuer zentraler offizieller Nachweis:** [Google Movies & TV Partner-Hilfe – Titel auf unseren Plattformen](https://support.google.com/moviestvpartners/answer/9311527?hl=de) dokumentiert für YouTube-Film-Shop-Titel (Legacy / Next Gen) den titelgenauen Filmseiten-Link `https://www.youtube.com/watch?v=<YOUTUBE_FILM_VIDEO_ID>`; die ID ist im Partner-VOD-Portal unter **Angebote → Angebotsdetails** gespeichert. Das ist **keine öffentliche TMDB-ID-zu-YouTube-ID-Abbildung** und keine bestätigte öffentliche API-/Katalogroute; die konkrete ID darf nicht geraten werden. Google-TV-TVoD-Deeplinks bleiben ein getrennter Linktyp.

**Zwei konkret gefundene YouTube-Movies-Filmseiten (Web-Suche):**
- `movie:392011` **Kedi – Von Katzen und Menschen**: `https://www.youtube.com/watch?v=-oMYcSU3oVo`, Suchnachweis als YouTube Movies (verifizierter Kanal).
- `movie:9479` **Nightmare Before Christmas**: `https://www.youtube.com/watch?v=Hw0CGCHl3V8`, Suchnachweis als YouTube Movies & TV (verifizierter Kanal).

**Stufe:** authentische titelgenaue öffentliche Web-Fundstellen, aber **noch keine tatsächlich von uns lesbar bestätigte DE-Kauf-/Miet-/Aboanzeige**, kein rechtlich belastbarer automatischer Katalogzugang, **kein** Android-/Fire-TV-App-Test. Diese Film-URLs nicht zu als abgenommen deklarierten PlaybackRoutes/Badges machen. Die erfolgreiche YouTube-App-Wiedergabe gekaufter Filme auf Fire TV wird von [Google allgemein bestätigt](https://support.google.com/youtube/answer/9679194?hl=de), beweist aber **keinen exakten von MovieHub ausgelösten Film-Absprung**.

**Neues verbindliches G1-Testinventar und genaue Evidenz-/Geräte-Gates:** [`docs/_work/YOUTUBE_MOVIES_SHOP_LINK_EVIDENCE_2026-10-21.md`](_work/YOUTUBE_MOVIES_SHOP_LINK_EVIDENCE_2026-10-21.md). Jetzt zuerst die beiden tatsächlichen Shop-Webseiten an Android und Fire TV sichtprüfen und das Angebot/Entitlement/Preis kontrollieren, danach die YouTube-Shop-Probe auf 40–60 tatsächlich unabhängige Filme ausweiten. **Nicht** weiter die TMDB-Filter-Diagnose endlos ausbauen. G2–G4 bleiben ausdrücklich ohne Freigabe.

---

## G1-Fortsetzung 21.10.2026 – öffentliche YouTube-Data-API gegen echte Storefront-Filmkennungen testen

Die TMDB-Discover-Filterforschung ist als abgeschlossenes **G1-Teilthema** dokumentiert; keine weiteren Iterationen ohne neue Fakten. **Jetzt Priorität: echte Film-ID-Discoverability**. Googles [offizielle Partner-Hilfe](https://support.google.com/moviestvpartners/answer/9311527?hl=de) weist darauf hin, dass eine Film-ID über das VOD-Partnerportal existieren kann, obwohl ein Titel **außerhalb seiner Verfügbarkeitsfenster per Titelsuche nicht gefunden wird**. Somit beweist fehlender Suchtreffer weder fehlende YouTube-Filmseite noch fehlende lizenzierte Angebotshistorie.

**Neuer Forschungs-PR erfolgreich geprüft:** [PR #488](https://github.com/matthias-ennen/movie-hub/pull/488), nach erfolgreicher [CI #39568236727](https://github.com/matthias-ennen/movie-hub/actions/runs/39568236727) und [Android-APK #39568236795](https://github.com/matthias-ennen/movie-hub/actions/runs/39568236795) mit Squash `b848c53d1326145fec13b7da9d14d41df3627ed1` in `main` gemergt, `[skip ci]`. Exakt drei Forschungsdateien, in `main` nachgelesen, keine Produktivcodes, Anzeigen, Firebase-Daten oder Adapter geändert.

**Neu vorbereiteter, strikt manueller Read-only-G1-Test:** [`YouTube Movies G1 ID Discovery (Read-only)`](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-store-id-g1.yml) (`workflow_dispatch`, nur `main`, bestehendes Secret `YOUTUBE_API_KEY` durch bestehende GitHub-OIDC/Secret-Manager-Route). Script `scripts/youtube-movies-store-id-g1.mjs` und isolierte Tests `scripts/youtube-movies-store-id-g1.check.mjs`:

- **Bekannte öffentliche YouTube-Movies-ID-Kandidaten aus der G1-Linkrecherche:** `movie:392011` (Kedi), `-oMYcSU3oVo`; `movie:9479` (Nightmare Before Christmas), `Hw0CGCHl3V8`. **Nicht** als aktuelle DE-Shop- oder Gerätefreigabe verstehen.
- **TMDB-Filme ohne YouTube-Video-ID als Suchkontrollen:** `movie:238` (Der Pate), `movie:872585` (Oppenheimer). Keine ungeprüfte ID aus Suchtreffern als Match deklarieren.
- **Testmatrix:** genau 1 × `videos.list` mit beiden vorhandenen IDs (Metadaten/DE-RegionRestriction als begrenzte Evidenz), je Film `search.list` einmal mit `videoType=movie` und einmal `videoType=any`, `type=video`, `regionCode=DE`, `relevanceLanguage=de`, max. 10 erste Ergebnisse. **Max. 8 Search-Anfragen + 1 Videos-Anfrage** insgesamt; keine Pagination, kein unkontrollierter Crawl. Die [YouTube Data API](https://developers.google.com/youtube/data/reference/rest/v3/search/list) dokumentiert `videoType=movie` als Videotypfilter, **nicht** als Vollständigkeits- oder Kaufpreisschnittstelle; das [aktuelle Quota-Modell](https://developers.google.com/youtube/v3/determine_quota_cost) hat standardmäßig 100 `search.list`-Aufrufe/Tag.
- **Protokoll:** tatsächliche Daten-API-Abrufbarkeit der zwei öffentlichen IDs, Treffer derselben IDs unter `movie` und `any`, maximal drei Suchhinweise je Variante, Fehler separat; 14-Tage-Artefakt `artifacts/youtube-movies-g1/id-discoverability.md`. Keine automatisch positive Filmidentität aus ähnlichen Suchresultaten.
- **Grenze:** **Noch kein echter API-Lauf** nach dem Merge. CI grün ist keine Bestätigung der Live-API-Reichweite, und der gerätefreie Test beweist weder tatsächliche Leih-/Kaufpreise/Gratis-Entitlements noch einen YouTube-App-Absprung auf Fire TV. Diese Gates gehören zur unabhängigen offiziellen Filmshop-/Geräte-Stichprobe.

**Nächster Schritt:** Workflow manuell auf `main` starten; tatsächliches Job-Log und Report lesen und Film-ID-Recall nach Typ dokumentieren. **Anschließend** entscheiden, ob die öffentliche API das TMDB→YouTube-Movies-ID-Mapping überhaupt leisten kann, ob ein vertraglich lizenzierter Anbieterlink-Feed nötig ist oder ob vorerst nur einzelne überprüfte Links möglich sind. G1 bleibt offen; keine G2-/G3-/G4-Freigabe.

---

## G1-YouTube-Movies-ID-Livebefund 21.10.2026 – Such-Recall und Videodetails

**Echter erfolgreicher YouTube-API-Datenlauf:** [Actions #39568885205](https://github.com/matthias-ennen/movie-hub/actions/runs/39568885205) vom 21.10.2026 08:23 UTC, [vollständiger gelesener G1-Bericht](https://github.com/matthias-ennen/movie-hub/actions/runs/39568885205/artifacts/12330773610). Alle neun API-Aufrufe erfolgreich: 8 search.list, 1 videos.list; 4 kanonische TMDB-Filme.

**Verifizierte Video-Metadaten, aber kein DE-Shop-/Playback-Nachweis:** Kedi (movie:392011) mit Video-ID -oMYcSU3oVo: YouTube Movies, 1:19:02, DE in Allowed-Liste. Nightmare Before Christmas (movie:9479), Hw0CGCHl3V8: YouTube Movies, 1:16:39, DE NICHT in Allowed-Liste. **Beide IDs tauchten bei keinem der beiden Suchtypen unter den ersten 10 Ergebnissen auf**, waren aber direkt via videos.list abrufbar. Fehlende Suchtreffer sind kein Nichtverfügbarkeitsbeweis.

**Drei neue, noch unbestätigte Suchkandidaten von YouTube Movies:** Nightmare Before Christmas (movie:9479) nJf67zNZhoc, Der Pate / The Godfather (movie:238) xcCsnx-GRkA, Oppenheimer (movie:872585) _1WjM7ucekc. Diese Kandidaten waren bisher nur Search-Snippets, noch keine bestätigten Full-Movie-Metadaten oder Wiedergabelinks. Kedi-Suche zeigte prominent andere Filme; videoType=movie allein reicht nicht für sichere Identitätszuordnung.

**Präzise, kostenneutrale G1-Erweiterung implementiert:** [PR #489](https://github.com/matthias-ennen/movie-hub/pull/489), CI [#39569847409](https://github.com/matthias-ennen/movie-hub/actions/runs/39569847409) SUCCESS inkl. eigenem automatisch gelaufenen Node-Mock-Gate (187 Testdateien, 1218 Tests), Android APK [#39569847441](https://github.com/matthias-ennen/movie-hub/actions/runs/39569847441) SUCCESS; Squash auf main 9e61132a2e7eab7034fc25a712af23df26466e8e mit [skip ci]. Alle drei Forschungsdateien auf main nachgelesen. **Gleiche neun API-Aufrufe**: die acht unveränderten Suchen und danach EIN gemeinsamer videos.list-Detailabruf mit zwei alten IDs plus maximal drei movie-Suchtreffern je Film. Erfasst Kanal-ID, Laufzeit, DE-Regionseinschränkung und nicht auflösbare Treffer ohne Crash. G1 research-only: kein produktiver Adapter/Badge/Katalog, Firestore oder Cloud-Deployment geändert.

**Nächste Aktion:** [Manuellen YouTube Movies G1 ID Discovery Workflow](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-store-id-g1.yml) auf main erneut ausführen und neues reales Artefakt für die drei Kandidaten lesen. **Dieser neue Live-Lauf steht noch aus.** Anschließend separat die echten Angebote und titelgenauen Android-/Fire-TV-App-Links in Deutschland prüfen, ohne Testkäufe. Detaillierte Herkunft und Evidenz: [G1-Shop-Link-Inventar](_work/YOUTUBE_MOVIES_SHOP_LINK_EVIDENCE_2026-10-21.md). Issue #388 offen, G2–G4 nicht freigegeben.

---
## G1-Ergebnis 21.10.2026 – YouTube Movie-ID Kandidaten jetzt per videos.list geprüft

**Echter neuer Read-only-Lauf erfolgreich:** [YouTube Movies G1 ID Discovery #39571075075](https://github.com/matthias-ennen/movie-hub/actions/runs/39571075075), 21.10.2026 08:40 UTC; [Original-Reportartefakt #12332506808](https://github.com/matthias-ennen/movie-hub/actions/runs/39571075075/artifacts/12332506808) wurde tatsächlich gelesen. Neun von neun API-Anfragen erfolgreich: 8 Suchen und eine gebündelte videos.list-Abfrage; die 12 movie-Suchkandidaten aus den vier abgefragten TMDB-Titeln lieferten alle Video-Details. Die zwei zuvor gesammelten Referenz-IDs wurden erneut gelesen. Es gab **keinen** API- oder App-Produktivimport.

**Fokus der nächsten G1-Phase – drei echte Video-Metadatensätze, aber noch keine DE-Shop- oder Geräteevidenz:**
- Nightmare Before Christmas (movie:9479), Video-ID `nJf67zNZhoc`, https://www.youtube.com/watch?v=nJf67zNZhoc , YouTube Movies, 1:16:39, DE in Allowed-Liste, Kanal-ID stimmt mit **einem** früheren YouTube-Movies-Referenzfilm überein. Frühere Nightmare-ID `Hw0CGCHl3V8` hat gleiche Runtime, aber DE **nicht** in Allowed-Liste. **A-Kandidat** für genaues Filmseitenziel.
- Der Pate (movie:238), `xcCsnx-GRkA`, https://www.youtube.com/watch?v=xcCsnx-GRkA , YouTube Movies, 2:55:28, DE in Allowed-Liste. Seine Kanal-ID ist anders als die zwei vorhandenen Referenzkanäle; **B-Kandidat**, keine vorschnelle Echtheits-/Fassung-/Angebotsfreigabe.
- Oppenheimer (movie:872585), `_1WjM7ucekc`, https://www.youtube.com/watch?v=_1WjM7ucekc , YouTube Movies, 3:00:22, DE in Allowed-Liste. Auch hier andere Kanal-ID als bei den zwei Referenzkanälen; **B-Kandidat**.

**Architektur-Befund im bestehenden Android/Fire-TV-Code (read-only geprüft):** Native App besitzt `YouTubeUrlResolver.canonicalWatchUrl` für öffentliche elfstellige Video-IDs und `openProviderExact` beziehungsweise `launchYouTubeMedia` mit paketgebundenem `ACTION_VIEW` zuerst für bekannte YouTube-Pakete; danach Rückfall auf andere Provider-/Web-Aktionen. Die vorhandene Softwarelogik ist **kein tatsächlicher Gerätetesterfolg**. Kein Adapter-/Badge-/Provider-Code wurde geändert.

**Nächste konkrete Aufgabe:** **Nicht** erneut youtube.search-Tiefenstudien oder zusätzliche Discover-Filter bauen. Die drei unveränderten `watch?v=`-Links nun in der realen deutschen YouTube-App auf Android und Fire TV mit Account prüfen: tatsächliche Film-Detailseite, richtige Fassung, Angebotsart, angezeigter Preis, Browser-/App-Routing, Fire-TV-Fokus/Wiedergabedialog; kein Testkauf. Vorher weder eine PlaybackRoute noch Availability-Badge freigeben. Danach erst eine ausgewogene 40–60-Fälle-Shop-Stichprobe und einen legitim automatisierbaren TMDB-ID→YouTube-Movies-ID-Datenpfad verifizieren.

**Vollständige Probedaten, drei URLs, Negativkontrolle, Abnahmeschema:** [YouTube Movies G1-Shop-Link-Evidenzinventar](_work/YOUTUBE_MOVIES_SHOP_LINK_EVIDENCE_2026-10-21.md), Abschnitt G. #388 weiterhin **G1 offen**, G2–G4 nicht freigegeben. Keine Firestore-Schreibzugriffe, kein Produktiv-Deploy, keine Film-/Badge-Datenänderung.

---
## G1-Fortschritt 21.10.2026 – Fire TV bestätigt, Angebotsarten strikt getrennt

**Praxisbefund:** Nach erfolgreichem Android-Test bestätigte der Nutzer auf die explizite Bitte, dieselben drei Filmseiten-URLs **auf Fire TV aus MovieHub heraus** zu öffnen, mit „**Passt auch. Bitte weit**“. Daher **3/3 user-confirmed** für den vorhandenen Android-Filmseiten-Absprung und **3/3 user-confirmed** für die konkrete Fire-TV-Probe. Getestete URLs: `movie:9479` Nightmare Before Christmas `https://www.youtube.com/watch?v=nJf67zNZhoc`; `movie:238` Der Pate `https://www.youtube.com/watch?v=xcCsnx-GRkA`; `movie:872585` Oppenheimer `https://www.youtube.com/watch?v=_1WjM7ucekc`. Keine eigenen Geräte-Logs, keine tatsächliche kostenpflichtige Filmwiedergabe, keine Kontoberechtigung oder aktuelle Shoppreise nachgewiesen.

**Ergebnis für die Architektur:** Das bestehende Watch-URL-Format und der native Android/Fire-TV-YouTube-Launcher sind für diese **drei Nutzer-Testfälle praktisch bestätigt**. **Keine Änderung an der produktiven Abspielroute oder am Badge-Code nötig, nur um das Format zu unterstützen.** Die allgemeine Verlässlichkeit für weitere YouTube-Film-IDs bleibt ungeprüft.

**Neue G1-Frage: DE-Monetarisierung mit getrennten Quellen und Sicherheiten.** Öffentliche [YouTube Data API Video-Details](https://developers.google.com/youtube/data/reference/rest/v3/videos) liefern Video-ID, Titel, Kanal, Laufzeit und RegionRestrictions, aber **keinen** umfassenden aktuellen deutschen Store-Preis- oder Entitlement-Feed. [TMDB Movie Watch Providers](https://developer.themoviedb.org/reference/movie-watch-providers) liefern pro Land und Anbieter Angebotsinformationen aus der **JustWatch**-Partnerschaft, jedoch ausdrücklich keine vollständigen filmgenauen Deep-Links. Für diese Daten schreibt TMDB eine **JustWatch-Quellenangabe** vor – vor produktiver Nutzung gesondert überprüfen. Die G1-TMDB-Discover-Versuche belegten überdies, dass der getrennte Anbieter/Monetarisierungsfilter selbst bei gegensätzlichen Detailangeboten Treffer liefern kann. **Discover daher nie für die konkrete Paarung YouTube + Tarif verwenden.**

**Wesentliche Unterscheidung:** [YouTube-Hilfe](https://support.google.com/youtube/answer/9674101?hl=de) bestätigt `rent`/`buy` in Deutschland und einzelne **Primetime-Kanalabos**. Letztere sind **nicht** pauschal `YouTube Premium` und nicht ohne konkreten Abo-Kanal als `flatrate` zu verbuchen. Für `free` und `ads` bedarf es ebenfalls realer DE-Filmseiten-/Publisher-Belege; nicht vom Vorhandensein einer Filmseite schließen.

**Gebundene G1-Vorgehensweise:** Aus den drei bestätigten Filmseiten die tatsächlich sichtbaren Angebotsbuttons und, soweit angezeigt, Europreise **ohne Kauf** beobachten. Bis dahin sind ihre `offerType=unknown` und `priceEUR=unknown` ausdrücklich zu erhalten, unabhängig vom 3/3-Routenerfolg. Die später angestrebte 40–60-Film-Stichprobe muss unabhängige Werke/Fassungen und verschiedene Tariftypen enthalten, darf aber nicht in DE nicht belegte kostenlose/werbefinanzierte/Primetime-Fälle vortäuschen.

**Kanonischer Fach- und Abnahmeplan:** [G1-Monetarisierungs- und Quellen-Gates](_work/YOUTUBE_MOVIES_G1_MONETIZATION_EVIDENCE_2026-10-21.md). [G1-Geräte- und Linkbelege](_work/YOUTUBE_MOVIES_SHOP_LINK_EVIDENCE_2026-10-21.md), Abschnitt J. **Kein** neues Produktivfeature, Preisbadge, Firestore-Katalogeintrag oder Firebase-Deployment freigegeben; #388 bleibt in G1 und G2–G4 gesperrt.

---
## G1-Monetarisierung 21.10.2026 – drei YouTube-Filme und providergebundene TMDB-Details

**Erster kanonischer DE-Angebotsdetail-Messpunkt vorbereitet, noch kein neuer Live-Abruf:** [PR #490](https://github.com/matthias-ennen/movie-hub/pull/490) mit vier isolierten G1-Research-Dateien, CI [#39577427122](https://github.com/matthias-ennen/movie-hub/actions/runs/39577427122) SUCCESS (**188 Testdateien, 1219 Tests**) und Android APK [#39577427082](https://github.com/matthias-ennen/movie-hub/actions/runs/39577427082) SUCCESS; Research-only-Squash-Commit `080be18439ed63823e131561fff43a2ff3486ae1`, Dateien auf `main` geprüft, `[skip ci]`. Erst eine Mock-Testkorrektur zur TMDB-Version `/3`, danach beide vollständigen Checks grün. **Kein** Produktivcode, Adapter, Badge, Firebase, Firestore oder automatische Quellendaten geändert.

Der auf `main` verfügbare [YouTube Movies G1 Three Film Offers (Read-only)](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-three-offers-g1.yml) benötigt **max. vier lesende TMDB-Anfragen**: ein deutsches Anbieterverzeichnis und die drei DE-Detaildatensätze für `movie:9479` Nightmare Before Christmas (`nJf67zNZhoc`), `movie:238` Der Pate (`xcCsnx-GRkA`) und `movie:872585` Oppenheimer (`_1WjM7ucekc`). **Genauer provider_id + OfferType** statt fehleranfälliger Discover-Kombinationen. YouTube, YouTube Free, YouTube Premium und Google-Angebote sind getrennte Provider. Fehlende DE-Daten sind `unknown`, niemals vermeintliche YouTube-Nichtverfügbarkeit.

Historischer echter G1-TMDB-Befund aus [#39566078265](https://github.com/matthias-ennen/movie-hub/actions/runs/39566078265): Der Pate YouTube(192) **rent+buy** und kostenlose Arte-Alternative; Oppenheimer YouTube(192) **buy** und ads bei Joyn. Das sind **TMDB-interne Hinweise**, keine direkt auf YouTube bestätigten Shopangebote oder Preise. Nightmare bleibt ohne entsprechenden historischen Nachweis. Alle drei tatsächlich in Deutschland sichtbaren Leih-/Kauf-/Gratis-/Ads-/Primetime-Optionen sind weiterhin unbestätigt.

**Nächste G1-Aktion:** Manuellen Vier-Anfragen-Workflow auf `main` auslösen, echten Report lesen und danach für die drei vom Nutzer in Android/Fire TV positiv getesteten YouTube-Filmseiten die tatsächlich angezeigten Shopbuttons vergleichen. **Bis dahin kein Preis- oder Tarifsuffix-Badge** aus bloß funktionierenden Film-URLs. Der G1-Monetarisierungsplan mit Quellennachweisen und Attribution steht unter [YouTube Movies G1 Monetarisierung](_work/YOUTUBE_MOVIES_G1_MONETIZATION_EVIDENCE_2026-10-21.md), Abschnitt 7. #388 bleibt offen, G2–G4 gesperrt.

---
## G1-Monetarisierung – echter Dreifilm-Livebericht 21.10.2026

**Live statt nur Vorbereitung:** [YouTube Movies G1 Three Film Offers, Run #39578883501](https://github.com/matthias-ennen/movie-hub/actions/runs/39578883501), 21.10.2026 09:41 UTC / 11:41 MESZ, **SUCCESS**, [originäres Reportartefakt #12336195508](https://github.com/matthias-ennen/movie-hub/actions/runs/39578883501/artifacts/12336195508) tatsächlich gelesen. Vier von vier lesenden TMDB-Anfragen erfolgreich; drei individuelle deutsche `watch/providers`-Detaildatensätze + Anbieter-Directory, ohne Produktionswirkung. Exakte Provider-IDs: **188 YouTube Premium**, **192 YouTube**, **235 YouTube Free**.

**G1-TMDB-Daten für drei zuvor in Android und Fire TV positiv getestete YouTube-Filmseiten:**
- `movie:9479` **Nightmare Before Christmas**, `https://www.youtube.com/watch?v=nJf67zNZhoc`: TMDB YouTube **192 rent + buy**; YouTube Free 235 **kein DE-Detailtreffer**; YouTube Premium 188 **kein DE-Detailtreffer**.
- `movie:238` **Der Pate**, `https://www.youtube.com/watch?v=xcCsnx-GRkA`: TMDB YouTube **192 rent + buy**, nicht `free` – das kostenlose Angebot ist **Arte** zugeordnet.
- `movie:872585` **Oppenheimer**, `https://www.youtube.com/watch?v=_1WjM7ucekc`: TMDB YouTube **192 buy**, nicht `ads` – werbefinanziertes Angebot ist **Joyn** zugeordnet.

Das sind **providergebundene TMDB-/JustWatch-Befunde, keine direkt von der deutschen YouTube-Shop-UI bestätigten Konditionen**, keine Preise und keine Abspielberechtigungen. Fehlender TMDB-Detailtreffer bedeutet nicht echte Nichtverfügbarkeit. Keine zugehörigen `free`, `ads`, `flat` oder `R&B`-Badge-Änderungen allein aus diesem Research-Report vor G2-Freigabe.

**Read-only-Bestandscode geprüft:** `src/services/tmdb.js` normalisiert die fünf Angebotsarten für TMDB-Provider-Detaildaten bereits in `providerOffers[].offerTypes`. Der normale `youtube`-Alias in `src/providers/providerRegistry.js` entspricht exakt YouTube, nicht automatisch „YouTube Free“/„YouTube Premium“. Die Discover-Katalogmitgliedschaft `offerTypes:['catalog']` in `scripts/provider-catalogs.mjs` ist als reine Aufnahme eines Kandidaten zu behandeln, nicht als bezahltes oder inkludiertes YouTube-Angebot. Bei G2 separate Regressionstests für konsistente Poster-/Detail-Badges und diese Mitgliedschaft einplanen.

**Nächster fachlicher Gate:** Keine erneute TMDB-Suchdiagnose. **Direkt auf den drei echten deutschen YouTube-Filmseiten** die sichtbaren Buttons und Preise/Qualitätsstufen von Nutzer-Gerät bzw. Konto prüfen; ohne Kauf. Danach (1) repräsentativere 40–60 unabhängige Filme aller tatsächlich vorhandenen Kategorien, (2) erlaubte fortlaufende TMDB-ID→YouTube-Film-ID/Angebotsdatenquelle, (3) ausdrückliche G2-Produktentscheidung. Voller Befund und Quellen: [G1-Monetarisierung, Abschnitt 8](_work/YOUTUBE_MOVIES_G1_MONETIZATION_EVIDENCE_2026-10-21.md). **Issue #388 G1 offen, G2–G4 ohne Freigabe.**

---
## G1 YouTube Movies – reale Android-Angebotsbuttons 21.10.2026

**Neue visuelle Nutzer-Evidenz (11:48 Uhr MESZ):** Zwei Screenshots der **YouTube-Android-App-Suchergebnisse** für **Oppenheimer** und **Der Pate**. Die bekannten drei direkten Watch-URLs hatten zuvor den nutzerbestätigten Android-/Fire-TV-Routentest bestanden. Die Screenshots zeigen **aktuelle YouTube-Shop-Buttons**, nicht lediglich TMDB-/JustWatch-Daten:

- **Oppenheimer** (`movie:872585`, zuvor geprüfte ID `_1WjM7ucekc`): Titel, 3:00:22, Drama 2023, FSK12, Quelle `Filme & Shows von YouTube`; Button **„Kaufen oder ausleihen“**. TMDB-DE-Provider 192 hatte im echten Detailbericht bisher **nur `buy`**. Deshalb **mögliche Tarifabweichung**, bis der echte Kauf-/Leihdialog separat vorliegt. Kein genauer Preis sichtbar; generische Buttonbeschriftung ist kein transaktionsfähiger Nachweis für beide Einzeloptionen.
- **Der Pate** (`movie:238`, zuvor geprüfte ID `xcCsnx-GRkA`): Titel, 2:55:28, FSK16; Buttons **„Als Mitglied ansehen“** und **„Kaufen oder ausleihen“**. TMDB DE YouTube 192 hatte `rent,buy`, aber **keinen** YouTube-Premium/YouTube-Free-Treffer. Der zusätzliche **Mitgliedschaftszugang** ist real als UI-Option beobachtet, **welcher konkrete Abo-/Primetime-Kanal** dahintersteht ist noch unklar. Nicht als Premium oder allgemeines `flat` einordnen. UI-Metadaten zeigen **„Drama · 1977“**, obwohl das bekannte Werkjahr **1972** ist; Jahresabweichung als Matching-Warnung markieren.
- **Nightmare Before Christmas** (`movie:9479`): in dieser Nutzerlieferung **kein** UI-Screenshot; TMDB DE `rent,buy` bleibt unabhängige Datenquellenangabe, Shop-Button unbekannt.

**Evidenzdisziplin:** Die Bilder stammen aus **YouTube-Suchergebnissen**, nicht aus dem geöffneten Preis-/Mitgliedschafts-Folgedialog. Keine Preiszahl, Zahlungsberechtigung, werbefreie Vollfilmwiedergabe oder genaue Aboidentität beobachtet. Deshalb keine neuen produktiven `R&B`, `free`, `ads`, `flat`-Badges und keine Änderung am Katalog. Die vollständige tabellarische Analyse sowie separate Status- und Qualitätsfelder sind unter [G1 Monetarisierung – Abschnitt 9](_work/YOUTUBE_MOVIES_G1_MONETIZATION_EVIDENCE_2026-10-21.md) dokumentiert.

**Gezielter nächster Test ohne Kauf:** Bei Oppenheimer nur Kauf-/Leih-Auswahldialog anzeigen; bei Der Pate nur Mitgliedschafts-Ziel/Anbieter anzeigen; jeweils Preis, Region und angezeigte Aboidentität notieren. Danach kann die konkrete Differenz TMDB-Angebot ↔ reale YouTube-Shop-UI geklärt werden, ohne weitere Catalog-Discovery-Loops. Issue #388 bleibt G1 offen.

---
## 1. Projektübergabe und Entscheidung

Matthias hat am **16.10.2026** das Gesamtpaket **Mitteilungen** als abgeschlossen erklärt; **#314 und #385** sind danach mit `completed` geschlossen worden. Die Teilpakete **#380–#384** sind ebenfalls geschlossen und zuvor fachlich abgenommen. Zusätzliche Meldungsfamilien sind Ideen für später, **keine aktuelle Aufgabe**. Die in #385 mit dokumentierten TV-/Provider-Korrekturen wurden technisch veröffentlicht; daraus wird keine undokumentierte weitere visuelle Geräteabnahme abgeleitet.

**Neue Hauptstrecke:** Quellenfundament durch unabhängige Adapter ausbauen. **YouTube kommt zuerst**, danach DVB-I und Prime Video als separat freizugebende Pakete. Das Ziel ist eine robuste, breitere Film-/Serienverfügbarkeit und konkrete Wiedergabewege – nicht eine Sammlung unkontrollierter URLs.

## 2. Priorität und Schnitt der Arbeitspakete

| Reihenfolge | Issue | Inhalt | Aktuelle Phase | Freigabegrenze |
| --- | --- | --- | --- | --- |
| 1 | [#388 YouTube](https://github.com/matthias-ennen/movie-hub/issues/388) | Vollständige legale Filme aus zulässigen Playlists/Publisher-Quellen, TMDB-Matching, genaue Video-Route | **Analyse und kleiner nichtproduktiver Datenpilot** | Kein Import in produktiven Movie-Hub-Katalog vor Daten-, Recht-, Match- und Geräteprüfung |
| 2 | [#336 DVB-I](https://github.com/matthias-ennen/movie-hub/issues/336) | Deutsche Service-Liste, EPG, Live-Playback-Signalisierung | Quellen- und Zugangsrecherche | Kein produktiver Adapter ohne nachgewiesenen erlaubten, verlässlichen Produktionszugang |
| 3 | [#391 Prime Video](https://github.com/matthias-ennen/movie-hub/issues/391) | Titelgenaue GTI-/Content-ID, Fire-TV-Absprung | IDs und offiziell unterstützte Wege validieren | Kein automatischer Import, solange keine tragfähige ID-Quelle/Zuordnung besteht |
| später | neue Teilissues unter #271 | offizielle Free-TV-, Mediathek- und FAST-Quellen | Kandidatensuche | Jede Quelle eigener Go/No-Go-Prozess |

Die Reihenfolge ist eine **Arbeitspriorität**, keine Zusage, alle drei Adapter produktiv integrieren zu können. Ein No-Go beendet einen Pilot sauber, ohne die Quellenarchitektur zu verbiegen.

## 3. Unveränderliche Architektur- und Qualitätsregeln

1. **Titelidentität:** `Medientyp + TMDB-ID` ist kanonisch. YouTube-Video-ID, DVB-I-Service-/Event-ID und Prime-GTI werden **separat als Quellen-/Playback-IDs** verwaltet.
2. **Neutrale Datenstrecke:** unabhängiger Adapter → Quellenevidenz und SourceEnvelope → konservatives Titelmatching → normalisierte Verfügbarkeit/PlaybackRoute → validierte, atomare Veröffentlichung → bestehender Movie-Hub-Lesepfad.
3. **Kein zweiter Metadatenstamm:** Filme/Serien bekommen keine parallelen Titel, nur zusätzliche nachgewiesene Angebote, ggf. mit Gültigkeitsfenster und Quelle.
4. **Provenienz:** Herkunft, abgefragte Generation, Zeitpunkt, Gültigkeit, DE-Eignung, Matching-Sicherheit und Ablehnungsgrund diagnostizierbar halten; unklare Werte nicht erfinden.
5. **Anbieter versus Wiedergabe:** Der tatsächliche Anbieter bleibt erkennbar. Die Route führt zum **exakten** Film bzw. zur richtigen Ausstrahlung; ein bloßer allgemeiner Anbieterstart darf nicht als „direkt abspielbar“ ausgegeben werden.
6. **Fehlerisolation:** Ausfall, Fehlzuordnung, Quota-Problem oder abgeschnittene Antwort eines Adapters dürfen andere Quellen sowie den letzten gültigen veröffentlichten Datenstand nicht zerstören. Ablauf/Entzug einzelner Angebote kontrolliert behandeln.
7. **Leistung und Sicherheit:** keine neuen Netzwerkaufrufe pro Poster, kein Scraping/DRM-Bypass, keine öffentlichen Secrets, keine ungesicherte Massenerfassung. Bestehenden inkrementellen Nachtlauf und Test-/Diagnosepfad möglichst wiederverwenden.
8. **Produktgrenze:** `FLAT`, `FREE`, `ADS`, `RENT`, `BUY`, `AIR` strikt nach belegtem Angebots-/Sendekontext; keine Vermischung oder automatisch erfundenen Labels.

## 4. Erstes Paket #388 – YouTube: bestätigte Recherche

**Quellenstand der folgenden Angaben: 16.10.2026.** Die folgenden Ergebnisse beruhen auf den offiziellen veröffentlichten Dokumentationen und dem bereits angelegten Issue #388; **es gab noch keinen authentifizierten YouTube-API-Abruf und keinen realen Fire-TV-Wiedergabetest dieses Adapters**.

### G1-Ergebnis (16.10.2026) – 200er-Inventarisierung erfolgreich

**Live belegt:** [YouTube G1 Inventory Run #38878217586](https://github.com/matthias-ennen/movie-hub/actions/runs/38878217586), alle Schritte grün. [Messdetails und methodische Abgrenzung](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--vollständige-playlist-id-inventarisierung-und-200er-stichprobe-erfolgreich-16102026).

- **Vollständiges ID-Inventar dieser beiden spezifischen Playlists:** **24 CiNENET**-Themenplaylist-Einträge + **2.766 Netzkino**-Uploadliste-Einträge; 57 Seiten erfolgreich gelesen. **Keine Behauptung, 2.790 geprüfte Filme oder der komplette CiNENET-Kanal seien erschlossen.**
- **Zeitlich verteilte 200er-Probe:** **200/200** Videometadaten erfolgreich; davon **174 Langvideo-Kandidaten** (≥45 Min), **21 Clips** (unter 20 Min), **4 mittlere Videos** (20–44 Min) und **1 Video aus anderem Kanal innerhalb der CiNENET-Playlist** (separate Herkunftsprüfung).
- **DE-Metadaten:** **194** explizite `regionRestriction.allowed`-Signale für DE, **6** ohne solche Eindeutigkeit, keine ausdrückliche DE-Sperre in der Probe; **kein Playbackbeweis**.
- **API-Aufwand:** 64 lesende Calls, keine Katalog-/Firebase-/Adapter-/Nightly-Schreiboperationen. Secret- und WIF-Pfad nachgewiesen.
- **Interne Priorisierung:** `viewCount`-Ranking für die 200er-Stichprobe gelungen, **keine** weltweite oder kanalweite Aufrufzahlrangliste. Datenbeschaffung (seitenweises Inventar) bleibt getrennt von nachgelagerter Priorisierung und kanonischer TMDB-Identität.

**Nächstes Gate:** hochwertige, **nichtproduktive TMDB-Matchinganalyse** der 174 Kandidaten, inklusive Titel-/Originaltitel-/Jahr-/Laufzeitprüfung, Konfidenz, unsicherer Fälle und Überschneidungen mit dem bestehenden MovieHub-Katalog. Danach rechtliche Verfügbarkeit und echte DE-/Fire-TV-Wiedergabetests. **Keine Freigabe für Produktivimport oder neue Badges. #388 bleibt offen.**

### G1-Kodi-Nachprüfung live abgeschlossen: fünf Filmhinweise zur Sichtprüfung, Spider mehrdeutig

**Echter Live-Nachweis:** [YouTube G1 TMDB Match Research #38895558740](https://github.com/matthias-ennen/movie-hub/actions/runs/38895558740), **SUCCESS**. Die vormals sechs gefundenen TMDB-Suchhinweise wurden gegen zentralen Matcherscore, weitere konkurrierende Kandidaten, TMDB-Jahr und Videolaufzeit erneut geprüft: **fünf `priority-manual-review`** (`movie:13998`, `11595`, `14359`, `150`, `45881`) mit Laufzeitdifferenzen von **0,2 bis 2,4 Minuten**. **Spider bleibt `ambiguous-or-weak`**; vollständigerer Kandidatenvergleich meldete `movie:9613` gegen `movie:615750` und ungenügenden Score-Abstand. Die Top-3-Suchergebnisliste aus dem früheren A/B-Pilot war ausdrücklich keine vollständige Matchingentscheidung.

**Kodi-inspirierte en-US-Suche der übrigen 14 Videos:** **10 `no-results`**, **4 `results-but-no-exact-alias`**, **0** neue identifizierte TMDB-Kandidaten; **14** Suchabfragen auf Seite 1, **0** auf Seite 2, da nirgends weitere Ergebnisseiten gemeldet wurden. Gesamtverbrauch aller G1-Stufen: **327/420** echte TMDB-Requests inklusive Retry. **Baseline 10 `provisional-identity` / 117 `review` / 47 `unmatched` bleibt unverändert.**

**Nächste fachliche Gate-Reihenfolge:** (1) Tatsächliche menschliche Sichtprüfung ausgewählter Fünfer- und 18er-Prüffälle auf Werk, Vollfilm, DE-/Android-/Fire-TV-Wiedergabe, Kosten/Anmeldung und Publisherrechte; (2) bei übrigen unklaren Titeln bessere **Publisher-/Originaltitel-Metadaten**, nicht unnötige zusätzliche Seiten/Sprachen; (3) kanonischer Dubletten-/Bestandsvergleich gegen **echte** MovieHub-Live-Daten, nicht GitHub-Fallback. **Auch fünf sehr plausible Hinweise sind keine fünf final gematchten oder frei nutzbaren Filme.** Produktivadapter, G2/G3/G4, Badges, Nachtlauf und Firebase bleiben gesperrt.

[Vollständiger Messbericht samt Videolinks, Spider-Erklärung und Ablehnungsgründen](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--kodi-inspirierte-nachprüfung-16102026).

### Historische Vorbereitungsphase vor dem Live-Nachlauf

### G1-Folgeanalyse vorbereitet: sechs neue Filmhinweise und 14 Suchprobleme

Auf Basis des echten G1-A/B-Berichts (**6** neue TMDB-Suchhinweise aus 20 wiederholten Nichttreffern, bisherige Baseline **10/117/47** unverändert) wird die Kodi-inspirierte Kandidatensuche in den bestehenden **read-only** YouTube-/TMDB-Forschungsworkflow integriert.

**Prüfspur A – sechs Kandidaten:** Sämtliche bekannten konkurrierenden TMDB-Ergebnisse werden erneut mit dem **zentralen Waipu-TMDB-Scorer** bewertet; nur bei eindeutigem und exakt passendem Titel wird TMDB-Jahr und Laufzeitdifferenz des YouTube-Videos zusätzlich geprüft. `Spider` mit mehreren möglichen IDs bleibt ausdrücklich eine Mehrdeutigkeit. Das Resultat ist allenfalls **`priority-manual-review`**, niemals automatische Film-/Provider-Freigabe.

**Prüfspur B – 14 ohne weitere Titelvariante:** Streng begrenzte `en-US`-Recherche auf derselben Quellstichprobe; zweite TMDB-Seite nur bei `total_pages>1`, nie mehr als zwei Seiten. Die additive `WaipuTmdbSearchClient.searchDiagnostic`-Methode nutzt **dieselbe API-Budget-/Cache-/Rate-Limit-Logik**, während die bestehende produktive `search()` unverändert bleibt. Max. 28 zusätzliche Suchrequests vor Cache; Gesamtdeckel **420 TMDB**, **90 YouTube**. Nur diagnostische Suchhinweise.

**Status:** Code/Tests vorbereitet, neuer Live-Diagnoselauf steht noch aus; keine Produktiv-/Quellen-, Badge-, Firestore-/Firebase- oder Playback-Änderung. [Methodik und Gate-Definition](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-folgearbeit-vorbereitet--sechs-suchhinweise-streng-nachprüfen-kodi-suchkaskade-begrenzt-testen). **#388 bleibt offen, G2 nicht freigegeben.**

### G1-A/B-Livebefund: 6 neue TMDB-Suchhinweise und Kodi-Architekturvergleich

**Echter Live-Lauf:** [YouTube G1 TMDB Match Research #38892290414](https://github.com/matthias-ennen/movie-hub/actions/runs/38892290414) vollständig **grün**. **Identische 20** aus 47 `unmatched`-Video-IDs erneut untersucht: mit dem alten Suchdiagnosepfad **0** zusätzliche TMDB-Hinweise (25 Suchfunktionsaufrufe); die neue quellneutrale Bereinigung gewann bei **6 von 20 Videos** mindestens einen weiteren Kandidaten mit nur **7** zusätzlichen TMDB-Suchfunktionsaufrufen. **14** Videos blieben ohne sicher neu ableitbare Suchvariante. Gesamtworkflow **308/420** echte TMDB-Anfragen einschließlich der unveränderten Baseline und des Jahresvergleichs.

Die sechs Fälle betreffen `Margot und die Hochzeit` (TMDB 13998), `Und wieder 48 Stunden` (11595), `Glaubensfrage` (14359), `Spider` (**mehrdeutige TMDB-IDs**), `Nur 48 Stunden` (150) sowie `Die Brücke von San Luis Rey` (45881). Für `Nur 48 Stunden` wurde ebenfalls eine offensichtlich werbliche, unnötige zweite Titelfassung erzeugt: gezieltes künftiges Qualitätsgate. **Alle sechs sind nur Suchhinweise, kein MovieHub-Match. Die Baseline bleibt 10 `provisional-identity`, 117 `review`, 47 `unmatched`.**

**Zusätzlich Kodi-Originalcode/Wiki untersucht:** Der offizielle [Kodi-TMDB-Filmscraper](https://github.com/xbmc/metadata.themoviedb.org.python) belegt kontrollierte Suchkaskaden (Jahr, ±1, ohne Jahr), ggf. zweite TMDB-Ergebnisseite, getrennte Such-/Anzeigesprache, exakte TMDB-/IMDb-IDs, Ergebnispriorisierung/Manuell-Auswahl und fallbackbasierte Detailanreicherung. **Für MovieHub übernehmen wir nur konzeptionelle Suchideen**: breite, begrenzte Kandidatenfindung → unveränderte, **strenge** zentrale Identitätsentscheidung. TMDB-Popularität und alternative Jahre sind höchstens Sortier-/Recall-Signale; **niemals automatische Freigabe**. Der Kodi-Scraper ist **GPL-2.0-or-later**; **kein Quelltext oder API-Key übernommen**. Kodi-interne YouTube-`plugin://`-Links taugen nicht als Android-/Fire-TV-Wiedergaberoute.

**Nächstes G1-Gate:** die sechs Hinweise inkl. `Spider`-Mehrdeutigkeit konservativ durch gemeinsamen Matcher, Jahr, Originaltitel und tatsächliche Video-/TMDB-Laufzeit abgleichen; dann die 14 weiterhin unklaren Fälle begrenzt über ergänzende Suchsprache bzw. weitere Kandidatenseite testen und Ergebnis sowie API-Budget messen. Echte manuelle 18er-Filmsichtung, DE-/Fire-TV-Playback und Rechtefrage bleiben gesondert offen. **Kein G2, keine neuen YouTube-Badges oder produktiven Änderungen.**

[Gesicherte Messwerte, vollständige Videolinks und Kodi-Referenzanalyse](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--neuer-suchtext-parser-6-statt-0-suchhinweise-16102026).

### Historischer A/B-Plan vor dem erfolgreichen Lauf

### G1-Titelqualität – quellneutraler Parser und A/B-Vergleich vorbereitet

Nach der echten [G1-Liveprobe #38889900636](https://github.com/matthias-ennen/movie-hub/actions/runs/38889900636) (20 aus 47 `unmatched`, 25 zusätzliche TMDB-Suchen, 0 neue Hinweise) wurde eine streng begrenzte **quellneutrale Query-Bereinigung** vorbereitet. Sie trennt **eindeutig erkennbare Darsteller-Werbeformeln, Publisher-Prefixe und Genre-/Format-Footer** von möglichen Filmtiteln, ohne Werktitel mit Bindestrich pauschal zu zerschneiden.

Ein A/B-Diagnoselauf gegen **dieselben maximal 20 unverändert `unmatched` gebliebenen YouTube-Videos** vergleicht die früheren Suchtexte mit **höchstens zwei tatsächlich zusätzlichen** Varianten pro Video (max. 40 Query-Aufrufe). Auch gute neue TMDB-Hinweise bleiben **reine Suchkandidaten**; zentraler Waipu-/Joyn-Matcher, Score-/Margin-/Jahres-/Laufzeitgates, kanonischer Filmvertrag und Bestandsstatus werden nicht verändert.

**Stand:** implementiert und mit Regressionstests versehen, **Live-Ergebnisse der neuen A/B-Diagnose ausstehend**. Manuell nur nach grüner PR-CI/Android-Freigabe starten; bestehendes Limit 420 TMDB-Requests inklusive Retry beibehalten. Keine Cloud-/Firebase-Schreibzugriffe, kein YouTube-Provider-Badge, keine automatische Filmaufnahme. [Methodik und bewusst verbotene Sonderregeln](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-ausbau--erklärbare-quellunabhängige-titelbereinigung-und-ab-diagnose-vorbereitet).

### G1-Sichtprüfliste und `unmatched`-Diagnose real durchgelaufen – nächster Titelqualitäts-Fokus

**Nachweis:** [YouTube G1 TMDB Match Research #38889900636](https://github.com/matthias-ennen/movie-hub/actions/runs/38889900636), komplett **grün**, ausschließlich lesend. Die bestehende **Baseline 10 provisorische Identitäten / 117 Reviews / 47 unmatched** blieb unverändert. Der Forschungsworkflow hat aus den 79 priorisierten Kandidaten eine **divers verteilte Liste von 18 konkreten YouTube-/TMDB-Paaren** mit gültigen Links, Filmjahr und Laufzeitabweichungen erstellt; alle 18 stehen weiter ausdrücklich auf **`offen`**, keine tatsächliche menschliche Film-/DE-/Fire-TV-/Rechteabnahme.

Von den bisherigen **47 `unmatched`** wurden **20** in einer getrennten, streng begrenzten Alternativtitelsuche untersucht. **19** blieben ohne TMDB-Suchresultat, **1** besaß keine sichere alternative Suchform. Die Diagnose führte **25** weitere TMDB-Suchaufrufe aus; die echte Gesamtsumme stieg von **276 auf 301** (Budget 420).

**Interpretation für die Architektur:** Die vorherige Query-Aufbereitung lässt häufig Filmschauspieler, Marketing- und Genrefragmente in den Suchstrings stehen; die Suche scheitert also potenziell am Suchtext, **nicht** zwingend an fehlenden TMDB-Titeln. Das nächste kleine G1-Qualitätspaket ist ein **konservativer, erklärbarer Titel-/Werbetextparser**, dessen Vorher-/Nachher-Vergleich zuerst die 20 realen Nichttreffer und dann begrenzt weitere der 47 testet. Der zentrale Waipu-/Joyn-Matcher, der Filmidentitätsvertrag und Produktiv-Schwellenwerte bleiben unverändert. Separat: **wirkliche menschliche Video-/Playback-Sichtprüfung** der dokumentierten 18 Fälle, später kanonischer Live-MovieHub-Katalogabgleich und Anbieterrechts-/Kostenprüfung.

**Detaillierter Livebericht mit allen 18 Video-/TMDB-Paaren:** [YouTube-Forschungsdokument](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--18er-sichtprüfliste-und-unmatched-suchdiagnose-erfolgreich-erzeugt-16102026). **Keine produktive Quellenaufnahme, keine YouTube-Badges und keine G2-Freigabe.**

### Historische Vorbereitung der 18er-/20er-Diagnose

### G1-Nächste Qualitätsanalyse: Prüfliste und 47 Nichttreffer (vorbereitet)

Nach dem echten G1-Jahreslückenvergleich (**79** priorisierte und **32** ungeklärte Fälle bei weiterhin **10/117/47** Baseline) wird als nächste **nur manuell auszulösende Diagnose** eine **über Laufzeitdifferenz und Filmjahr gestreute Sichtprüfliste mit höchstens 18 YouTube-/TMDB-Linkpaaren** erzeugt. Alle Einträge sind ausdrücklich **ungeprüft**, bis das konkrete Video hinsichtlich Filmidentität, Vollständigkeit, deutschem Playback auf Geräten, Anmeldung/Kosten und Verbreitungsrechten tatsächlich überprüft wurde.

Die separaten **47 `unmatched`** erhalten im selben schreibgeschützten Test nur eine **auf höchstens 20 Videos / 40 Titelsuchvarianten begrenzte** diagnostische TMDB-Suche bei eindeutig entfernbaren Werbezusätzen; kein automatisches Matching oder pauschales Zerlegen mehrteiliger Filmtitel. Ohne sichere Suchalternative bleibt `no-safe-query-variant` im Bericht stehen. Vorhandener Matcher, Quellenvertrag, Quotenlimits und bestehende Geheimnisse bleiben unverändert.

**Status:** Implementierung/Tests im G1-Pilot vorbereitet, **kein erneuter Live-Test dieser Zusatzdiagnose** und **keine manuelle Film-/Playback-/Rechteabnahme** bisher. Workflow und Ergebnisse nach grüner CI auf Basis echter Daten getrennt prüfen. [Methodik](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-folgepaket--konkrete-sichtprüfliste-und-separate-unmatched-suchdiagnose-vorbereitet). **G2 nicht freigegeben.**

### G1-Jahreslückenvergleich erfolgreich – 79 von 111 Fällen für die manuelle Prüfung priorisiert

**Tatsächlicher Live-Nachweis:** [Read-only Run #38886597861](https://github.com/matthias-ennen/movie-hub/actions/runs/38886597861), vollständiger Job-Erfolg. Baseline auf exakt derselben 200er-YouTube-Stichprobe unverändert: **174** TMDB-untersuchte Langvideos, **10** vorläufige Identitäten, **117** Reviews, **47** `unmatched`. Von den **111** Reviews ohne explizites Filmjahr im YouTube-Videotitel wurden nach exaktem TMDB-Lokal-/Originaltitel, Kandidatenabstand und verifizierter Laufzeitdifferenz von höchstens zehn Minuten **79** als **`priority-manual-review`** priorisiert (rund 71 %). **32** der 111 bleiben ohne genügend zusätzliche Evidenz: 16 fehlende exakte Titelaliases, 12 mehrdeutige/schwache Kandidaten, 3 Laufzeitkonflikte, 1 fehlendes Laufzeitdetail.

**API-Aufwand:** **276** tatsächliche TMDB-Requests inkl. Retry (Baseline + Zusatzanalyse; Obergrenze 420), von denen die Vergleichsanalyse 82 ergänzende Detailabfragen vor Client-internem Cache benötigte. Keine Änderung der produktiven Matcher-/Quellenregeln, kein Import und keine Firestore-/Firebase-Schreiboperation.

**Wesentliche Trennung:** `priority-manual-review` ist **keine neue Identitätsfreigabe**. Es bleiben weiterhin 117 Reviews, nicht automatisch 79 zusätzliche „fertige Filme“. Die **47 `unmatched`** sind ein separates Problem der Titel-/Suchqualität. Echte DE-/Fire-TV-Wiedergabe, zulässige Rechte und der Abgleich mit dem aktuellen veröffentlichten MovieHub-Katalog bleiben offen.

**Nächstes G1-Gate:** Einzelfallprüfung einer repräsentativen Teilmenge der 79 priorisierten Videos und gezielte Fehleranalyse der übrigen 32 plus der 47 nicht gefundenen Kandidaten; Ergebnisse nach den bestehenden, zentralen Identitäts- und Quellenverträgen bewerten. Keine Lockerung des Waipu-/Joyn-Produktivmatchings, keine G2-Freigabe. [Vollständiger Livebericht mit Beispieltiteln und Zahlen](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--zusätzlicher-evidenzvergleich-ohne-filmjahr-erfolgreich-16102026).

### Historische Vorbereitung vor dem erfolgreichen Vergleichslauf

### G1-Datenqualität: konservativer Vergleich für 111 Video-Titel ohne Filmjahr (vorbereitet)

**Zusatzdiagnose zum gleichen 174er-TMDB-Sample:** Nach den Live-Ergebnissen mit 10 vorläufigen Identitäten, 117 Reviews und 47 ohne Kandidaten soll eine **zweite Evidenzschicht** die **111 Reviews ohne explizites Filmjahr** auf *manuell lohnende Fälle* reduzieren. Der bestehende Waipu-TMDB-Matcher und die Baseline-Kategorien werden nicht verändert oder aufgeweicht. Ein Review erhält **keine automatische TMDB-Identität**.

Die nur manuell ausführbare Forschungsstrecke ergänzt bei exakt passendem TMDB-Lokal- oder Originaltitel, vorhandener Matcher-Eindeutigkeit und einer Laufzeitdifferenz ≤10 Minuten den Status **`priority-manual-review`**. Das ist nur eine *Prioritätsliste für menschliche Sichtprüfung* – keine Nachweisführung zu identischem Werk, Filmrechten, kostenlosen Angeboten oder DE-/Fire-TV-Abspielbarkeit. Fehlende Belege bleiben als `insufficient` nachvollziehbar. Einheitlicher Matcher und Quellen-/Katalogvertrag bleiben verbindlich.

**Status:** Code/Regressionstests vorbereitet, echte Vergleichszahlen stehen noch aus. Workflow nach grüner CI nur manuell starten. [Methode und Ausschlussgründe](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1--vergleichsdiagnose-ohne-filmjahr-vorbereitet-16102026). **Keine Produktivänderung und keine G2-Freigabe.**

### G1-TMDB-Livelauf – technische Zuordnung erfolgreich, Qualitätsgates noch offen

**Beleg:** [GitHub Actions #38884328789](https://github.com/matthias-ennen/movie-hub/actions/runs/38884328789) ist **vollständig grün**; kombinierter YouTube-/TMDB-API-Test nutzt den **vorhandenen Waipu-Matcher v5**. **200** untersuchte Videos, **26** Quell-/Laufzeit-Ausschlüsse, somit **174** analysierte Langvideos; davon **10** starke *vorläufige* Identitäts-Hypothesen, **117** prüfpflichtige Kandidaten und **47** ohne hinreichenden TMDB-Kandidaten. **194 TMDB-API-Aufrufe** durchgeführt. Eine potenzielle Dublettengruppe bei `movie:304613` unter YouTube-Videos; kein verifizierter Live-MovieHub-Dublettenabgleich.

**Entscheidender Befund:** Bei **111** Videos fehlt das vom Erstpilot zur automatischen vorläufigen Bestätigung vorgeschriebene ausdrückliche Filmjahr im YouTube-Titel; dadurch allein sinkt die strenge Zuordnungsrate auf 10/174. Das ist **kein** Beweis für fehlende TMDB-Identität, schlechte YouTube-Quellen oder angeblich 164 ungeeignete Filme. Die Matchingregeln dürfen nicht unbemerkt gelockert werden.

**Nächstes separates G1-Gate:** konservative, universelle Evidenzanreicherung für unvollständige YouTube-/Publisher-Titel und Vergleichsmessung auf derselben Stichprobe. TMDB-Titel/Originaltitel/Jahr/Laufzeit gemeinsam validieren, mehrdeutige Varianten in Review belassen, die 47 Suchausfälle diagnostizieren. Anschließend mit tatsächlichem kanonischen Live-Katalog vergleichen und echte DE-/Fire-TV-Wiedergabe sowie erlaubte Angebotsklasse separat prüfen.

**Freigabestatus:** YouTube API/Inventar/Matchingdiagnostik technisch nachgewiesen, **noch kein freigegebener Produktivadapter oder neue Anbieter-Badges**. [Detaillierter Originalmessbericht](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-livebefund--erster-kombinierter-youtube-tmdb-matchinglauf-16102026). #388 offen.

### Historischer vorbereiteter TMDB-Pilot (vor dem erfolgreichen Liveabruf)

### G1-Folgepaket vorbereitet – konservatives YouTube-/TMDB-Matching (noch nicht ausgeführt)

Nach erfolgreicher YouTube-Inventarisierung von 2.790 IDs und 200/200 Video-Metadaten folgt die **identitätsorientierte Analyse der 174 Langvideo-Kandidaten**. Der getrennte, ausschließlich manuelle Diagnoseworkflow `YouTube G1 TMDB Match Research` kombiniert das bestehende G1-Inventar mit dem **bereits in MovieHub vorhandenen Waipu-TMDB-Matcher** und seinem TMDB-Suchclient. Die vorhandene Logik für kanonische Identität, Titel-/Jahr-Konfidenz und Mehrdeutigkeiten wird wiederverwendet, statt einen Youtube-Sondermatcher zu bauen.

Für eine **vorläufig starke Zuordnung** müssen zusätzlich zu einer positiven Matchentscheidung ein explizites Filmjahr aus dem Videotitel und eine TMDB-Laufzeitdifferenz von höchstens 15 Minuten vorliegen. Unbekannte Jahre, unklare Titel und Konflikte gehen in den Prüf-/Review-Pfad. Mehrfache YouTube-IDs mit derselben TMDB-ID werden als **potenzielle Quellen-Dubletten** protokolliert. Eine belastbare **Überschneidung mit dem Live-MovieHub-Katalog** ist hier noch nicht geprüft und wird nicht aus dem leeren `public/catalog.json`-Fallback abgeleitet.

**Betriebsgrenzen:** max. 200 YouTube-Videos, 90 YouTube- und 420 TMDB-Requests, ausschließlich öffentliches Research-Reporting, beide Schlüssel geschützt, keine Produktiv-/Firebase-Schreibzugriffe. **Ausführung und Ergebnisanalyse ausstehend**; TMDB-Treffer sind weiterhin kein Nachweis einer legalen, kostenlosen oder aus Deutschland auf Fire TV abspielbaren Quelle. [Detaillierte Methodik](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-fortsetzung--youtube-zu-tmdb-matchingpilot-vorbereitet-16102026).

### Historischer Plan vor dem erfolgreichen 200er-Run

### G1-Folgepilot – vollständiges Quelleninventar, 200-Videos-Stichprobe und internes Ranking

**Neu vorbereitet, noch nicht durchgeführt:** manuell startbarer **schreibgeschützter** Workflow `YouTube G1 Inventory Pilot (200)`. Er inventarisiert die vorhandenen CiNENET-/Netzkino-Playlist-IDs seitenweise und bildet daraus bis zu 200 eindeutig bestimmte Video-IDs mit **zeitlich verteilter Netzkino-Stichprobe** statt bloß der neuesten Uploads. `videos.list` ergänzt Laufzeit, Regionssignale und `statistics.viewCount`; ein transparentes Ranking gilt **nur innerhalb der untersuchten Stichprobe**. Filter trennt Shorts/Clips, mittellange und lange Videos. [Reproduzierbare Methodik und technische Gates](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-vertiefung--größere-zeitlich-verteilte-stichprobe-in-vorbereitung-16102026).

**Grenzen:** maximal 70 Seiten je Playlist, 90 API-Aufrufe, 200 Videos; bei unvollständigen Quellen oder Fehlern Abbruch. Keine Google-Suche zur vermeintlichen Komplettinventarisierung, keine TMDB-Matches, keine automatische Bestätigung von Vollfilm/DE-/Gratisangebot, kein Cloud-/Produktivimport. Echte Zahlen erst nach manuellem Lauf; spätere TMDB-Zuordnung und Geräteproben gesondert.

### G1-Messergebnis vom 16.10.2026 – erste echte Quellenprobe erfolgreich

**Beleg:** [GitHub Actions Run #38874604617](https://github.com/matthias-ennen/movie-hub/actions/runs/38874604617); **auslesbarer Bericht** in Job-Logs und temporärem Artefakt. [Detaillierte Quantifizierung, Filterbefunde und offene Gates](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1--quantitativer-erstbefund-youtube-data-api-liefert-echte-filmdaten-16102026).

- **CiNENET-Themenplaylist:** 24 Gesamt-Playlist-Einträge; 12 gelesen, alle 12 Videos über `videos.list` aufgelöst.
- **Netzkino-Upload-Playlist:** 2.766 Playlist-Einträge laut API; 12 gelesen, alle 12 Videos aufgelöst. **Uploadliste ist kein Nachweis von 2.766 vollständigen Filmen!**
- **Gesamtprobe:** **24/24 eindeutige Videos mit Detailmetadaten**; **22** mit `DE` in der `allowed`-Liste, **2** ohne ausdrückliches DE-Signal, **0** ausdrücklich als für DE blockiert gemeldete Videos. **1 eindeutiger Nichtfilm-Short (32 Sekunden)** in Netzkino-Uploads.
- **Technik/Betrieb:** 6 erfolgreiche, rein lesende YouTube-API-Aufrufe. Workload Identity, Secret Manager, YouTube API, GitHub-Bericht/Artefakt erfolgreich. Kein Live-Import, keine Änderung am produktiven MovieHub.
- **Noch nicht abgeleitet:** rechtlich belegte Vollfilme, tatsächliche kostenlose DE-Wiedergabe, eindeutige TMDB-Matches, Überschneidungen mit bestehendem Netzkino-Katalog, Fire-TV-Playback.
- **Nächste Untersuchung:** systematischer, nichtproduktiver **100–200-Videos-G1-Datenpilot** mit Pagination, Vorfilter für Trailer/Shorts, konservativer TMDB-Zuordnung und separaten Gerätetests. Weitere Code-/Infrastrukturschritte getrennt bewerten und freigeben, keine automatische Produktivsetzung.

**Status:** G0 erfolgreich, **G1 erste technische Datenprobe nachgewiesen**, erweiterte G1-Analyse noch offen; **G2–G4 nicht beauftragt**.

### Historischer Zwischenstand vor dem erfolgreichen G1-Lauf

### G1-Fortsetzung vom 16.10.2026 – Zugangsgate statt erfundener Datenprobe

**Verschobener Testschritt:** Der vereinbarte reale YouTube-Datenpilot wurde begonnen, konnte aber **noch keinen authentifizierten YouTube-API-Datenabruf** durchführen: In der aktuellen Werkzeugverbindung steht kein verwendbarer YouTube-API-Key und kein Zugriff auf Google-Cloud-API-Aktivierung/Secret Manager zur Verfügung. Daraus folgt **nicht**, dass im Google-Projekt noch kein Key existiert; dieser Zustand ist bislang **unbestätigt**.

**Neue konkrete Primärquellen-Evidenz:** UCM.ONE verlinkt selbst die CiNENET-Deutschland-Playlist „Silvester 2025“ mit `playlistId=PLnJg6MSfgQqnIcJ492cEmZCeTsLOoZzfD`. Die ID und eine exakt definierte `channels.list → playlists.list → playlistItems.list → videos.list`-Probe stehen im [G1-Zugangsprotokoll](_work/YOUTUBE_API_RESEARCH_2026-10-16.md#g1-zugangsprüfung-und-konkretisierte-datenprobe--16102026). Die Zahl der heute enthaltenen Videos ist **nicht gemessen**; eine kleine Jahreswechsel-Playlist allein muss nicht die geplanten 100–200 Fälle liefern. Bei gültigem Zugang andere offiziell kuratierte Kanalplaylists/Uploads ergänzen; kein Scraping.

**Entscheidungsgrenze:** Nichtproduktiver Abruf kann nach geklärtem Projektzugang starten. Kein Code/Secret/Cloud-Deploy in dieser Fortsetzung; #388 bleibt offen, G1-API-Datensample weiterhin ausstehend.

### G0-Nachtrag vom 16.10.2026 – vertiefte YouTube-API-Recherche

**Dokumentiert:** [YouTube Data API – Methoden, Feldmatrix, aktuelle Quotas, Rechte-/Caching-Regeln, Quellenkandidaten und G1-Pilotvorschlag](_work/YOUTUBE_API_RESEARCH_2026-10-16.md).

- **G0 abgeschlossen als Recherche**, **G1 noch nicht ausgeführt**: keine Live-API-Antworten, keine echten Videozahlen oder Geräteergebnisse vorgetäuscht.
- **Kontingentstand 15.10.2026:** YouTube hat die offizielle Quota-Tabelle aktualisiert. `search.list` jetzt eigener Tages-Bucket **100 Aufrufe**, **1 Einheit je Suche**; übrige `playlistItems.list`, `videos.list` etc. jeweils 1 Einheit und typischer Gesamt-Bucket 10.000 Einheiten/Tag. Der 200-Video-Playlist-Pilot läge rechnerisch bei 8 List-Aufrufen vor Zusatzabfragen.
- **Quellenempfehlung:** zuerst der deutsche Publisher **CiNENET Deutschland / UCM.ONE** (laut Betreiber lizenzierte AVOD-Filme), **Netzkino / PLAION** als Kontrollkanal. Offizielle DE-Primetime-Angebote sind vorhanden, aber der vollständige deutsche FREE/ADS-Katalog ist **nicht** als offene Data-API-Liste nachgewiesen.
- **Wichtiges Compliance-Gate:** Fremd-API-Metadaten regelmäßig aktualisieren (30-Tage-Grenze gemäß API-Policies), YouTube-Quelle sichtbar lassen, keine Videoextraktion, kein Scraping, keine Abkürzung von Geo-/Wiedergaberegeln.
- **Nächster konkreter Schritt:** Nach API-/Quellenfreigabe begrenzter **nichtproduktiver** G1-Datenabruf, danach Bericht mit echten Treffer-, Matching-, Rechte- und Wiedergabezahlen; erst dann eine Implementierungsentscheidung.

### 4.1 Bestätigter Einstieg

- YouTube bietet laut offizieller Hilfe **kostenlose werbeunterstützte Primetime-Filme in Deutschland**; der Nutzerkatalog ist unter `youtube.com/movies` sichtbar. Das allein belegt **keinen** öffentlich dokumentierten vollständigen Datenfeed für exakt diese `FREE/ADS`-Teilmenge.
- `playlistItems.list` der offiziellen YouTube Data API kann eine **bekannte öffentliche Playlist** mit maximal **50 Elementen je Seite** über `nextPageToken` lesen; laut Referenz **1 Quota-Einheit pro Aufruf**.
- `videos.list` kann bekannte Video-IDs gesammelt prüfen, ebenfalls mit **1 Quota-Einheit je Aufruf**. Metadaten: Kanal, Titel, Beschreibung, Laufzeit, Regionsblockaden/-freigaben, Privacy-/Einbettungsstatus.
- Eine öffentliche Playlist oder ein öffentliches Video ist **kein Nachweis**, dass es sich um einen legal vollständig angebotenen Kinofilm, um DE-Verfügbarkeit oder um ein kostenloses Angebot handelt. `licensedContent` allein ist ebenfalls kein eindeutiger Nutzungsrechtsnachweis.
- Die YouTube-API-Richtlinien untersagen **Scraping**. Ein vermeintlicher Katalog-Endpoint oder eine inoffizielle Player-URL wird **nicht** zur produktiven Datenquelle gemacht.

**Offizielle Referenzen:**
- [Kostenlose Primetime-Filme (YouTube-Hilfe)](https://support.google.com/youtube/answer/16618963?hl=de)
- [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- [videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- [videos – Datenschema](https://developers.google.com/youtube/v3/docs/videos)
- [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [Pflichtfunktionen bei Wiedergabe](https://developers.google.com/youtube/terms/required-minimum-functionality)

### 4.2 Zu trennende Quellenklassen

**A. Offizieller Primetime-Filmkatalog:** hoher Produktnutzen, aber derzeit **kein verifizierter maschinenlesbarer DE-FREE/ADS-Gesamtkatalog**. Separates Zugangsgate, nicht durch Web-Scraping ersetzen.

**B. Öffentliche Playlists:** reguläre API-Pagination technisch möglich. Die Playlist ist nur ein *Kandidatenset*. Publisher-Vertrauenswürdigkeit, Rechtehinweise, DE-Verfügbarkeit, Vollfilm-Status und Matching müssen einzeln geprüft werden.

**C. Offizielle Rechteinhaber-/Filmkanäle:** potenziell geeignetere Evidenz als beliebige Nutzeruploads. Qualität und länderspezifische Rechte dennoch gesondert prüfen.

**Vorhandener Testkandidat aus #388:** eine große kuratierte kostenlose Film-Playlist (`PL30RAv-0lkxHdTcoGGgx5L6eXIHnnrEHC`); **keine durch uns bestätigte aktuelle DE-Abspielbarkeit und keine pauschale Lizenzfreigabe**.

### 4.3 Nichtproduktiver YouTube-Pilot – vorgeschlagener Prüfablauf

1. **Zugangscheck:** YouTube Data API im passenden Projekt/Konto zulässig verfügbar? API-Key nur serverseitig in Secret Manager, Quota/Conditions, Nutzungsbedingungen, Branding und Datenschutzhinweise prüfen. Kein Key nötig für die reine Konzeptphase.
2. **Kleine Stichprobe:** ca. **100–200 Videos** aus **einer** benannten öffentlichen Playlist oder geprüften Rechteinhaberquelle nur per offizieller API lesen. Keine Produktivpublikation und keine Aufnahme fragwürdiger Quellen in den öffentlichen Index.
3. **Normalisierung:** Video-ID, Playlist/Kanal, vollständiger Originaltitel, Sprache, Laufzeit, Link, Regionseinschränkung, Abrufzeitpunkt, Status, Quellengeneration. Trailer, Clips, unvollständige Filme und Dubletten früh aussondern.
4. **Konservatives TMDB-Matching:** Medientyp/Filmtitel, Jahr, Laufzeit und ggf. Originalsprache vergleichen. Eindeutige IDs übernehmen, unsichere Treffer in Reviewliste. Kein Zwangs-Match und keine neuen TMDB-Titeldubletten.
5. **Verfügbarkeit getrennt prüfen:** Zugriff aus Deutschland, tatsächlicher ganzer Film, Nachweis zulässiger Quelle, Kosten-/Werbeart. **Nur** belegte `FREE`/`ADS`-Eigenschaften publizieren; `YouTube` als Plattform allein rechtfertigt kein `FREE`.
6. **Playback-Pilot:** Route zur **exakten Video-ID** auf Android-Smartphone und realem Fire TV testen; offizielle YouTube-App/Webziel statt Direktstream-Extraktion. Vorsicht bei Einbettungs-, Alters-, Login- und Regionalbeschränkungen.
7. **Dry-run-Bericht:** Roh-Einträge, Vollfilm-Kandidaten, eindeutige Matches, uneindeutige/abgelehnte Matches, DE-verfügbare und verifizierte Angebote, funktionierende exakte Absprünge, API-Kosten, Datenalter, entfernte Videos und Fehlerraten. Keine persönlichen Daten erfassen.
8. **Go/No-Go:** Erst nach Belegen und Nutzerfreigabe begrenzte produktive Einführung unter vorhandener SourceEnvelope-/PlaybackRoute-Strecke planen. Geräteabnahme getrennt von CI und Datenprüfung.

**Offene Knackpunkte:** Wird ein belastbarer Filmkatalog mit **nachgewiesenen legalen DE-Vollfilmen** geliefert? Ist DE-Verfügbarkeit reproduzierbar überprüfbar, statt aus Metadaten abgeleitet? Reicht die Matching-Qualität? Bleiben Video-Links stabil? Werden Filmwiedergabe und native App auf Fire TV korrekt geöffnet? Wie lassen sich entfernte Filme auslaufen, ohne letzte gültige Snapshots zu verlieren?

## 5. Weitere Adapter – erste Abgrenzung (noch keine Vollanalyse)

### DVB-I – #336 / Priorität 2

**Erster externer Quellenbefund:** Die Deutsche TV-Plattform hat am **17.03.2026** das deutsche DVB-I Implementation Profile veröffentlicht; die DVB meldete am **29.05.2026** die Verabschiedung des „DVB-I Book Germany“. Dies sind **Normen-/Rahmenmeilensteine**, nicht der Nachweis eines für MovieHub zugänglichen deutschen **Produktions-Service-List-Endpunkts**. Die DVB-Deployment-Übersicht beschreibt einen deutschen Pilot und einen damals für September 2026 **angestrebten** Marktstart; das ist nicht als bestätigter tatsächlicher Start zu lesen.

**Bekannte Vorarbeit im Repo:** deutscher Service-List-/Registry-Zugang, Parser, Content Guide/EPG, Region, Bearer-/Playback-Signalisierung und SourceEnvelope-Probe als Pilot planbar. Ob ein **zugelassener stabiler deutscher Produktionszugang aktuell** verfügbar ist, ist **nicht durch diese Recherche bestätigt**. Nächster Schritt: Betreiber/Registry, Produktionsfreigabe, Nutzungsbedingungen und Beispielendpunkt ermitteln; Referenz/experimentell/Pilot/Produktion strikt trennen. Keine experimentelle Liste als Produktionswahrheit.

**Primärquellen:** [DTVP-Profil](https://www.tv-plattform.de/dvb-i-implementation-profile-veroeffentlicht/) · [DVB Book Germany](https://dvb.org/news/dvb-i-book-germany-approved-clearing-path-to-market-launch/) · [DVB-I Deployments](https://dvb-i.tv/deployments/).

### Prime Video – #391 / Priorität 3

**Bekannte Vorarbeit im Repo:** Auf Fire TV wurde für einen Referenztitel ein `app.primevideo.com/detail?gti=...`-basierter titelspezifischer Absprung getestet. Das ist ein **beobachteter Deep-Link-Test**, kein Beleg für eine offizielle allgemeine Prime-Katalog-/GTI-Schnittstelle. Die öffentlich beschriebene [Amazon Fire-TV-Launcher-Integration](https://developer.amazon.com/docs/catalog/integrate-with-launcher.html) betrifft die Integration **eigener Contentanbieter-Apps**; sie belegt **nicht**, dass MovieHub fremde Prime-GTIs offiziell in einem offenen Katalog abrufen kann. Nächster Schritt: offizielle/erlaubte Quellen für titelgenaue GTI und deutsches Angebot untersuchen; GTI getrennt von TMDB halten. Keine automatisierte GTI-Generierung aus Titeln behaupten und keine unbestätigten universellen Links veröffentlichen.

### Weitere Free-TV-/FAST-/Mediathekquellen

Erst kandidatenweise prüfen: dokumentierter Zugang, verlässliche Quellen-IDs, deutscher Katalog und Rechte, Timing/Region, direkte App-/Web-Routen, Quellenfrische, Betriebskosten. Pro Quelle eigenes Issue nach Priorisierungsentscheidung.

## 6. Abnahmegates pro Adapter (einheitlich)

- **G0 – Analyse:** API-/Quellenzugang, zulässige Nutzung, eindeutiges Produktziel, Datenfelder, bekannte Lücken dokumentiert.
- **G1 – Datenprobe:** begrenzter Dry-run, Quellendaten und Feldabdeckung gemessen, Match-Fehler dokumentiert. Noch keine produktiven Badge-/Katalogeffekte.
- **G2 – Integrationsentscheidung:** Nutzer entscheidet über konkreten Produktivumfang und akzeptiert verbleibende Risiken. Kein Automatismus nach positivem Pilot.
- **G3 – Umsetzung:** kleiner Adapter an bestehendem gemeinsamen Daten-/Playbackvertrag; dedupliziert, fehlerisoliert, Budget/Frische/Tests.
- **G4 – Veröffentlichung und Geräteabnahme:** CI/APK/Deploy technisch verifiziert; reales Smartphone/Fire-TV-Verhalten und Angebotswahrheit vom Nutzer getrennt abgenommen. Erst dann Einzelissue schließen.

## 7. Sofort nächste Arbeitsschritte

1. **#388 beginnen – nur Analyse / API-Zugang / Quellenauswahl / Prüfstichprobe vorbereiten**. Zunächst vorhandene Verträge, Import-Schnittstellen und #388-Befunde lesen; keine produktiven Änderungen.
2. Pilotfragen und Ergebnisse im **YouTube-Issue #388** fortschreiben; Querschnittsentscheidungen in **#271** und diesem Dokument.
3. Nach einem belastbaren YouTube-Dry-run **G0/G1-Bericht mit konkreten Zahlen und Go/No-Go-Vorschlag** präsentieren und vor Implementierung ausdrückliche Freigabe einholen.
4. Danach #336 und #391 in derselben Gate-Systematik analysieren; keine parallelen unfertigen Adapter-Baustellen eröffnen.

**Nicht Teil dieser Planungsrunde:** App-Code, Live-Import, Firestore-Schemaänderung, neue Secrets, API-Keys, produktiver Scheduler, bestehende Mitteilungspakete, Fire-TV-Installer #458 oder Fire-TV-Feintuning #386.
