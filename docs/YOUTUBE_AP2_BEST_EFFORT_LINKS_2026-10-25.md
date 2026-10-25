# YouTube G2 – schlanker Best-Effort-Videolink statt Angebotsgarantie

**Arbeitspaket:** [YouTube-Adapter #388](https://github.com/matthias-ennen/movie-hub/issues/388).  
**Separat:** generelle API-/Rechte-/Distributions-Compliance in [Movie Hub #112](https://github.com/matthias-ennen/movie-hub/issues/112).  
**Ziel:** Ein bereits bestehendes **YouTube-Anbieterbadge aus TMDB/JustWatch** möglichst oft direkt zum plausibel richtigen YouTube-Video weiterleiten. Movie Hub hostet dabei keine Filmdaten. Ein falscher/unverfügbarer externer Treffer ist für die private Nutzung hinnehmbar, solange die Zuordnung nicht offenkundig irreführend ist und der bisherige Suchlink erhalten bleibt.

## Zwei bewusst unterschiedliche Wege

| | Best-Effort-Videolink (neu) | Unabhängig verifiziertes DE-Filmangebot (bestehend) |
| --- | --- | --- |
| Produktziel | Bessere externe Weiterleitung für **vorhandenes** Badge | Verifiziertes Filmangebot und genaue Angebotsart |
| Quelle | Bereits bekannter YouTube-VIDEO-ID-Kandidat + aktueller `videos.list`/TMDB-Film-Score | Manuell bestätigtes Werk, Fassung, DE-Zugriff und Angebotsart |
| Genauer Tarif | **Keine neue Aussage**; ursprüngliche TMDB-/JustWatch-Labels unverändert | `free/ads/flatrate/rent/buy` nur mit Nachweis |
| Index | `youtube-best-effort-title-links.json` (optional, derzeit nicht aktiv publiziert) | `youtube-verified-title-routes.json` |
| Rückfall | Gewöhnliche YouTube-Titelsuche | Gewöhnliche YouTube-Titelsuche |
| Persistente Freigabe / Produktionsdaten | Keine neuen Provider-/Firestore-/Katalog- oder Badge-Writes | Eigenes bestehendes Bestätigungs- und SourceEnvelope-Gate |

**Link-Priorität beim Klick:** unabhängig verifizierte Filmroute → bestehende der zwei redaktionellen Playlist-Hinweise → **neuer Best-Effort-Link** → schon bestehende YouTube-Titelsuche. Nicht als `verifiedTitleOffers` an die Badge-Darstellung weitergeben; ein Best-Effort-Link behauptet keinen anderen Preis oder Verfügbarkeitsstatus.

## Minimale Auswahlregel, Version 1

1. Nur vorhandene öffentliche MovieHub-**Film**-Badges mit aktuellem TMDB-DE-YouTube-Hinweis. Serien nicht automatisch als Film behandeln.
2. Nur den realen, bereits vorhandenen **privaten** globalen Known-ID-Review verwenden, dessen kompletter `videos.list`-Check abgeschlossen ist. Keine neue `search.list`-Query. Neue Filmtitel später separat durch budgetierte Suche ergänzen.
3. Aktueller Review (max. **7 Tage**) und ein einziger führender plausibler Kandidat (`review-single-video-candidate`, `strong=true`, **Score mindestens 36** auf dem vorhandenen Matcher, exakte Titelqualitätsstufe 4, Laufzeitdifferenz höchstens 15 Minuten, keine Jahr-/Sequel-/Typ-Risiken und **nicht ausdrücklich für DE ausgeschlossen**).
4. Ist ein zweiter Videokandidat vorhanden, muss der führende um mindestens **8 Scorepunkte** voraus sein. Unbekanntes `regionRestriction`-DE-Signal führt nicht zu zusätzlichen API-Abfragen oder automatischer Sperre.
5. Ausschließlich kanonische `https://www.youtube.com/watch?v=VIDEO_ID`-URL mit 11-stelliger Video-ID; keine Kanal-/Youtube-Suche über zufällige Domains. Die zulässige Beobachtung erhält `observedAt` und `validUntil` (7 Tage). Bei 404, Zeitablauf, Film-ID-Wechsel, Duplikat, manipuliertem Index oder Score-Konflikt wird **kein** Best-Effort-Link gewählt.

**Dies sind Startschwellen zum Kalibrieren, kein Genauigkeitsversprechen.** 30–50 echte Kandidaten später stichprobenartig auf Treffer/Fehlzuordnung prüfen, dann Schwellenwerte nach gemessener Qualität ggf. lockern. Für den preiswerten Weg zuerst bekannte Video-IDs, künftig nur **eine `search.list`-Suche pro unbekanntem Film**, zweite Suche nur bei Bedarf und ausschließlich nach echter Quota-/429-Admission. Dies ist **noch nicht** in der Live-Suche implementiert.

## Was in dieser Ausbaustufe tatsächlich integriert ist

- `src/providers/youtubeBestEffortRouteIndex.js`: ausschließlich aus vorheriger privater `youtube-g2-global-known-video-no-search-recheck`-QA einen kleinen optionalen Link-Index erstellen; streng niedrige Negativ-/Ablauf-/Provider-Gates, **0 neue bestätigte DE-Angebote**.
- `scripts/youtube-g2-best-effort-link-preview.mjs`: den schon vorhandenen täglichen `videos.list`-QA-Bericht **lokal** in `artifacts/youtube-g2/global-known-no-search-review/best-effort-links.private.json` umwandeln. Der Daily-Workflow hängt diese **private 7-Tage-Vorschau** seinem geschützten Artefakt an; in der öffentlichen Actions Summary nur Zähler, keine Video-IDs/Filmlinks.
- `src/providers/youtubeBestEffortRouteRuntime.js` und vorhandener `YoutubeVerifiedOffersContext`: optionales öffentliches Index-JSON laden; bei fehlender Datei 404/falschen Daten sicher `null`.
- `DetailModal`: externe Best-Effort-Route auf dem **vorhandenen** YouTube-Badge starten, nur wenn weder unabhängig verifizierte Route noch redaktionelle Playlist-Hinweise Vorrang haben. Der reguläre Such-Fallback und die nativen Android-/Fire-TV-Absprungregeln aus #614 bleiben unangetastet.
- Vitest/Workflow-Regressionstests: positive lokale Verlinkung, Search-Fallback, Score-/DE-/Typ-Risiko, schlechte/alte Daten, gefälschte Quellen, fehlendes Badge, private Erzeugung und unveränderte TMDB-Anbieterangebote.

**Wichtige ehrliche Betriebsgrenze:** Solange das optionale `/youtube-best-effort-title-links.json` **nicht kontrolliert aus einer erfolgreichen, tatsächlich aktuellen privaten QA-Vorschau in den App-Deployment-Prozess übernommen** ist, gibt es **keine neuen automatisch aktiven Direktlinks**. Die aktuelle Code-/UI-Vorbereitung aktiviert keine globale Filmkandidatenfreigabe. Ein separater, kontrollierter technischer Promote-/Rollback-Schritt ist vor der privaten App-Nutzung notwendig; **kein** generischer Kandidat darf als unabhängig verifiziertes DE-Angebot erscheinen.

## Nächste technischen Entscheidungen

1. Ersten echten privaten Best-Effort-Preview-Run aus dem bestehenden Live-Known-ID-Refresh messen: wie viele der bisher 21 Single-Video-Reviews erfüllen die reduzierte Score-/Abstandsregel?
2. Nach positivem QA-Befund einen **kontrollierten privaten Preview→öffentlicher statischer Linkindex**-Promote mit Quellprovenienz, 7-Tage-Ablauf und Widerruf bauen. Nur der Linkindex, niemals die 7-Tage-Original-QA oder private Titel- und Profildaten nach `public/`.
3. Danach **eine neue Suche pro bisher unbekanntem TMDB-Film**, bei Misserfolg optional zweite Suche, strikt unter Googles aktueller Projektquota, sicherem GCS-CAS-10er-Tagesledger und 429-Abbruch; Tests/Metrics zum Verhältnis API-Aufwand zu brauchbaren Treffern.
4. Playlists und Global-Kandidatencache inkrementell skalieren; echte Android/Fire-TV-Tests separat ausführen. Ohne Endgerätenachweis keine Erklärung, dass eine konkrete Wiedergabe auf diesen Geräten erfolgreich war.

**Dieser Schritt löst weder ein neues Google-Search-API-Request noch einen genehmigten Filmimport, einen Firestore-Write oder eine neue konkrete DE-Verfügbarkeits-/Tarifbehauptung aus.**

## Ergänzung: kontrollierte Link-only-Promotion im Firebase-Build (PR #617)

**Vorher:** Private Vorschau und App-Loader existieren, aber es ist kein öffentlicher Index erzeugt. **Neu:** Der Firebase-Deploy darf nach positivem Provenienz-Gate genau eine minimale globale Film-Video-Linkliste aus der aktuellen privaten Best-Effort-Vorschau übernehmen.

1. `scripts/youtube-g2-best-effort-source-provenance.mjs` sucht ausschließlich eine **abgeschlossene, erfolgreiche** `main`-Actions-Ausführung des unveränderten `youtube-g2-global-known-no-search.yml` mit identischem Repository, passendem nicht abgelaufenem privaten Artefakt und explizitem Commit-Vorfahren-Nachweis (`GET compare/sourceSha...deploySha`). Erforderliche Lauf- und Artefaktzeit liegen unter **sechs Tagen**. Kein anderes Repo, Pull-Request-Lauf, fehlgeschlagener oder fremder Code. Ein fehlender oder nicht verifizierbarer Lauf ergibt `null`.
2. `actions/download-artifact` liest das passende geschützte Artefakt in einen **nicht öffentlichen Arbeitsordner**. Nur `best-effort-links.private.json` ist Eingabe der Promotion. Die originale `qa.json` und `report.md` werden **nie** nach `public/` oder `dist/` kopiert.
3. `scripts/youtube-g2-best-effort-promote.mjs` entfernt vor jeder Prüfung einen womöglich vorhandenen alten Index. Nur wenn Herkunft, frische Quelldaten und jede ID/URL/Score-/TTL-Eintragung den Client-Gates standhalten, schreibt das Script ausschließlich eine definierte Feld-Whitelist nach `public/youtube-best-effort-title-links.json`: globale `movie:TMDB-ID`, 11-stellige YouTube-`videoId`, exakte kanonische HTTPS-`watch`-URL, numerische Matchingsignale, Herkunftsklasse und maximal sieben Tage TTL. **Kein privater Profilname, anderer privater QA-Inhalt, neuer Anbieterbadge oder Tarifanspruch.** Doppelte Film- oder VIDEO-IDs stoppen den gesamten Promote.
4. Fehlen Lauf/Artefakt oder ist ein Eintrag abgelaufen/uneindeutig, wird **keine** Datei publiziert. Der bisherige YouTube-Titelsuchlink bleibt weiterhin nutzbar. Hosting setzt `Cache-Control: no-store` für den separat widerrufbaren Index.
5. Ein neues bekanntes Video reicht nur als **bestmögliche externe Weiterleitung**, nicht als kostenlos garantiertes deutsches Vollfilmangebot. Die zwei redaktionellen Playlists und streng verifizierte Routen behalten Vorrang; kein zusätzlicher Google-`search.list`-Aufruf.

**Operationales Rollout-Gate:** Vor dem Merge die Branch-CI/Android-Prüfungen abnehmen; nach Merge den Firebase-Deploy einschließlich tatsächlicher Provenienz-Auswahl und echtem HTTP-Index-Readback prüfen. Erst bei nachgewiesenem `200` und passender Quelle aktive Best-Effort-Links behaupten. Bei `404` oder Fehler ist die App technisch intakt, aber die Link-Promotion noch nicht funktionierend. Die tatsächliche Filmwiedergabe auf Android-/Fire-TV-Hardware bleibt separat zu testen.

**Bewusste Entkopplung:** Der nächtliche bekannte-ID-Review läuft weiterhin nur lesend; der Firebase-Deploy verwendet ausschließlich die jüngste bestätigte QA. Eine zeitlich nicht passende Build-Reihenfolge kann die Best-Effort-Links zeitweise zurückhalten, statt ungesichert zu veröffentlichen. Das gehört ausdrücklich zur sicheren Fehlerrate.
