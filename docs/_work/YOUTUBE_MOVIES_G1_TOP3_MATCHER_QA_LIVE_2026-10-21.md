# MovieHub G1 – Original-Liveergebnis: Top-3-Matcher-QA für 34 der 100 YouTube-Video-IDs

**Datum:** 21.10.2026. **Nur G1-Forschung.** Kein produktiver YouTube-Adapter, keine TMDB-Zuweisung und keine DE-Verfügbarkeitsfreigabe.

## Tatsächlicher Originalnachweis

- [GitHub Actions #39636101093](https://github.com/matthias-ennen/movie-hub/actions/runs/39636101093), manuell `workflow_dispatch` auf `main`, **SUCCESS**.
- Echtes [Actions-Artefakt #12362130138](https://github.com/matthias-ennen/movie-hub/actions/runs/39636101093/artifacts/12362130138), `top-three-matcher-qa.md`, als ZIP **heruntergeladen, geöffnet und ausgewertet**. Erzeugung **2026-10-21T16:35:34.211Z**. GitHub-Retention **14 Tage**.
- Source-Provenienz: ursprüngliche [100 YouTube-Video-IDs / Artifact #12353497700](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080/artifacts/12353497700), streng über den Original-Video-ID-SHA-256 geprüft; bereits existierender [100-TMDB-Suchvorschlagsreport / Artifact #12358536690](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786/artifacts/12358536690). **Kein neuer YouTube-/TMDB-Suchlauf** im vorliegenden QA-Run.
- Der Run bearbeitete **34** vorab definierte reale Forschungsfälle, davon **13** aus Nicht-Kategorie-30 **zuerst** und **21** aus Kategorie 30. Es gab **77** lesende offizielle `/movie/{id}`-GETs einschließlich Filmdetails/Alternativtiteln (Budgetgrenze 102), **keinen** TMDB-Quotenstopp. Für **10** der 34 Fälle war der aktuell höchstbewertete Film **nicht mehr derselbe wie die zuvor erstgenannte TMDB-Filmhypothese**. Diese 10 sind **keine zehn bestätigten neuen Filme**.

## Neue Statusverteilung

| Konservative QA-Bewertung | Anzahl |
| --- | ---: |
| `review-distinct-leading-hypothesis` – klar führender Film-Hinweis nach neuem Score | **21** |
| `review-multiple-close-work-candidates` – mehrere ernsthafte Werke | **4** |
| `review-version-uncertainty` – Laufzeit/Fassung nicht schlüssig | **4** |
| `review-no-movie-evidence` – in den alten Top-3-Suchvorschlägen kein brauchbarer Film | **3** |
| `review-content-type-risk` – Gaming-/Lern-/Staffel-/Nichtfilmrisiko | **2** |
| **Gesamt** | **34** |

**Wichtig:** `distinct-leading-hypothesis` bedeutet *ein innerhalb des untersuchten alten Top-3-Pools führender Kandidat*, **nicht** unabhängig verifizierte Werkidentität. Es gibt weiterhin **0** bestätigte Video→TMDB-Fassungen, **0** DE-Angebote, **0** neue MovieHub-Anbieterbadges oder Wiedergabelinks.

## Konkrete Regressionsfälle – fachlich plausibler rangiert

| YouTube-VIDEO / Originalrang | Jetzt erstplatzierter TMDB-Film | Live-Laufzeitdifferenz | Erkenntnis / Grenze |
| --- | --- | ---: | --- |
| `War Story` / #30 | [*War Story* (2014), TMDB 246013](https://www.themoviedb.org/movie/246013) | **0,7 Min.** | Der früher erstgenannte gleichnamige Film von 1989 hatte **83,3 Min.** Abweichung. Der neue Matcher berücksichtigt **separat** die Laufzeit jedes Kandidaten. |
| `Man Bites Dog (Full Film)` / #13 | [*Mann beißt Hund* (1992), TMDB 10086](https://www.themoviedb.org/movie/10086) | **3 Min.** | TMDB-`alternative_titles` führt *Man Bites Dog* als Alias. Vorher war der deutsche Filmtitel nicht hinreichend erkannt worden. |
| `2010: The Year We Make Contact` / #22 | [*2010* (1984), TMDB 4437](https://www.themoviedb.org/movie/4437) | **0,2 Min.** | Die internationale Titelvariante wird gegenüber dem verkürzten TMDB-Anzeigenamen richtig bewertet. |
| `Rambo II – Der Auftrag` / #19 | [*Rambo II* (1985), TMDB 1369](https://www.themoviedb.org/movie/1369) | **0,1 Min.** | *Rambo III* wird wegen Sequel-Unterschied deutlich abgewertet. |
| `School of Rock` / #17 | [*School of Rock* (2003), TMDB 1584](https://www.themoviedb.org/movie/1584) | **1,2 Min.** | Making-of und nachgelagerte Inhalte werden deutlich schwächer bewertet. |
| `Hidden Figures` / #83 | [*Hidden Figures* (2016), TMDB 381284](https://www.themoviedb.org/movie/381284) | **0,1 Min.** | Das Making-of wird abgewertet statt als gleichwertiger Film behandelt. |
| `Arielle, die Meerjungfrau` / #98 | [*Arielle* (1989), TMDB 10144](https://www.themoviedb.org/movie/10144) | **3,5 Min.** | Der mögliche Spielfilm von 2023 sowie die Fortsetzung werden nicht fälschlich als identische Werkfassung gewertet. |

Auch die bessere Darstellung von `Cobbler – Der Schuhmagier` (`238215`) sowie `Das Protokoll` (`394645`) bestätigt den Nutzen der gewählten Alias-/Laufzeitbewertung. Die **beste Rangfolge ist keine endgültige Identitätsentscheidung**.

## Weiterhin unklare 13 Sonderkategorien

- `Blink of an Eye`: alte TMDB-Kandidaten von 1992, 1999 und 2019 weiterhin ähnlich plausibel. **Status: mehrere Werke**.
- `Turning Point`: mehrere gleichnamige Dokumentar-/Filmwerke plausibel. **Status: mehrere Werke**.
- `Tarzan Aur Jadui Chirag`: Filmhinweis von 1966, aber **41,5 Min.** Laufzeitabweichung. Kein bestätigter Schnitt.
- `World of Warcraft – O Filme da Historia Dublado`: trotz Film-Hypothese auf TMDB **eigenes Gaming-/Compilation-Risiko**.
- `Reich und Arm – Staffel 1 … Deutsch lernen`: eigenständiges **Sprachlern-/Serien-/Episoden-Risiko**, auch wenn ähnlich benannte Filme auffindbar sind.
- `Die Eider – von der Quelle bis zur Mündung`, `Hummingbird: The Bitcoin Jungle Story`, `African Home: The Covenant`: kein brauchbarer **zuvor gefundener** TMDB-Movie-Kandidat. Dies heißt **nicht**, dass es keine eigenständigen Dokumentationen oder Filme sind.

**Vier Fälle mit Fassungs-/Laufzeitunsicherheit im gesamten 34er-Pool:** `Tarzan Aur Jadui Chirag` (Δ41,5 Min.), `Napoleon` (Δ23,8 Min.), `My Name Is Khan` (Δ35,8 Min.), `Terminator 2 – Tag der Abrechnung` (Δ17 Min.). Ein Laufzeitkonflikt kann aus falscher Version, anderer Fassung, falschem Filmwerk, Schnitt oder unvollständigem Video folgen; **keinen** dieser Gründe ohne unabhängigen Beleg automatisch annehmen.

**Zusätzliche kritische Angebotsprüfung:** Die Forschung enthält Videos unter Titeln wie `Project Hail Mary` und `Spider-Man: Brand New Day` (TMDB-Jahr 2026). Ein korrekter Filmmetadatenmatch lässt **nicht** erkennen, ob die konkrete YouTube-Video-ID tatsächlich einen vollständigen lizenzierten Spielfilm zeigt. Für solche Titel den **Inhaltstyp / tatsächliche Videoseite / offizielle Veröffentlichung** besonders kritisch prüfen, nicht „ganzer Kinofilm“ vermuten.

## Entscheidung und nächster G1-Schritt

1. Den Matcher **in Forschung** beibehalten; **nicht** aus 21 führenden Hypothesen sofort 21 `(movie,tmdbId)` in den MovieHub-Katalog übernehmen.
2. Für die verbleibenden **4 ähnlich plausiblen Mehrfachwerke** und **4 Fassungsunsicherheiten** getrennte Werk-/Cut-/Landessprachenbelege prüfen. Bei starken Titelfassungsproblemen nicht noch einmal gleichartige Such-GETs ohne neue diskriminierende Quelle ausführen.
3. Die **2 klaren Inhaltsrisiken** nicht als Spielfilme behandeln; die **3 ohne hinreichenden TMDB-Movie-Beleg** als unaufgelöste Video-/Dokumentationskandidaten führen, nicht fälschlich löschen.
4. Das **restliche Sample von 66 Original-Video-IDs** wurde in dieser neuen Runde **nicht** erneut geprüft. Vor einer späteren 100er-Reklassifikation dieselben besseren Alias-/Top-3-Methoden schrittweise und kontrolliert anwenden, mit begrenzten API-Budgets und Datenaufbewahrungsregeln.
5. **Separates G2-Gate:** Die konkrete YouTube-API-konforme Integration mehrerer Content-Owner in einen öffentlichen MovieHub-TMDB-gebundenen Katalog ist weiterhin nicht genehmigt: [YouTube API Developer Policies III.E.2](https://developers.google.com/youtube/terms/developer-policies). DE `allowed`, öffentlicher Status, Kategoriename, Laufzeit und TMDB-Treffer sind kein verlässliches Free/Ads/Flat/Rent/Buy- oder Fire-TV-Wiedergabeangebot. [Compliance-Anfrageentwurf](YOUTUBE_MOVIES_G1_YOUTUBE_API_COMPLIANCE_REQUEST_DRAFT_2026-10-21.md) wurde **nicht** abgesendet.

**Status:** [Issue #388](https://github.com/matthias-ennen/movie-hub/issues/388) bleibt **G1 offen**; keine App-/Firestore-/Firebase-/Badge-/Provider-/Searchindex-/TV-/Nightly-/Android-/Fire-TV- oder Produktionsänderung in diesem Schritt.
