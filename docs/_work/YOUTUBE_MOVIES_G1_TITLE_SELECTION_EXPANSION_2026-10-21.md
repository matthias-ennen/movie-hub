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
