# MovieHub G1 – echter Vergleich von drei YouTube-Data-API-Sortierungen (21.10.2026)

**Primärbeleg:** [GitHub-Workflow #39597247661](https://github.com/matthias-ennen/movie-hub/actions/runs/39597247661), Event `workflow_dispatch`, **SUCCESS**. [Original-Artefakt #12344466389](https://github.com/matthias-ennen/movie-hub/actions/runs/39597247661/artifacts/12344466389), Datei `three-sort-compare.md`, wurde heruntergeladen und tatsächlich gelesen. Forschung von 2026-10-21 12:08:51 UTC. Ausschließlich öffentliche YouTube- und TMDB-GETs; kein Import in MovieHub.

## Auftrag und genau gleiche Abfragebedingungen

Je **ein** `search.list` für `viewCount` (meistgesehen), `date` (neueste Uploads), `rating` (interner YouTube-Bewertungsscore); `part=snippet`, `type=video`, `videoType=movie`, `regionCode=DE`, `maxResults=50`, **ohne** zusätzlichen Suchterm `q`, ohne feste Kanal-ID. So wurden genau drei erste Suchergebnisseiten verglichen. Anschließend wurden die **140 unterschiedlichen IDs** aus 150 Suchtreffern in **drei** `videos.list`-Calls auf die echten `channelTitle`, Kanal-IDs, öffentliche Sichtbarkeit, Dauer von mindestens 60 Minuten und DE-Region geprüft. Nur Label `YouTube Movies` und DE nicht ausdrücklich ausgeschlossen gelten als vorläufige G1-Kandidaten. `regionCode=DE` plus `regionRestriction.allowed` sind kein Wiedergabe-/Kaufrecht.

## Gemessene Ausbeute

| Sortierung | Suchtreffer (erste Seite) | YouTube-Movies-Label | G1-Kandidaten ≥60 Minuten, öffentlich, DE nicht ausgeschlossen | Andere Kanäle |
| --- | ---: | ---: | ---: | ---: |
| `viewCount` | 50 | 6 | **5** | 44 |
| `date` | 50 | 1 | **1** | 49 |
| `rating` | 50 | 18 | **18** | 32 |

- Alle drei Aufrufe waren API-technisch **erfolgreich**, alle drei wiesen zusätzliche Seiten auf. Die Folgeseiten wurden wegen festgelegter Pilotgrenze nicht gelesen.
- **24 verschiedene YouTube-Movies-Kandidaten-IDs**, darunter **kein einziger Mehrfachtreffer** zwischen den drei qualifizierten Listen. Insgesamt 140 verschiedene rohe Videosuch-IDs; zehn Überschneidungen bestanden nur im unbereinigten Suchpool.
- Bei den **24 YouTube-Movies-Treffern fehlte in der `videos.list`-Antwort jeweils die auswertbare `statistics.viewCount`**, daher im Artefakt `?`; daraus keine YouTube-internen View-Rangwerte, statistischen Views oder Miet-/Kaufbeliebtheiten ableiten. `order=viewCount` der globalen Suche und eigene Viewzahl der Movie-Kanäle dürfen nicht verwechselt werden.
- **36 lesende TMDB-Requests** für alle 24 Kandidaten: 12 `plausible-review` (exakter Titelalias und maximal 15 Minuten Laufzeitdifferenz), 4 `ambiguous-review`, 8 `unmatched-or-title-variant`. **Null** verbindlich freigegebene Werkzuordnungen oder Rechtebelege.
- Zur Qualitätsprüfung: `rating`-Gruppe umfasst z. B. das **Peter-Maffay-Livekonzert** und **Janette Oke: Die Coal Valley Saga Teil 6**. Lange Video-Laufzeit und YouTube-Label reichen also **nicht**, um die Filmeigenschaft oder TMDB-Medientyp korrekt zu bestimmen. Einige Movie-IDs können Film-Events, Konzertinhalte oder Episoden sein.

## Die 24 originalen YouTube-Movies-Kandidaten (nur API-Metadaten, keine bestätigten Filmtitel/Werkidentitäten)

| Sortierung | YouTube-Anzeigename | Video-ID | TMDB-Status |
| --- | --- | --- | --- |
| viewCount | Police Story | `IxL_x8G1_FU` | ambiguous-review |
| viewCount | School of Rock | `RrR7rAvdEUE` | plausible-review |
| viewCount | Baywatch | `unV_jg5B7mI` | ambiguous-review |
| viewCount | Vier Kids und der magische Sandelf | `4RCqKX8K83A` | plausible-review |
| viewCount | Rache - Vergeltung hat ihren Preis | `HvrbUMWtRkk` | plausible-review |
| date | Jagdgeschwader Wildkatze | `9PsAlt9VHQ0` | unmatched-or-title-variant |
| rating | Some Velvet Morning | `X83UMdFJkD8` | plausible-review |
| rating | Mystery - New York: Ein Spiel um die Ehre | `tk1rk-m3hvc` | plausible-review |
| rating | Paradise | `4Dy4kWCnXxY` | ambiguous-review |
| rating | Peter Maffay - Niemals war es besser - Live - Arenatour 2015 | `yhPTiB5EDq4` | unmatched-or-title-variant |
| rating | Back In Time OmU | `3SJO7aaY8r8` | unmatched-or-title-variant |
| rating | Operation Arsenal - Widerstand in Warschau | `n4tAw7v73Cc` | unmatched-or-title-variant |
| rating | Isn't She Great? - Ist sie nicht großartig? | `6f5O_yR5hUc` | unmatched-or-title-variant |
| rating | El Club (OmU) | `ImYG7I2Z2yM` | unmatched-or-title-variant |
| rating | Mountain | `sL38Hwd0rwY` | ambiguous-review |
| rating | Schlappschuss 3 - Die Junior Liga | `EFRNDiFXTKs` | plausible-review |
| rating | Magic Beyond Words: Die zauberhafte Geschichte der J.K. Rowling | `n0AQvakU8VI` | plausible-review |
| rating | Im Namen des... | `vA9VaqicDQI` | plausible-review |
| rating | Mein bester Feind | `RxhyuyCQq-I` | plausible-review |
| rating | Die Gabe zu heilen | `LHzf_KpCU-g` | plausible-review |
| rating | Ninas Alibi | `cTympGJiyGo` | plausible-review |
| rating | LUCIA - Engel des Todes? | `s0Ez7ljobJc` | plausible-review |
| rating | Das Protokoll - Mord auf höchster Ebene | `ClLIOYaxXy0` | unmatched-or-title-variant |
| rating | Janette Oke: Die Coal Valley Saga Teil 6 - Entscheidungen | `UCJKGbgBXd0` | unmatched-or-title-variant |

## Deduplizierung gegen die vorherigen G1-Forschungsartefakte

- Der frühere [20-Suchbegriffe-Pilot #39584388602](https://github.com/matthias-ennen/movie-hub/actions/runs/39584388602) lieferte **12** eindeutige vorläufige YouTube-Film-Video-IDs, nicht 50. Der [öffentliche Upload-Feed-Pilot #39586142933](https://github.com/matthias-ennen/movie-hub/actions/runs/39586142933) fand zusätzlich **2** neue IDs, also bisher **14**.
- Diese **24** sortierten Kandidaten enthalten **2** IDs, die bereits bekannt waren: **Police Story** `IxL_x8G1_FU` (aus dem 20-Suchbegriffe-Pilot) und **Jagdgeschwader Wildkatze** `9PsAlt9VHQ0` (aus dem Upload-Feed-Pilot). Der neue Sortiervergleich liefert daher **22 tatsächlich neue Video-IDs** gegenüber diesen beiden Piloten.
- Die [zwölf Nutzerlinks #39593679849](https://github.com/matthias-ennen/movie-hub/actions/runs/39593679849) bestanden aus **11 öffentlich sichtbaren YouTube-Movies-Vollfilmlaufzeit-Kandidaten** und einem **nicht gelisteten, fachfremden Kurzvideo**, das **nicht** als Movie-Kandidat mitgezählt werden darf. Von den **11** öffentlichen YouTube-Movies-Video-IDs kommt **keine** in den oben genannten 14+24 Kandidaten vor.
- Damit ergibt sich G1-übergreifend eine **Roh-Evidenzmenge von 47 unterschiedlichen vorläufigen YouTube-Movies-Video-IDs** (12 Grundsample + 2 neue Upload-Funde + 22 neue Sortierfunde + 11 aus Nutzerlinks). Die 47 sind **keine 47 unterschiedlichen TMDB-Filmwerke oder freigegebenen Filme**. Gleiche Filme könnten mehrere Video-IDs haben; Konzerte, Serienepisoden und alternative Fassungen müssen entfernt werden. Der 50-**geprüfte-Filme**-Gate ist **nicht erreicht**.

## Entscheidung für die nächste G1-Phase

**Beibehalten:** `rating` unter gleichen API-G1-Suchbedingungen ist für die **Kandidatenentdeckung** besser als `viewCount` oder `date` auf der ersten Seite (18 vs. 5 vs. 1), trotz unklarer filmischer Genauigkeit und möglicher Keyword-/Ranking-Biases. **Nicht als Ranking für MovieHub verwenden**: weder APIscores noch Views spiegeln dokumentierte deutsche Leih-/Kauf-Beliebtheit wider.

**Qualitätsarchitektur:** TMDB `(mediaType,tmdbId)` als kanonische Identität, belegt in TMDB-DE mit YouTube-Anbieter und Angebotskategorie; danach YouTube-spezifische VIDEO-ID-/Laufzeit-/Titel-/Region- und Werkidentitätsprüfung, Serie/Konzert/Clip/Movie konsequent trennen. Für zusätzliche G1-Proben gezielte TMDB-DE-YouTube-Anbieterseeds und query-beschränkte Suchen entwickeln – nicht beliebig `rating`-Ergebnisfolgen abgrasen; API-Quota beachten und weitere Schritte explizit freigeben.

**Grenze:** Der Test war ausschließlich lesend, keine Datenübernahme, keine Badges, kein automatisierter Nachtlauf, kein Firestore/Firebase/Android/TV-Update. G1 #388 bleibt zur Identitäts-/Quellenqualität offen. G2–G4 weiter nicht freigegeben.
