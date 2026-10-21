# MovieHub G1 – alle YouTube-Videokategorien systematisch prüfen; 100 Filmkandidaten als Analyseziel

**Stand:** 21.10.2026. **Nur G1-Forschung. Kein automatischer Film-/Anbieterimport.**

## Ziel und korrekte Maßeinheit

Nutzerwunsch: **alle Videokategorien testen**; am Ende einen Pool von **100 Filmen zur Analyse**. Der technisch überprüfbare erste Gate lautet deshalb **100 unterschiedliche, öffentlich auflösbare, mindestens 60 Minuten lange, filmähnliche YouTube-VIDEO-IDs** mit konservativem DE-Region-Metadatensignal, soweit die API sie zulässt. **Nicht** behaupten, dass 100 verschiedene YouTube-Video-IDs automatisch 100 unterschiedliche echte Filme, 100 kanonische TMDB-Filmwerke, 100 rechtmäßig DE-verfügbare Inhalte oder 100 im Tarif enthaltene Angebote seien. Ein einzelner Film kann mehrere Sprach-/Schnittfassungen/Uploads haben; ein langer Videotreffer kann dokumentarisch, episodisch, Konzert oder irreführend betitelt sein.

Die **historischen 47** unterschiedlichen G1-VIDEO-IDs werden als bestehender Recherchebestand **erneut** mit `videos.list` auf öffentliche Sichtbarkeit/Laufzeit/DE-Metadaten geprüft. Sie werden nur dann mitgezählt, wenn ihre aktuellen Videoeigenschaften den Sample-Regeln entsprechen. Das Ziel wäre **47 alte + mindestens 53 zusätzliche verschiedene Video-IDs**, sofern tatsächlich verfügbar. Kann die API das nicht belegen, wird die exakte niedrigere Anzahl samt Lücke berichtet. Bereits vorhandene TMDB-ID-/Filmwerke bleiben von der Frage neuer VIDEO-IDs unabhängig.

## Fachliche Umsetzung – drei klar getrennte Suchgruppen

1. **Offizielles Kategorieninventar:** `videoCategories.list(part=snippet,regionCode=DE,hl=de_DE)` liefert die tatsächlich für Deutschland in der offiziellen API gelisteten Videokategorien. Ein zweiter, gebündelter `videoCategories.list(id=30,35,36,39,43)`-Lesetest verifiziert die älteren, verbreitet zitierten **Movies/Documentary/Drama/Horror/Shows**-IDs. Eine historische ID, die nicht mehr zurückkommt, wird im Bericht als *nicht in der offiziellen Antwort* bezeichnet; veraltete Kategorienamen werden **nicht** als funktionierende DE-Suchfilter behauptet.
2. **Jede gefundene DE-/historische Kategorie testen:** je eine tatsächliche `search.list`-Kategorieabfrage mit `type=video`, `videoCategoryId`, `q=ganzer film`, `videoDuration=long`, `regionCode=DE` und maximal 50 Suchergebnissen. **Alle** tatsächlich aufgelösten Kategorien werden in diesem ersten Pass abgefragt (wenn das Tagesbudget nicht vorher erschöpft wird). Vorzeitiger Abbruch (403/429) und ungültige Filter (400) bleiben mit Fehler und `not-probed` sichtbar.
3. **Wenn Quota übrig:** vergleichende Kategorieabfragen mit `videoType=movie`; danach bekannte filmbezogene, nicht kategorisierte G1-Genre-Suchen als Kontrollgruppe, bis zum festen Budgetdeckel. So lässt sich später unterscheiden, ob die Kategorie neue Filme bringt oder nur andere Arten von Langvideos.

**API-Gates:** Höchstens **76 `search.list`-GETs**, **2** `videoCategories.list` und **30 `videos.list`-Batchabfragen (je höchstens 50 Video-IDs), begrenzt auf höchstens **1.500** Detail-IDs. Die offiziellen Dokumente führen seit 2026 ein Standardtagesbudget von **100 Search-Calls pro API-Projekt** (eigener Search-Bucket; eine Einheit je Aufruf); der tatsächliche Restwert unseres Google-Cloud-Projekts muss nicht 100 sein. Der Pilot setzt deshalb kein vollständiges Tagesbudget voraus, hat harte Deckel und stoppt bei Quoten-/Rate-Fehlern. **Kein** automatisches Wiederholen im Nachtlauf. Das alte Budget aus historischen G1-Skripten (100 Quota-Einheiten `search.list` je Abruf) darf nicht als heutige Standardkosten in die neue Studie übertragen werden.

