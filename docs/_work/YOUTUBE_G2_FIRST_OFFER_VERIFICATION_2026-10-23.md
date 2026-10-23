# YouTube G2 – erster DE-Angebotsnachweis und Freigabe-Eingang (23.10.2026)

Status: **Review vorbereitet, 0 produktive positive Freigaben**. Arbeitspaket [#388](https://github.com/matthias-ennen/movie-hub/issues/388), technische Grundlage [PR #539](https://github.com/matthias-ennen/movie-hub/pull/539).

## Echte aktuelle Quelle (nicht mit einer Angebotserlaubnis verwechseln)

Deploy [#39922192852](https://github.com/matthias-ennen/movie-hub/actions/runs/39922192852), Original-Artefakt `source-adapter-artifacts-39922192852-1` (#12488066643), `artifacts/youtube-g2/curated-production-sync/qa.json`, beobachtet 23.10.2026 08:07:40 UTC.

- Beide kuratierten Playlists vollständig gelesen: **46 eindeutige Video-IDs**, davon **21 FREE**, **25 Rent & Buy**, **0 aktuelle Doppelmitgliedschaften**.
- **36** Filmidentitäts-Reviewkandidaten, **9** ohne Videometadaten, **1** Screening-Ablehnung (YouTube-ID `OVNYmGj3ii4`, lediglich etwa 30 Sekunden). **0** unabhängig bestätigte DE-Filmangebote und **0** direkte PlaybackRoutes.
- Nutzerentscheidung: **FREE vor Rent & Buy**, wenn dieselbe Video-ID in beiden Listen vorkommt. Die ursprünglichen Playlist-Referenzen bleiben erhalten.
- Jedes Video aus einer kuratierten Playlist bleibt bis zur unabhängigen Werk-/Fassungs-/Region-/Tarif-/Quellenprüfung ein **Kandidat**, kein bestätigtes Angebot. Der API-Status `deRegionSignal='allowed'` beweist keine tatsächliche freie deutsche Wiedergabe.

## Priorisierte manuelle Echtdatenprüfung – derzeit keine Freigabe

| Priorität | Kandidat | Exakte YouTube-Video-ID | Kuratierte Klasse | TMDB-Werkhypothese | YouTube-Laufzeit | Unabhängiger Werk-/Anbieterhinweis | Offener Nachweis |
|---|---|---|---|---|---|---|---|
| 1 | Der Geist und die Dunkelheit (1996) | `1uf2AMrQMk0` | FREE | Film `10586` | 110,0 Min. | JustWatch DE meldet *YouTube Free*; Film 109 Min., Stephen Hopkins / Michael Douglas / Val Kilmer | **Exakte Video-ID** auf deutschem Android und Fire TV starten; wirkliche Filmfassung und ohne Leih-/Kaufzahlung verfügbare Wiedergabe protokollieren |
| 2 | The Humanity Bureau (2017) | `6FAtKb7CHxE` | FREE | Film `456048` | 90,7 Min. | JustWatch DE meldet *YouTube Free*; Werk 94 Min. (abweichende Laufzeit: Fassung prüfen) | Exaktes Video, Filmfassung, tatsächliches deutsches FREE-Angebot und Geräte-Wiedergabe |
| 3 | Freaks – Sie sehen aus wie wir (2018/19) | `0nBiidtN7ZU` | FREE | Film `539892` | 105,4 Min. | Der Filmtitel/-laufzeitmatch ist plausibel, aber einzelne deutsche Anbieterübersichten führen YouTube als Rent/Buy | **Tarifwiderspruch** prüfen, keine automatische FREE-Freigabe |
| 4 | Cold Skin – Insel der Kreaturen (2017) | `isr4nJyWhTg` | FREE | Noch eindeutig im TMDB-Abgleich festzuhalten | 106,5 Min. | Andere Anbieterübersichten führen YouTube als kostenpflichtiges Angebot | Tarifwiderspruch prüfen, keine automatische FREE-Freigabe |

Die TMDB-IDs sind **Werkhypothesen für den manuellen Review** (keine bestätigte Zuordnung dieser konkreten YouTube-Video-ID zur kompletten Originalfassung).

Quellen (zum Zeitpunkt der Recherche, ausdrücklich **keine Garantie des exakten YouTube-Videos**):
- https://www.justwatch.com/de/Film/Der-Geist-und-die-Dunkelheit
- https://cinegraph.org/movies/the-ghost-and-the-darkness-1996
- https://www.justwatch.com/de/Film/The-Humanity-Bureau
- https://www.wikidata.org/wiki/Q29906269
- https://www.justwatch.com/de/Film/Freaks-Sie-sehen-aus-wie-wir
- https://www.kinocheck.de/film/020/cold-skin-2018/streams
- https://support.google.com/youtube/answer/16618963?hl=de

## Nachweis je Video vor Freigabe

1. Exakte `https://www.youtube.com/watch?v=<Video-ID>` in **Deutschland** öffnen. Nicht auf Suche oder eine andere Video-ID ausweichen.
2. Prüfen, ob vollständiger Film bzw. konkret zugelassene Fassung statt Trailer/Ausschnitt vorliegt; mit Werk/TMDB-ID/Jahr, Laufzeit, Besetzung oder echten Szenen nachvollziehbar abgleichen.
3. Auf Android und Fire TV exakt dieses YouTube-Ziel öffnen; tatsächlich startende Wiedergabe und eventuelle Konto-/Tarif-/Paywall-Anforderung dokumentieren. Kein Abspielen ohne Nutzungsberechtigung umgehen.
4. Wirkliche Angebotsart dokumentieren: FREE (gegebenenfalls werbefinanziert), Rent oder Buy. FREE und R&B sind zunächst **kuratierte Kategorien**; ein deutscher YouTube-Free-Eintrag für das Filmwerk ist noch kein Beweis für die konkrete Video-ID.
5. Publisher/Herkunft und zulässige Datenverwendung gesondert dokumentieren, einschließlich offenem Gate #112, bevor `sourceUseAuthorized=true` gesetzt wird.
6. Datum, Quelle, genaue YouTube-ID, Film-/TMDB-ID und konkrete Beobachtung im Issue #388 festhalten; manuelle Geräteabnahme ausschließlich vom tatsächlichen Tester bestätigen lassen.

## Dauerhafter, kontrollierter Freigabeweg

Das bestehende Live-Skript `scripts/youtube-g2-curated-source-sync-live.mjs` liest zunächst höchstens **eine** geprüfte Freigabequelle:

- explizit von einem berechtigten Lauf vorbereitete, nicht versionierte `artifacts/youtube-g2-independent-approvals.json` oder
- **nach tatsächlicher fachlicher Abnahme** als GitHub-PR geprüfte, versionierte `.github/youtube-g2/independent-approvals.json` (absichtlich **noch nicht** vorhanden).

Fehlen beide, bleiben die bisherigen TMDB-Badges und YouTube-Suchfallbacks bestehen; es erscheinen **0** neue bestätigte Routen. Sind beide vorhanden, scheitert der Quellenlauf mit `YOUTUBE_APPROVAL_SOURCES_AMBIGUOUS` statt eine der Freigaben unbemerkt zu bevorzugen. Ungültiges JSON und nicht signierte oder abgelaufene Freigaben werden abgelehnt. An der vorhandenen maximalen Nachweisaltergrenze von 30 Tagen ändert sich nichts.

**Wichtig:** Die neue, optionale Dateiadresse ist **kein** Einverständnis mit dem Inhalt einer zukünftigen Freigabedatei. Es dürfen keine synthetischen `workIdentityVerified`/`dePlaybackVerified`/`sourceUseAuthorized`-Zusagen eingecheckt werden. Eine erste reale Freigabe benötigt die oben beschriebenen unabhängigen Nachweise und eine ausdrückliche fachliche Bewertung. Die parallele Quellenaggregation/-Compliance-Frage bleibt bis zur Klärung separat offen.

## Abnahme-/Umsetzungsstand

- [x] Aktuelle Original-46er-QA einzeln gelesen und Kandidaten priorisiert.
- [x] FREE-vor-R&B-Regel auf `main` mit Tests und Firebase-Deploy nachgewiesen.
- [ ] Exakte YouTube-Video-ID und Filmfassung unabhängig positiv bestätigt.
- [ ] FREE/R&B für die konkrete Video-ID und Deutschland unabhängig bestätigt.
- [ ] Echte Android- und Fire-TV-Wiedergabe des freigegebenen Videos abgenommen.
- [ ] Quellen-/Nutzungsberechtigung für die konkreten API-Daten geklärt.
- [ ] Erstes gültiges Freigabebündel fachlich freigegeben und sicher eingecheckt.
- [ ] Neue konkrete PlaybackRoute im produktiven SourceEnvelope, Direktlink-Index und auf Poster/Detailseite nachgewiesen.

Issue #388 bis zum wirklichen positiven Test offen lassen.
