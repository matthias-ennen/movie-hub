# MovieHub G1 – Prüfpaket für die originalen 100 YouTube-Filmvideo-Kandidaten

**Datum:** 21.10.2026. **Status:** nur TMDB-Leseforschung; 100 unverifizierte VIDEO-IDs, **0** bestätigte Filmwerke/Angebote.

## Eindeutige Eingabe und Reihenfolge

Original von GitHub Actions [#39618878080](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080), [Artefakt #12353497700](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080/artifacts/12353497700), `all-categories-hundred.md` mit exakt 100 YouTube-Video-IDs. Die originale Video-ID-Reihenfolge wird mit SHA-256 `f18e3fe44bf8a6c312bf7cf1e02bb22d3770ed2fb0fb4a1a49ea9512c9cc7c27` streng geprüft; Zeilennummern, Titel, Kategorie, Dauer, Region und Herkunft werden eingelesen. Ohne gültige Prüfsumme oder genau **13 Nicht-Filmkategorie-30** / **87 Kategorie-30** und **45 historische** Videos: **Abbruch**, keine stillschweigende Erweiterung oder Neusuche.

**Datenschutz/Verlässlichkeit:** Der manuelle Runner lädt per `GITHUB_TOKEN` mit `actions: read` das originale interne GitHub-Artefakt. Der **Source-Download ist wegen der 14-Tage-Artefakt-Retention nur zeitlich begrenzt ausführbar**. Wir speichern im Repository **keine erneute langlebige Kopie des YouTube-API-Metadatenkatalogs**. Alle vollständigen Originalzeilen gehören nur zum originalen Forschungsartefakt, dessen Ablaufdatum eingehalten werden muss.

## Prüfung in zwei priorisierten Gruppen

**Zuerst 13 Nicht-Kategorie-30-Kandidaten:** Film/Animation, Musik, Unterhaltung, Sport, Gaming, Bildung, Reisen, Tiere, Auto, People/Blogs, Comedy, Nachrichten, Styling. Besonders auf Dokumentation versus Spielfilm, Gamer-Zusammenschnitte, episodische Staffeln, Sprachlernvideos, inoffizielle Reuploads und landesspezifische Titel achten. Einige können echte Dokumentarfilme sein und dürfen nicht nur wegen des Kategorie-Wertes als `non-film` behauptet werden.

**Danach 87 Videos aus Kategorie 30:** Titelalias-Abgleich und Film-/TV-Überlagerungen, Laufzeitnähe und mehrfach mögliche Filmwerke; nur vorläufige Hypothesen. Die Video-ID ist immer Quelle des Prüffalls, nicht notwendigerweise eine eindeutige kanonische Filmwerk-ID. Ein Video kann ein anderer Schnitt, eine Serie oder irreführend benannt sein.

Pro Video erfolgen im maximalen Budget **zwei offizielle TMDB-Suchen** (`search/multi`, `search/movie`) und höchstens **ein** Filmdetail `movie/{id}` zur Laufzeitdiagnose, wenn der Titelscore ausreichend ist. Maximal **310** TMDB-GETs, übliches Maximum 300. Bei 429/Quota werden die verbleibenden Fälle eindeutig als `not-checked-budget` protokolliert; kein stiller Nullmatch. Unverträgliche Titelfassungen bleiben `unmatched`/Mehrdeutigkeit; **kein automatisches `(movie,tmdbId)`**, keine Produktivfreigabe.

## Technische Bausteine

- `scripts/youtube-movies-hundred-tmdb-g1.mjs` – strenger Originalreport-Parser; Film-/Serien-/Titelvarianten-/Laufzeitdiagnose für 100 Quellen, alle Vorschläge `review`.
- `scripts/youtube-movies-hundred-tmdb-g1.check.mjs` – 100er-Mock, 13 zuerst, Quellenintegrität/SHA, 429-Abbruch, Film-/TV-Namenskollision, kein Auto-Import.
- `tests/youtube-movies-hundred-tmdb-g1.test.js` – Einbindung in Repository-CI.
- [Manueller Workflow `YouTube G1 Original 100 Video Candidates – TMDB Identity Review`](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-hundred-tmdb-g1.yml). Nur `workflow_dispatch` auf `main`; bestehendes `TMDB_API_READ_TOKEN`, bestehendes GitHub-Lesetoken; kein YouTube-API-Key benötigt, keine YouTube-API-Abfragen.
- Forschungsergebnis: `artifacts/youtube-movies-g1/hundred-tmdb-review.md`, GitHub-Artefakt-Laufzeit **14 Tage**. Später echte Verteilung aus dem **tatsächlichen Livebericht** nach #388 übernehmen.

## Architektur-/Rechtsgrenze

Weder `search/multi` noch `search/movie` beweist identische Filmfassung, offizielle DE-Videorechte, Gratis/Ads/Flat/Rent/Buy-Angebot, Player-Kompatibilität oder Rechtsinhaberschaft. Der konkrete im YouTube API Developer Policies Abschnitt E.2 eingeschränkte [Mehr-Rechteinhaber-Datenaggregationsfall](https://developers.google.com/youtube/terms/developer-policies) ist vor einem öffentlichen, verbundenen MovieHub-Angebotskatalog weiter **nicht als zulässig nachgewiesen**. Getrennte Quellenanzeige allein ist kein automatischer Rechtsnachweis.

**Keine** Firebase/Firestore-, Badge-, Katalog-, EPG-, Nachtlauf-, Android-, Fire-TV- oder PlaybackRoute-Änderungen. G1 Issue #388 offen; G2–G4 nicht freigegeben.

**Abnahme:** Erst ein erfolgreich ausgeführter manueller API-Workflow und sein echter Originalreport liefern Aussagen über die Qualität dieser 100 YouTube-Kandidaten. Dies ist nur Vorbereitung.
