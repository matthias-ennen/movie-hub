# MovieHub XMLTV #336 – G1b: exakte Sender-IDs, lokales TMDB-Matching, gemeinsamer TV-Merge

Stand 11.11.2026. **Isolierte Vorschau / keine produktive Integration**. G0 und G1a sind bereits mit vollständiger grüner CI in `main`.

## 1. Verifizierte Quellen- und Senderkennungen

Beleg: echter JSON-Bericht des [XMLTV-G0-Runs #43083401056](https://github.com/matthias-ennen/movie-hub/actions/runs/43083401056), dessen Sender-ID-/Display-Name-Felder als Quelle für die **sechs** hier freigegebenen expliziten Zuordnungen verwendet wurden.

| Kanonische MovieHub-ID | Name | EPGSHARE01-ID | FreeEPG & IPTV-EPG.org DE-Block |
|---|---|---|---|
| `ard` | Das Erste | `Das.Erste.de` | `DasErste.de` |
| `zdf` | ZDF | `ZDF.de` | `ZDF.de` |
| `rtl` | RTL | `RTL.de` | `RTL.de` |
| `pro7` | ProSieben | `ProSieben.de` | `ProSieben.de` |
| `sat1` | SAT.1 | `SAT.1.de` | `SAT1.de` |
| `vox` | VOX | `VOX.de` | `VOX.de` |

Die kanonischen IDs stimmen mit `WAIPU_MOVIE_HUB_STATIONS` (derselbe Senderstamm für Joyn) sowie den bestehenden Waipu-Pilotstations überein. Der neue versionierte Katalog liegt in `src/sources/xmltv/xmltvStationMappings.js`. **Unbekannte/regionale/Nebensender** wie `ZDFneo.de`, `RTLHHSH.de`, `SAT1NDSBremen.de`, `VOXup.de` und die numerischen zusätzlichen FreeEPG-Kanäle bleiben bewusst **unmapped**. Kein unscharfes Namensmatching in Produktion.

Der DE-Block von FreeEPG und IPTV-EPG.org hat für die sechs Sender exakt gleiche Programm-Fingerprints und ist daher **eine Inhaltsfamilie trotz zweier Hostnamen**. EPGSHARE01 liefert abweichende Daten, ist derzeit aber kürzer (~3,2 Tage vs. 5 Tage im DE-Block).

## 2. Wiederverwendung des bereits vorhandenen Matchers

`scripts/xmltv-g1b-match-preview.mjs` verwendet **`matchJoynProgram()`** aus `scripts/joyn-tmdb-matcher.mjs`. Die Aufruferin stellt lokal vorhandene TMDB-Kandidaten zur Verfügung. **Keine** neuen oder ungeprüften TMDB-API-Requests, kein unabhängiger neuer Titelscorer. XMLTV-Medientypen müssen aus eindeutigen Kategorie-/Folgensignalen ableitbar sein; unbekannt oder widersprüchlich = **Review, keine Veröffentlichung**. Fehlende explizite Zeitzone = **Review**. Zum Schutz gegen falsch gleichnamige Werke akzeptiert der G1b-Prototyp nur eindeutige **exakte typisierte** Matches mit Score 100; schwächere/unentschiedene Ergebnisse bleiben dokumentierte Diagnosen.

Die positive Titelentscheidung ergibt hier zunächst einen **G1b-Vorschau-BroadcastEvent** im bereits bestehenden SourceEnvelope-Vertrag, keine Behauptung, dass die Sendung oder ihre Rechte/Links auf Geräten bereits bestätigt sind. Eine bloß gleiche Filmbetitelung ohne unabhängig belegtes Jahr, Werk- und Fassungsmerkmal bleibt ein mögliches Restrisiko. Vor einer Produktionsfreigabe folgen zusätzliche echte Samples und Qualitätsabnahme. Diese Vorschau-Schnittstelle darf nicht stillschweigend automatisch aktiviert werden.

## 3. Zusammenspiel mit Waipu und Joyn

`src/sources/mergeTvAirings.js` bleibt der **einzige** kanonische Airing-Merge. Für gleiche stationId, TMDB-Identität und überlappende Sendezeit werden gleichwertige Ausstrahlungen zusammengeführt. Die Quellen-Einträge `sourceRefs` werden nun zusätzlich gesammelt (ohne vorhandene Anbieter/PlaybackRoutes zu verlieren).

Ein generierter `SourceEnvelope` verlangt zusätzlich einen **unabhängig aus dem EPG-Quellenzustand gemessenen `sourceStatus`**. Die Zahl der sicher zugeordneten TMDB-Titel beweist weder `healthy` noch `degraded`; bei null Zuordnungen kann die Quelle trotzdem vollständig gesund sein.

Die XMLTV-Projektion setzt absichtlich `providerIds: []` und `playbackRoutes: []`; **XMLTV als Quellhost ist kein Live-TV-Anbieter**. Senderbezogene `AIR`-Aktionen und feste `scope=channel`-Links werden erst eingerichtet, wenn der Nutzer diese Senderziele gemeinsam festgelegt und auf Android/Fire TV getestet hat. Mediathek-Provider aus TMDB bleiben unabhängig (ZDF FREE / ZDF AIR können gleichzeitig existieren).

## 4. G1b-Abnahme und verbleibende Arbeit

- [ ] Offline-Tests und vollständige CI grün, besonders `tests/xmltv-g1b-match-merge.test.js` und bestehende `tests/merge-tv-airings.test.js`.
- [ ] XMLTV-Station-IDs gegen Original-G0-Artefakt und vorhandenen Waipu-Stationstamm prüfen; keine Regional-/Nebensender automatisch mappen.
- [ ] G1b-Projektions-/Merge-Tests mit zwei XMLTV-Quellen und Waipu/Joyn bestehen, inklusive Quellen-Provenienz.
- [ ] PR nach grüner CI nur als **isolierte, noch nicht produktiv angebundene Bausteine** übernehmen.
- [ ] **G1c als Folgepaket:** echte Feed-Titel-/Typ- und TMDB-Matching-Qualität anhand beschränkter, read-only Live-Proben messen. Zusätzlich Titeljahr/Fassung berücksichtigen; falsche Werkidentitäten blockieren; minimale Senderauswahl aus 5 Tage Vollabdeckung testen. Erst anschließend G2 Nightly-/Cache-/Ausfall-/App-Integration.
- [ ] Senderbezogene Wiedergabelinks bleiben **gemeinsame spätere Einzelabnahme**, keine fiktiven Links im Code.

**Technischer Status:** Quellvergleich G0, Rohparser G1a und G1b-Vorschau sind drei unterschiedliche Gates. Keine App-Anzeige, kein produktiver EPG, keine neue Anbieteraktion, keine Nightly-Änderung durch diesen PR.
