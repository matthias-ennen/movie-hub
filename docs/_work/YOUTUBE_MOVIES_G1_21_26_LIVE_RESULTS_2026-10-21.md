# MovieHub – G1 Livebefund: 21 Titelalias-Fälle + 26 öffentliche Titelindex-Kontrollen

**Stand:** 21. Oktober 2026, Originalberichte um ca. 13:36:50 UTC erzeugt. **Nur Forschung, kein produktiver Import.**

## Wirkliche Workflows und Originalbelege

| Prüfabschnitt | Echter Workflow | Ergebnis | Original-Artefakt |
| --- | --- | --- | --- |
| 21 fachlich offene YouTube-Video-IDs → TMDB Film-/TV-/Aliasprüfung | [#39609488229](https://github.com/matthias-ennen/movie-hub/actions/runs/39609488229) | **SUCCESS**, 103 lesende TMDB-GETs, kein neuer YouTube-API-Call | [#12349258409](https://github.com/matthias-ennen/movie-hub/actions/runs/39609488229/artifacts/12349258409), `21-identity-alias-review.md` |
| 26 vorläufige TMDB-Film-ID-Hinweise → veröffentlichter öffentlicher MovieHub-Suchindex/Browse-Katalog | [#39609504832](https://github.com/matthias-ennen/movie-hub/actions/runs/39609504832) | **SUCCESS** (Workflow), Search-Index geprüft, Browse-Katalog **nicht** gültig überprüft | [#12349283359](https://github.com/matthias-ennen/movie-hub/actions/runs/39609504832/artifacts/12349283359), `public-membership-26.md` |

**Verifikationsstatus:** Beide **echten originalen ZIP-Artefakte heruntergeladen, geöffnet und ausgewertet**. Beide Läufe starteten mit `workflow_dispatch` auf `main`. Ein grüner Workflow ist **keine** positive Film-/Länder-/Tarifverfügbarkeitsbescheinigung.

## Fachliche TMDB-Zuordnung: 21 G1-Video-ID-Fälle

| Diagnose aus tatsächlichem 21er-Bericht | Fälle | Interpretation |
| --- | ---: | --- |
| `single-film-hypothesis-review` | **5** | Ein bevorzugter Filmtitel-/Laufzeithinweis; noch **keine** Freigabe der Filmversion |
| `ambiguous-film-or-tv-review` | **10** | Mehrere Filmwerke oder Filmtitel/Serientitel überlagern sich |
| `tv-title-hypothesis-review` | **2** | Namens- oder Medienkollision; das beobachtete Video ist **nicht** dadurch als Serie bestätigt |
| `unresolved-review` | **2** | Keine ausreichende belastbare Werkszuordnung anhand TMDB-Titel-/Version-Hinweisen |
| `non-film-risk-review` | **2** | Konzertmitschnitt / Serien-Teilmaterial; Negativkontrollen, nicht ungeprüft als Spielfilme zählen |
| **Gesamt** | **21** | **0** maschinell bestätigte Filmwerkidentitäten |

Die fünf vorläufigen stärkeren Filmhypothesen aus dem Report (alle **review**, keine Auto-Matches):

| YouTube-Titel laut bisheriger Quelle | Mögliche TMDB-Film-ID | Jahr | TMDB-Laufzeit | Unterschied zum YouTube-Metadatenwert |
| --- | ---: | ---: | ---: | ---: |
| `2010: The Year We Make Contact` | [4437](https://www.themoviedb.org/movie/4437) | 1984 | 116 min | 0,2 min |
| `War Story` | [246013](https://www.themoviedb.org/movie/246013) | 2014 | 90 min | 0,7 min |
| `Isn't She Great? – Ist sie nicht großartig?` | [75531](https://www.themoviedb.org/movie/75531) | 2000 | 95 min | 0,3 min |
| `El Club (OmU)` | [319995](https://www.themoviedb.org/movie/319995) | 2015 | 97 min | 3,8 min |
| `Das Protokoll – Mord auf höchster Ebene` | [394645](https://www.themoviedb.org/movie/394645) | 2016 | 115 min | 0,6 min |

**Besonders wichtig:** `Police Story`, `School of Rock`, `Baywatch`, `Sahara`, `The Amateur`, `Paradise`, `Mountain`, `Napoleon` haben trotz teilweise sehr gutem Laufzeitabgleich weiterhin mehrere mögliche Fassungen oder Film-/Serien-Hypothesen. `Operation Arsenal – Widerstand in Warschau` weist einen nahegelegenen Filmkandidaten auf, wird wegen unbestätigtem Titel-/Fassungsalias aber als `unresolved-review` geführt. `Peter Maffay – Niemals war es besser – Live` sowie `Janette Oke: Die Coal Valley Saga Teil 6` sind Negativkontrollen. Die Regeln dürfen keine unklaren Filmfassungen anhand von `title`, Laufzeit oder YouTube-`videoType=movie` allein automatisch verifizieren.

## Öffentlicher MovieHub-Titelbestand: 26 vorläufige TMDB-Film-IDs

**Originalreport:** veröffentlichter `search-index.json` ist gültig, Erzeugungsdatum **2026-10-21T01:54:14.490Z**, **20.671** Einträge. Das Resultat bezieht sich **ausschließlich auf den zu diesem Zeitpunkt gelesenen öffentlichen MovieHub-Suchindex**, nicht auf persönliche Titel oder sämtliche existierenden TMDB-Filme.

| Kennzahl | Live-Ergebnis |
| --- | ---: |
| Vorläufige, **nicht bestätigte** TMDB-Film-ID-Hinweise, die geprüft wurden | **26** |
| Davon im **öffentlichen Suchindex** geführt | **13** |
| Davon im **öffentlichen Suchindex** nicht geführt | **13** |
| Im separaten **öffentlichen Browse-Katalog** geprüft | **unbekannt** – Antwort war `unavailable-or-invalid` |
| Bestätigte NEUE MovieHub-Filme aus diesem Befund | **0** (keine filmfachlich oder produktiv freigegeben) |

**Im öffentlichen Search-Index vorhanden:** `10112`, `1221061`, `788921`, `1369`, `311301`, `555457`, `670266`, `1242898`, `969681`, `1291595`, `1258479`, `1212763`, `687163`.

**Im öffentlichen Search-Index nicht gefunden:** `26022`, `180863`, `111196`, `14105`, `174341`, `15198`, `14053`, `80530`, `160165`, `446308`, `17819`, `242065`, `532812`.

**Kein globaler Negativnachweis:** Der produktive öffentliche Suchindex und der Browse-Katalog sind verschiedene Datenmengen; persönliche TMDB-Titel und konto-/profilgebundene MovieHub-Werke sind nicht abgedeckt. Der GitHub-Checkout enthält ebenfalls nur einen leeren Katalog-Fallback und keinen öffentlichen Search-Index. Ein „nicht im öffentlichen Suchindex“ darf **nicht** in „nicht in MovieHub“ oder „nicht bei TMDB/YouTube verfügbar“ umbenannt werden. `Browse`-Befund darf weder als `0` noch als `nicht enthalten` ausgegeben werden, da die Antwort `unavailable-or-invalid` war und der Originalbericht die konkrete Fehlerursache nicht enthält.

## Architektur- und Compliance-Gates

1. **YouTube-first bleibt unabhängig:** Direkt von YouTube entdeckte Filme dürfen auch ohne vorhandenes TMDB-/MovieHub-Seed Kandidaten bleiben. TMDB `(mediaType, tmdbId)` ist nach dem Film-/Fassungsreview der Werkidentitätsanker, **kein** Discovery-Pflichtfilter. TMDB-first reichert bereits bekannte Werke an.
2. **Keine falschen Positiva:** 47 gesichtete öffentliche DE-Region-Video-IDs ≠ 47 bestätigte Filme; 26 TMDB-Filmhinweise ≠ 26 gesicherte Werke; 13 fehlende Suchindex-IDs ≠ 13 nachweislich neue MovieHub-Filme. Auch DE-Allowed-Metadaten beweisen weder echte Playback-Route noch Preis, Freischaltung oder Tarif.
3. **YouTube-Bedingungen ernst nehmen:** [YouTube API Developer Policies, III.E.2 „Data Aggregation“](https://developers.google.com/youtube/terms/developer-policies) enthalten eine deutliche Einschränkung kanal-/rechteinhaberübergreifender Aggregation von YouTube-API-Daten. Bereits die konkrete geplante Gesamtanzeige in MovieHub muss vor irgendeiner produktiven Multi-Owner-Integration rechtlich/compliance-seitig geklärt sein. Bloß getrennte Badge-Anzeige ist **keine** automatisch bestätigte Ausnahme.
4. **Forschung begrenzen:** Die beiden abgeschlossenen Testläufe erstellten ausschließlich temporäre private Forschungsberichte. Vor weiteren API-Runs zuerst prüfen, ob die verfügbaren Werk-/Alias-Metadaten eine eindeutige Freigabe überhaupt erlauben. Kein neuer ungerichteter YouTube-Suchlauf, kein automatischer Import, keine Firestore- oder Nachtlauf-/Badge-Änderung ohne separates G2-Go.

## Geordneter nächster G1-Schritt

- **Priorität A:** Bei fünf besonders guten TMDB-Hypothesen **werk-/fassungsgenaue Validierung** (Original-/Übersetzungstitel, Erscheinungsjahr, YouTube-Seitentyp und exaktes Deep-Link-Ziel). Die fünf bleiben bis zum Ergebnis als `review`.
- **Priorität B:** Die 10 mehrdeutigen Fälle anhand Jahr, Originaltitel, Laufzeit, ggf. Produzent/Regie, Fassung und alternativen TMDB-Titeln gezielt manuell klären; Film-/TV- und Konzert-/Teilkonflikte konsequent aussondern.
- **Priorität C:** Den öffentlichen Browse-Katalog separat anhand tatsächlicher technischer Antwort validieren, ohne Platzhalter als Live-Katalog zu behandeln. **Kein** blinder Retry im Nightly.
- **Priorität D:** Das vorgesehene rechtssichere YouTube-Quellen-/Such-/Wiedergabekonzept prüfen, bevor die multiquellenfähige G2-Datenhaltung freigegeben wird.

**Status #388:** G1 noch offen; bisher **0** YouTube-Titel produktiv aufgenommen, keine Anbieterbadges, keine neuen PlaybackRoutes, kein Cloud- oder Client-Deployment aus diesen beiden Nachprüfungen.