## G1-Vorauswahl und Qualitätskriterien

Ein Kandidat wird nach `videos.list` nur in die bis zu 100 Aufnahmen gezählt, wenn:
- offizielle `videoId` gültig und eindeutig,
- `status.privacyStatus=public`,
- ISO-8601-Videolaufzeit **mindestens 60 Minuten**,
- `contentDetails.regionRestriction` die Region `DE` **nicht ausdrücklich ausschließt** (fehlendes DE-Signal bleibt *unknown*, kein Playback-Beweis),
- kein klarer Trailer-/Teaser-/Gameplay-/Clip-/Interview-/Konzert-/Episoden-Titelindikator,
- über reine Kategorie-Mitgliedschaft hinaus mindestens **ein zusätzliches filmbezogenes Suchsignal**: historischer G1-Filmkandidat, *YouTube Movies*-Kanallabel, Treffer aus `videoType=movie` oder ausdrücklicher *Full movie / Ganzer Film*-Titelzusatz.

Es werden zusätzlich Überschneidungen, Kategoriebeiträge, die Zahl neu beobachteter gegenüber alten Video-IDs, unterschiedliche **normalisierte Titelschreibweisen** und Fehlerfälle ausgewiesen. **Keine** automatische TMDB-Zuordnung; keine Behauptung über Produktionsjahr, Filmfassung, verlässliche DE-Shop-/Abo-/Free-/Ads-/Rent-/Buy-Verfügbarkeit oder Fire-TV-Wiedergabe. Ein gleich klingender Kanaltitel `YouTube Movies` allein beweist keine Eigentümerschaft/Rechte.

## Workflow, Nachweise und Gates

- Skript: `scripts/youtube-movies-all-categories-hundred-g1.mjs`
- Separate isolierte Node- und Vitest-Mocktests: `scripts/youtube-movies-all-categories-hundred-g1.check.mjs`, `tests/youtube-movies-all-categories-hundred-g1.test.js`
- Manueller **read-only** Workflow: [G1 All DE Categories – 100 Video Candidates](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-all-categories-hundred-g1.yml), nur `workflow_dispatch` auf `main`; bestehende Google-GitHub-OIDC-Authentifizierung, YouTube-API-Key aus bestehendem Secret Manager, **kein** neuer API-Key/Secret.
- Originaler vorübergehender Report (`artifacts/youtube-movies-g1/all-categories-hundred.md`), 14 Tage GitHub Actions Artifact Retention; nach echtem Lauf in #388 nur tatsächlich belegte Zähler und Titelevidenz dauerhaft dokumentieren.
- Ursprüngliche G1-Forschung bleibt nichtproduktiv. Bevor eine künftige App daraus automatisch Anbieterbadges/Deep Links/TMDB-Movie-IDs erzeugt, ist die konkrete YouTube-API-Datenaggregation unterschiedlicher Content-Owner unter den [Developer Policies, III.E.2](https://developers.google.com/youtube/terms/developer-policies) zu prüfen; [YouTube-Compliance-Entwurf](YOUTUBE_MOVIES_G1_YOUTUBE_API_COMPLIANCE_REQUEST_DRAFT_2026-10-21.md) bleibt **ungesendet**.

**Quellen:** [YouTube `search.list`](https://developers.google.com/youtube/v3/docs/search/list) · [`videoCategories.list`](https://developers.google.com/youtube/v3/docs/videoCategories/list) · [aktueller API-Quota-Calculator](https://developers.google.com/youtube/v3/determine_quota_cost). Stand der Quellen 21.10.2026. Ein Suchparameter ist keine Verfügbarkeitszusage.

**Abnahmegrenze:** Erst der reale Report belegt, welche Kategorien funktionieren und ob 100 unterschiedliche FilmVIDEO-IDs erreicht wurden. G1 #388 bleibt offen; G2–G4 produktive Integration nicht freigegeben.
