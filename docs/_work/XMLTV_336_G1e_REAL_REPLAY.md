# MovieHub #336 – G1e Teil 2a: realer Waipu-/Joyn-Überlappungsnachweis

**Referenz:** Erfolgreicher zentraler Nightly-Run [#43150253272](https://github.com/matthias-ennen/movie-hub/actions/runs/43150253272) vom 12.11.2026, dessen GitHub-Artefakt `source-adapter-artifacts-43150253272-1` enthält zwei vollständige, **healthy** SourceAdapter-Generationen, den Waipu- und Joyn-Live-Index mit echten Matcher-Zählerständen.

**Ziel:** Den Nutzen der bereits gemergten G1d/G1e-Infrastruktur **an echten, abgeschlossenen Quellgenerationen** prüfen, ohne voreilig freizugeben oder hypothetische Überschneidungen als gesparte TMDB-Aufrufe zu deklarieren.

## Vorläufige Ausgangsanalyse des Originalartefakts

| Technischer Befund | Echte Ereignisse |
|---|---:|
| Waipu-BroadcastEvents | 46.089 |
| Joyn-BroadcastEvents | 23.785 |
| Gemeinsame kanonische Sender-IDs | 52 |
| Joyn-Ausstrahlungen mit zeitlich überlappendem Waipu-Sendeplatz | 10.799 |
| Davon dieselbe TMDB-Werk-ID und derselbe Medientyp | 10.481 |
| Davon unterschiedliche TMDB-Werk-IDs/-Typen | 318 |
| Darunter Sendeplätze mit mehreren Waipu-Kandidaten | 2 |
| Ursprüngliche EPG-Programmtitel im **Waipu-BroadcastEvent** | **0** |
| Ursprüngliche EPG-Programmtitel im **Joyn-BroadcastEvent** | 23.785 |

Hinweis: Die beiden gleichen TMDB-Werke müssen **nicht dieselbe Serienepisode** sein. Eine weiterführende Prüfung ist notwendig. Der Konfliktwert darf nicht einfach als Fehlzuordnungsquote der Quellmatcher gelesen werden: Programmverschiebungen, mögliche regionale Unterschiede, Sendeplanaktualisierungen und unterschiedliche Werkerkennung müssen auseinandergehalten werden.

## Bereits vom echten Nightly erfasste Suchzähler

Der archivierte Waipu-Live-Index enthält `tmdbRequests = 1.677`; der Joyn-Live-Index enthält `tmdbSearchRequests = 1.597` und `matchCacheHits = 48.750`. **Diese Zähler beschreiben die damals tatsächlich geleisteten unabhängigen Such- und Cacheoperationen. Sie sind weder ein G1e-Test noch eine Ersparnismessung.** Ein identischer TMDB-Film in 1.000 Sendefenstern kann durch lokale Caches bereits mit null zusätzlichen API-Anfragen verarbeitet worden sein.

## Reproduzierbare, rein lesende QA im Repository

`scripts/epg-g1e-real-adapter-overlap.mjs` vergleicht die beiden SourceAdapter-Envelopes in einem stationweise begrenzten Zeitindex. Zeitliche Kriterien stammen exakt aus `mergeTvAirings`: **maximal fünf Minuten Startabweichung und mindestens 80 % Intervallüberlappung**. Der Vergleich ist für große Quellen performant und schließt ungültige Stationen/Intervalle und nicht-healthy Quellen aus.

`.github/workflows/shared-epg-g1e-real-replay.yml` kann für den gezielten Branch und manuell laufen. Der Job lädt über ein **GitHub-Actions-Lesetoken** genau das bekannte echte Nightly-Artefakt, prüft die bereits vorhandenen SourceAdapter-Zeitfenster und publiziert ausschließlich einen **aggregierten Ergebnisbericht** ohne rohe Programmtitel, TMDB-IDs oder Playback-URLs. Er führt weder TMDB-/YouTube-Netzwerksuchen noch Firebase-/Nightly-Schreibaktionen aus.

**Wichtig:** Keine der vorliegenden Ausstrahlungs-Envelopes ist ein unabhängiger, ausdrücklich freigegebener `approved: true`-Matcherbeleg für die G1e-Evidenz-Brücke. Ebenso hat Waipu dort keinen Original-EPG-Programmtitel. Deshalb ist `canAutomaticallySeedSharedIndex: false` zu Recht fest kodiert. Die Kennzahl `measuredAvoidedTmdbRequests` bleibt **null/unbekannt**, niemals die Summe identischer TMDB-Identitäten.

## Noch offen – G1e Teil 2b

1. **Waipu:** Ursprünglichen verifizierten EPG-Titel direkt aus der bestehenden Matching-Stufe zusammen mit der bestätigten Zuordnung als expliziten, begrenzten Matcherbeleg exportieren. Kein Wiederherstellen aus TMDB-Titeln. Die Quelle muss eindeutig bleiben.
2. **Joyn:** Die vorhandenen originalen Titel mit positivem Matcherentscheid, Provenienz, exakter Programm-ID und Zeitfenster aus derselben Generation verbinden.
3. **XMLTV:** Erst nach überprüftem Matcherbeleg in denselben sicheren Index einspeisen; freie Genrebezeichnungen reichen nicht.
4. **Kontrollierter Shadow-/Dry-Run:** Bei denselben echten Quellprogrammen, identischen lokalen Caches und Kandidaten zweimal durch den vorhandenen Matcher (gemeinsamer Cache aus/an) und die **echten TMDB-Aufrufzähler** getrennt protokollieren. Stale/ambiguous/conflicting Fälle müssen unbedingt am unabhängigen Matcher bleiben.
5. Erst bei wiederholt hoher Zuordnungsqualität, geprüfter Quelle/Frische/Lizenz und messbarem Nutzen das G2-Produktiv-Gate diskutieren. **Keine** freie AIR-Link-Schätzung, kein vorzeitiger Firebase-/Nightly-/TV-Umbau.

**Vorschlagsstatus:** G1e-2a ist ein *nicht-produktiver* Qualitätspilot. Änderungen betreffen ausschließlich Skript, Tests, QA-Workflow und Dokumentation.
