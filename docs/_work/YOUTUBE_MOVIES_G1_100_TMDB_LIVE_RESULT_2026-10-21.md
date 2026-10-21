# MovieHub G1 – Tatsächlicher TMDB-Livebefund zu den originalen 100 YouTube-Video-Kandidaten

**Datum:** 21. Oktober 2026. **Nur G1-Research, kein produktiver Filmimport.**

## Originalbelege und Grenzen

- **Echter GitHub-Actions-Lauf:** [#39628463786](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786), `workflow_dispatch` auf `main`, **SUCCESS**. Originaler Ergebnisreport: [Artifact #12358536690](https://github.com/matthias-ennen/movie-hub/actions/runs/39628463786/artifacts/12358536690) mit `hundred-tmdb-review.md`, als ZIP tatsächlich heruntergeladen, entpackt und gelesen. Generiert **2026-10-21T15:45:21.927Z**. Artifact-Retention **14 Tage**, daher wichtige Kennzahlen hier dauerhaft konserviert.
- **Nachgewiesene Quelle:** originale **100** unterschiedliche YouTube-VIDEO-IDs aus Kategorie-Discovery [#39618878080](https://github.com/matthias-ennen/movie-hub/actions/runs/39618878080), Artifact #12353497700. Die Identität und Reihenfolge der Eingabe wurde anhand SHA-256 `f18e3fe44bf8a6c312bf7cf1e02bb22d3770ed2fb0fb4a1a49ea9512c9cc7c27` geprüft. Keine neu erfundenen oder zusätzlich gesuchten IDs.
- **Keine neuen YouTube-API-Aufrufe**. Exakt **287 offizielle lesende TMDB-GETs** von maximal 310. **Kein** Quoten-/Rate-Abbruch. Alle 100 Video-Kandidaten im vorgesehenen Forschungsschema geprüft: zunächst 13 Nicht-Kategorie-30, danach 87 der Filmkategorie 30.
- **Wichtig:** 100 untersuchte Video-IDs sind **nicht** 100 bestätigte Filme und **nicht** 100 verschiedene TMDB-Filmwerke. Alle Ergebnisse sind `review`; **0** finale Auto-TMDB-Zuweisungen, **0** verifizierte DE-Playback-/Free-/Ads-/Leih-/Kaufangebote, **0** Produktivänderungen.

## Tatsächliche Gesamtverteilung aus dem Artefakt

| Original-Status im Live-Report | Anzahl | Interpretation |
| --- | ---: | --- |
| `single-movie-hypothesis-review` | **40** | Genau eine nach dem aktuellen **unscharfen** Titel-/TMDB-Score nahegelegene Filmhypothese mit Laufzeitdifferenz ≤15 min; **keine** unabhängige Bestätigung |
| `multiple-works-or-film-TV-review` | **43** | Mehrere mögliche Filmwerke oder Medientyp-Kollision – teils könnten niedriger relevante Kandidaten den Status unnötig auf „mehrdeutig“ setzen |
| `unmatched-or-alias-review` | **13** | Kein hinreichend passender Titel/Sprachalias im bisherigen Such- und Scoreansatz; **nicht** bewiesener Nichtfilm |
| `movie-hypothesis-runtime-conflict` | **2** | Laufzeitunterschied beim zuerst gewählten Kandidaten – **nicht unbedingt** ein Widerspruch zum tatsächlich gemeinten Film |
| `content-type-risk-review` | **2** | Konkret als Gaming-/Lern-/Episodenmaterial auffälliger Videotitel; mögliche Nichtfilme |
| **Summe** | **100** | **Kein automatischer Filmnachweis** |

Teilgruppen:

| Vorher festgelegte Gruppe | Single | Mehrdeutig | Kein Alias | Laufzeitkonflikt | Inhaltsrisiko | Gesamt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Andere YouTube-Kategorien** | 3 | 3 | 3 | 2 | 2 | **13** |
| **YouTube Kategorie 30 (Movies)** | 37 | 40 | 10 | 0 | 0 | **87** |
| **Gesamt** | **40** | **43** | **13** | **2** | **2** | **100** |

**Diese Statistik beschreibt allein die Testheuristik**, nicht die tatsächliche Zahl eindeutig unterscheidbarer Filme oder Serien.

## 13 Kandidaten aus anderen YouTube-Kategorien: überprüfter Risikofokus

| YouTube-Titel (gekürzt) | Forschungsstatus | Zentrale fachliche Prüfung |
| --- | --- | --- |
| *ADAM SANDLER … COBBLER* | Mehrdeutig | TMDB-Suche findet *The Cobbler* (1923) neben dem wahrscheinlich gemeinten Film *Cobbler – Der Schuhmagier* (2014): Erscheinungsjahr/Laufzeit statt Trefferreihenfolge entscheiden |
| *Tarzan Aur Jadui Chirag* | Laufzeitkonflikt | TMDB-Filmhinweis 1966, Δ41,5 Minuten; mögliche andere Version oder falscher Werkmatch |
| *Dobro jutro, komšija 8* | Single-Filmhypothese | TMDB 924614 / 2022 / Δ0 min; Episoden-/Reihencharakter vor Freigabe überprüfen |
| *Blink of an Eye Full Documentary* | Mehrdeutig | mehrere Werke mit identischem Titel, verschiedene Jahre; Dokumentation ist nicht automatisch kein Film |
| *World of Warcraft – O Filme da Historia* | Inhaltsrisiko | mutmaßliches Gaming-/Zusammenschnittmaterial; Filme/Serien nicht künstlich über TMDB zuweisen |
| *Turning Point Full Documentary* | Mehrdeutig | mehrere gleichnamige TMDB-Werke; Thema/Jahr/Regie fehlen |
| *Blood Line: The Life and Times of Brian Deegan* | Single-Filmhypothese | TMDB 808900 / 2018 / Δ0,1 min, mögliches Dokumentarwerk |
| *Reich und Arm – Staffel 1 … Deutsch lernen* | Inhaltsrisiko | Staffel-/Lernmaterial, möglicherweise kein eigenständiger Film; verführerische falsche `Rich Man, Poor Man`-Matches |
| *Das Beste kommt noch – Le meilleur reste à venir* | Single-Filmhypothese | TMDB 582206 / 2019 / Δ0,5 min; YouTube nennt 2020, mögliche Veröffentlichungsjahre/Edition prüfen |
| *Die Eider – von der Quelle bis zur Mündung* | Kein Alias | mögliche unabhängige Doku ohne TMDB-Eintrag: als Quelle nicht automatisch verwerfen |
| *Hummingbird: The Bitcoin Jungle Story* | Kein Alias | mögliche unabhängige Doku ohne Treffer; Filmwerke können außerhalb von TMDB vorhanden sein |
| *Man Bites Dog (Full Film)* | Laufzeitkonflikt | TMDB nennt auch *Mann beißt Hund* (1992, ID 10086), aber Score=0; stattdessen wurde ein anderes Titelwerk mit Score=2 auf Runtime geprüft – **heuristischer Fehler**, kein belastbarer Fassungs-/Laufzeit-Gegenbeweis |
| *African Home: The Covenant* | Kein Alias | möglicherweise Film ohne TMDB-Treffer, Kennzeichnung „offen“, nicht automatisch Nichtfilm |

## Qualitätsschwächen des aktuellen TMDB-Matchers (konkret aus echten Fällen)

1. **Erster Kandidat ≠ richtiger Kandidat.** Der Livebericht berechnet die TMDB-Laufzeit nur für den **ersten** gewerteten Filmkandidaten. Bei `War Story` wird dadurch eine Differenz von **83,3 Minuten** gegenüber einem offenbar anderen gleichnamigen Film gezeigt, obwohl `War Story` (TMDB **246013**, 2014) bereits aus dem älteren fünf-Originalvideo-Lauf als plausible Hypothese mit **0,7 Min.** Abweichung dokumentiert war. Daher `Δ83,3 min` **nicht** als Beweis ablehnen.
2. **Mehrsprachige Alias-Erkennung ist unzureichend.** `Man Bites Dog` ↔ `Mann beißt Hund` (TMDB **10086**, 1992) wurde trotz im Suchergebnis sichtbarem Kandidaten nicht richtig bewertet; `2010: The Year We Make Contact` ↔ TMDB-Titel `2010` (TMDB **4437**) erscheint aktuell fälschlich als `unmatched`, obwohl ein früherer Lauf Jahr/Regie und nur **0,2 Min.** Runtime-Differenz nahelegte. Gleiches Problem bei Deutschen Untertiteln und Originalsprachen.
3. **Teilzeichenketten-Ähnlichkeit produziert falsche Mehrdeutigkeiten.** `School of Rock` neben einem Making-of, `Hidden Figures` neben einem Making-of, `Shaun das Schaf – Der Film` neben dem Sequel, `Rambo II` neben `Rambo III`, `El Club` neben gleichnamigen Werken anderer Jahre. Verwandte Titel/Serien/Sequel ≠ gleichwertige Filmidentität.
4. **Film-/Serien-/Episoden-Trennung vor dem TMDB-Movie-Match.** `World of Warcraft`, `Reich und Arm – Staffel 1`, die einzelnen `Spreewaldkrimi – Film N`-Einträge und Konzerte/Sport-/Gaming- oder Sprachlernmaterial erfordern einen eigenen Quellentypstatus. Gleichnamiger Film in TMDB darf kein „Auto-Movie“ daraus machen.
5. **Datum, Fassung und verfügbare Metadaten differenzieren:** `Man Bites Dog` ist nicht derselbe Sachverhalt wie `Tarzan Aur Jadui Chirag` trotz beider Status `runtime-conflict`; unterjährige Veröffentlichungen und Fassungen können differieren. Filmjahr + Filmregie + Regiebesetzung + Alternativtitel + Laufzeit mehrerer Kandidaten erst **als Gesamtheit** prüfen, statt „nächstes Suchergebnis gewinnt“.
6. **Korrektur darf keine falschen Positiv-Zuordnungen erzeugen:** Nachjustierung soll mehr plausible `review`-Vorschläge liefern, aber `acceptedTmdbId` bleibt `null` und `verifiedWork` bleibt `false`, bis unabhängige Werks-/Fassungsbelege vorliegen.

## Empfohlene nächste begrenzte G1-Stufe

**Ein separates Matcher-Qualitätspaket, keine neue breite Discovery:**

- Kandidaten **titel-/sprachalias-sensitiv** gegen TMDB `alternative_titles`/Originalnamen/Jahr prüfen, **vor** der Film-/TV-Entscheidung und ohne eine fremde TMDB-Provider-Liste als Filter. Normierung bei Werktiteln vs. Editions-/Sammelbezeichnungen getrennt halten; Sprachen DE/EN gezielt statt wahlloser Neusuche.
- Mehrere ernsthafte Filmhypothesen pro Video (z. B. Top 3) mit getrennten `movie/{id}`-Details gegen YouTube-Laufzeit vergleichen; nicht nur das erste Suchergebnis. Das kostet zusätzliche TMDB-Leseanfragen und bekommt ein eigenständiges kleines Budget.
- **Erst** eindeutige Originaljahr-/Regie-/Versionsindikatoren priorisieren; echte Mehrdeutigkeit beibehalten, wenn mehrere Werke plausibel bleiben. Making-of/Sequel/TV-Serie gesondert, nicht als gleichwertiger gleichnamiger Film zählen.
- Ohne unabhängige Filmfassungs-/DE-Rechte-/Angebotsbelege **keine** produktive Freigabe, keine `free/ads/flat/rent/buy`-Badge-Daten.
- Nach einer konservativen Q/A-Runde gezielt zählen, wie viele **unterschiedliche kanonische** `(movie,tmdbId)`-Werke anhand unabhängiger Quellen tatsächlich bestätigt wurden; nicht die bisher nur recherchierten 100 `videoId`-Treffer damit gleichsetzen.
- Vor G2 [YouTube API Developer Policies III.E.2 Data Aggregation](https://developers.google.com/youtube/terms/developer-policies) und konkrete Datenfluss-/Branding-Architektur professionell abklären. Der [unversendete Compliance-Fragenentwurf](YOUTUBE_MOVIES_G1_YOUTUBE_API_COMPLIANCE_REQUEST_DRAFT_2026-10-21.md) liegt vor.

**Lieferstatus:** Reine historische Ergebnissicherung; **keine** App, Cloud, Firestore/Firebase, Nachtläufe, Titelbestände, Anbieterbadges oder Wiedergabelinks geändert. Issue #388 bleibt offen; G2–G4 nicht freigegeben.
