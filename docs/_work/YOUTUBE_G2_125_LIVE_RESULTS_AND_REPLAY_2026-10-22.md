# MovieHub G2: tatsächliche 125er-Live-Auswertung und exakt vergleichbarer Replay

**Stand: 22.10.2026.** Originalprotokoll: [GitHub Actions #39754462653](https://github.com/matthias-ennen/movie-hub/actions/runs/39754462653), internes Artefakt `youtube-g2-125-new-preimport-39754462653` (Artefakt-ID 12414648272), `qa.json` und `report.md`, erzeugt 2026-10-22T09:19:37.112Z. Alle Zahlen stammen direkt aus dem echten GitHub-Artefakt, **nicht** aus Mock-Tests.

## Tatsächliche quantitative Ergebnisse

| Kategorie | CiNENET Deutschland | Netzkino | Gesamt |
| --- | ---: | ---: | ---: |
| Neue screen-geeignete eindeutige YouTube-Video-IDs | 90 | 35 | **125** |
| Führende TMDB-Filmhypothesen (inkl. TV-Alternative) | **5** | **23** | **28** |
| TMDB-Suche liefert keinen Filmkandidaten | **76** | **3** | **79** |
| Mehrdeutige Filmwerke | 2 | 7 | **9** |
| Expliziter Jahreskonflikt | 7 | 0 | **7** |
| Werk-/Fassungs-Laufzeitkonflikt | 0 | 2 | **2** |

200 Playlist-Video-IDs auf 4 Quell-Playlistseiten untersucht; 139 videos.list-Metadatensätze aufgelöst; 20 bekannte G2-Test-IDs ausgeschlossen, weitere 14 neue Videometadaten wegen Source-Screening verworfen; 9 YouTube- und 375 TMDB-Leseabfragen. API-Lauf vollständig erfolgreich, **keine** Produktions-Schreibzugriffe. Echte MovieHub-Katalogbestandsliste war **nicht geladen**; keine belegten Zahlen für bereits vorhandene/neue Titel. 28/125 = 22,4 % **relative führende Kandidaten**, **kein** unabhängig erhobener Precision-/Accuracy-Wert.

## Präzise Schwachstelle in der Quellvorbereitung

Anders als Netzkino verwendet CiNENET häufig `Filmtitel (Produktionsjahr) [Genre] [Genre] SEO-Marketingsatz`. Die bisherige Aufbereitung entfernte nur viele runde werbliche Klammern, nicht jedoch die **eckigen Genre-Blöcke** und den nachfolgenden Satz. TMDB bekam lange unsinnige Suchphrasen.

Echte Beispiele aus Originalartefakt, die als `review-no-movie-candidate` endeten:
- `Iron Soldier (2011) [Action] [Sci-Fi] Die ultimative Kampfmaschine Ganzer Film auf Deutsch`
- `King of Comedy (1999) [Eastern] [Komödie] Stephen Chows Kult-Klassiker Ganzer Film auf Deutsch`
- `Dracula Reborn (2012) [Horror] Vampir-Schrecken im modernen Gewand Ganzer Film auf Deutsch`
- `Cheerleaders Wild Weekend (1979) [Komödie] Wildes Entführungs-Chaos Ganzer Film auf Deutsch`
- `Vollmacht zum Mord (1975) [Thriller] Ava Gardner im Spionage-Thriller Ganzer Film auf Deutsch`

Es gibt auch legitime Warnfälle, bei denen Titel oder Jahre nicht übereinstimmen (z. B. `Sharknado – More Sharks, More Nado! – 10th Anniversary (2023)`, ohne Beweis eines neuen Werkes 2023). Jahreskonflikte dürfen **nicht** für bessere Zahlen wegoptimiert werden.

## Technische Gegenmaßnahme in PR #517

1. `scripts/youtube-g2-title-query-prep.mjs`: Nur bei **erkanntem Genreschlagwort in eckigen Klammern** den folgenden Marketing-Suffix entfernen. Beispiel: `Iron Soldier (2011) [Action] ...` wird für Frozen Matcher v1 zu `Iron Soldier (2011)`, aber die erste offizielle TMDB-Suchquery lautet **`Iron Soldier`**. Der Jahresbeleg bleibt v1 erhalten; `[OV]`, `[Director's Cut]`, echte Filmtitel und Fortsetzungsnummern bleiben unangetastet. Der rohe YouTube-Quelltitel wird niemals durch diese Aufbereitung ersetzt.
2. Neue Regressionstests mit 15 **echten** CiNENET-Live-Titelmustern und Netzkino-/Jahres-/Sequel-Gegenbeispielen. `scripts/youtube-g1-matcher-v1.mjs` wird **nicht verändert**.
3. Genau **dieselben 125 Video-IDs** vom originalen 125er-GitHub-Run werden im manuellen Workflow bei gesetztem `replay_run_id` als **kurzlebiges Original-Artefakt** über `gh run download` innerhalb von GitHub Actions abgerufen (kein statisches GitHub-Repository mit ständig erhaltenen API-Video-Daten). Anschließend prüft `videos.list` die exakten IDs aktuell nochmals, verifiziert die Kanalherkunft und führt dieselbe Matcher-v1-Kette mit neuer TMDB-Query-Aufbereitung aus.
4. Ausgabe unterscheidet nun **vorherige/neue Klassifikation pro Video-ID**, wiedergewonnene Kandidaten unter den ursprünglichen 79 Nulltreffern und Verteilung pro Quellkanal. Entfernte/private/Quelle-gewechselte IDs führen zu einem expliziten Fehler statt stillschweigender Ersetzung durch andere Uploads.
5. Kleine Statistikreparatur in der reinen `youtubeTitleImportPreview`: Eindeutige führende TMDB-Werkhypothesen (`potentialTitles`) werden auch dann gezählt, wenn ein aktueller MovieHub-Katalogsnapshot fehlt. Das ist **keine** neue Titelanlage oder bestätigte Neuimportzahl.

## Anleitung für nächste echte Wiederholung

Nach **CI und Android APK grün** und PR-Merge in `main`:
[YouTube G2 – 125 New Videos / Configurable Channels / Full Adapter Read-only Audit](https://github.com/matthias-ennen/movie-hub/actions/workflows/youtube-g2-large-live-audit.yml) öffnen → `Run workflow` → Branch `main` → `source_mode = all` → **`replay_run_id = 39754462653`** (Standard). Ein leerer `replay_run_id` ruft dagegen neue Upload-IDs und liefert keinen exakten Vorher-Nachher-Beweis. Die Workflow-Ausführung erfolgt nur nach manueller Nutzeraktion; kein Live-Run wird vor seinem tatsächlichen SUCCESS behauptet. Das ursprüngliche QA-Artefakt muss noch vorhanden sein (7 Tage Aufbewahrungszeit).

Danach: Originalbericht beider Läufe lesen; besonders alte 76 CiNENET-Nulltreffer und mögliche falsche Leading-Hypothesen überprüfen. **Technische Recall-Verbesserung ≠ verifizierte Filmidentität, DE-Angebot oder neu in MovieHub importierbarer Titel.**

## Gesamter YouTube-Adapter – noch offene Integrationsarbeiten

Der gemeinsame `SourceEnvelope/Availability`-/TMDB-Werkschlüsselpfad und Native-YouTube-Watch-URL sind bereits vorhanden. Nach bestätigter Zuordnungsqualität fehlen weiterhin der **read-only ECHTE MovieHub-Katalogsnapshot**, unabhängige Identitäts-/DE-Angebotsprüfung, produktiver zentraler Poster-/Detail-Badge-Merge, neue TMDB-Titelanlage, Refresh/Löschung/Failover, Nightly/Watchdog und Geräte-End-to-End-Prüfung. Die Ausgabe `catalogStatus=not-loaded` verhindert bewusst falsche Aussagen über die Anzahl neuer Werke. Formaler Compliance-Anfrageversand weiterhin zurückgestellt; bestehende Quellen-/API-Regeln können bei späterer Aktivierung relevant werden.

**Kein** Produktions-/Firestore-/Badge-/Index-/Nightly-Schreibzugriff in diesem Forschungs-/Replay-Paket.
