# MovieHub G1 – Belegbare Titel-Matcher-Qualität verbessern, ohne Autoimport

**Status:** 21.10.2026; isolierte, **rein lesende** TMDB-Forschung. **Noch kein neuer API-Liverun** dieses QA-Pakets.

## Anlass

Der tatsächlich ausgeführte 100er-G1-TMDB-Review [#39628463786](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786), [Original-Artefakt #12358536690](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786/artifacts/12358536690), ergab **40** Single-Film-Hypothesen, **43** mehrdeutige Film-/TV-Hypothesen, **13** ohne ausreichend passendes Titelalias, **2** reine Runtime-Konflikte und **2** explizite Nichtfilm-/Episoden-Risiken. **0** verbindlich bestätigte YouTube-Video/TMDB-Filmfassungsidentitäten und **0** DE-Shop-/Playback-Freigaben.

Hieraus wurden konkrete Fehler der alten Erstkandidaten-Logik sichtbar:

- `War Story`: Bereits bei den ersten drei Kandidaten stehen verschiedene gleichnamige Werke. Ein älterer, als erste Position gelisteter Film zeigte fälschlich Δ83,3 Minuten; die bereits bekannte 2014er-Filmhypothese `246013` hatte etwa Δ0,7 Minuten.
- `Man Bites Dog`: ein tatsächlich im TMDB-Result gelisteter möglicher Match [*Mann beißt Hund*, TMDB 10086](https://www.themoviedb.org/movie/10086) wurde wegen seiner deutschen Übersetzung mit einem zu niedrigen Score bewertet. Die *Alternative Titles* des jeweiligen TMDB-Films müssen daher separat mit dem englischen Videotitel abgeglichen werden.
- `2010: The Year We Make Contact`: der vorliegende Filmtitel [*2010*, TMDB 4437](https://www.themoviedb.org/movie/4437) darf nicht nur wegen einer verkürzten deutschen Anzeige als „fehlender Film“ behandelt werden.
- Making-of, Trailer, Fortsetzungen wie `Rambo II` vs. `Rambo III` und gleichnamige Filmwerke verschiedener Jahre müssen separate Prüfhinweise erhalten, statt einen positiven Titelmatch zu ergeben.

## Bewusst enger QA-Umfang

**34 genau vorab ausgewählte Prüffälle aus dem existierenden 100er-Pool:** **alle 13 Nicht-Kategorie-30** zuerst und **21** konkrete Filmkategorie-Titel der ursprünglichen Video-Zeilennummern `1,15,17,19,21,22,24,28,30,32,35,37,38,40,43,53,64,78,83,89,98`. Die übrigen **66** Kandidaten werden **nicht** erneut aus Suchergebnissen erzeugt, weder gezielt neu gesucht noch als „schon freigegeben“ ausgegeben.

**Datenintegrität:** Statt neue YouTube-API-Suchanfragen auszuführen, lädt der manuelle Workflow ausschließlich die zwei bisherigen Forschungsberichte:

1. Originales Video-/Laufzeit-Artefakt [#12353497700](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080/artifacts/12353497700), `all-categories-hundred.md`; der vollständige 100-Video-Pool samt originalem SHA-256 muss stimmen.
2. Originaler 100-TMDB-Suchvorschlagsreport [#12358536690](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786/artifacts/12358536690), `hundred-tmdb-review.md`; genau **100** Fälle, Video-/Reihenfolgen-/Kategoriegleichheit, darin höchstens drei historische Film-ID-Hypothesen je Fall.

**Nur offizielle, lesende TMDB-Film-Detail-Endpunkte** `/movie/{id}` einschließlich `alternative_titles,credits,external_ids`, eine Anfrage je zuvor belegter Kandidaten-ID; **maximal 102 GETs**, tatsächlich oft weniger. Keine YouTube-API-Anfragen, keine neuen Suchwörter/Ergebnisse, kein TMDB-`watch/providers`-Join und kein Zugreifen auf private MovieHub-Bestände.

## Bewertungsregeln

- Vollständige Titel und originale Übersetzungs-/Landes-Aliasse **bevorzugen**; unscharfe Teilstrings und Tokenüberlappung bleiben schwächere Indizien. Etiketten wie `Full Movie`/OmU werden für Titelvergleich entfernt, nicht als Rechte-/Filmbeweis interpretiert.
- Die **Laufzeitdifferenz wird für jeden** der höchstens drei Filmkandidaten berechnet, nicht nur für den Ersttreffer. Starke Laufzeitkonflikte senken das Ranking und bleiben eigenständiger Review-Befund.
- Erkennbarer Sequel-Index-Konflikt und Making-of-/Trailer-/Zusatzfilm-Titel werden aktiv schlechter bewertet. Gleichnamige Werke in mehreren Jahren können dennoch mehrdeutig bleiben.
- Ein offensichtlicher Gaming-/Lern-/Staffel-Inhaltsrisikotitel bleibt ein Risiko, **selbst wenn** TMDB einen ähnlich klingenden Kinofilm liefert. Reine Dokumentationen werden hingegen nicht pauschal ausgeschlossen.
- **Alle** Ergebnisse beginnen mit `review-*`. Auch ein klarer Spitzenkandidat ist **kein** verifizierter Film, keine bestätigte YouTube-Fassung, kein deutscher Shop-/Tarif-/Playback-Nachweis. Der aktuelle Matcher ändert **keine** produktiven `(mediaType,tmdbId)`-Zuweisungen. Nach TMDB 429 werden verbleibende Fälle explizit als **nicht geprüft** gekennzeichnet.

## Test und Freigabe

- `scripts/youtube-movies-top-three-qa-g1.mjs`: strenger Original-Artefakt-Abgleich plus begrenzter Score-/Laufzeitvergleich.
- `scripts/youtube-movies-top-three-qa-g1.check.mjs` und `tests/youtube-movies-top-three-qa-g1.test.js`: deterministische Tests zu 100er-Eingabeverifikation, 34er-Prioritäten, englischem/deutschem Titelalias, Sequel-/False-Positive-Gefahr, War-Story-Laufzeit, 429-Stopp und Verbot automatischer Identitätsfreigabe.
- [Manueller Workflow: YouTube G1 Top-Three Work Matcher QA](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-movies-top-three-qa-g1.yml). `workflow_dispatch` auf `main`, GitHub `actions:read`, TMDB-Lesetoken, 14-Tage-Forschungsbericht. **Noch nicht live ausgeführt**, also keine neuen Erfolgs-/Zuordnungszahlen behaupten.
- Originale GitHub-Actions-Quellartefakte haben **14 Tage Retention**. Bei deren Ablauf ist der sichere Ansatz ein neue, eigens genehmigte Recherche aus berechtigter Quelle, nicht die unbemerkte Rekonstruktion historischer privater API-Daten.
- Vor G2 weiter unbedingt [YouTube Data API Developer Policies III.E.2 – Data Aggregation](https://developers.google.com/youtube/terms/developer-policies) und das exakte öffentliche MovieHub-Quellenanzeigekonzept klären. Die [API-Compliance-Anfrage](YOUTUBE_MOVIES_G1_YOUTUBE_API_COMPLIANCE_REQUEST_DRAFT_2026-10-21.md) ist ausdrücklich **nicht** versendet.

**Kein** Produktionscode/Badge/Nachtlauf/Firestore/Firebase/Android/Fire-TV/YouTube-Playback-Route oder automatisch bestätigtes TMDB-Filmwerk durch dieses Forschungspaket verändert. Issue #388 bleibt G1 offen.
