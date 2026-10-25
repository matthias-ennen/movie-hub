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
| Index | `youtube-best-effort-title-links.json` (21 Linkeinträge seit #618 kontrolliert publiziert und per HTTP geprüft; bei fehlender Quelle widerrufbar) | `youtube-verified-title-routes.json` |
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

**Aktueller Betriebsstand (#617/#618):** Der private Known-ID-Review wurde mit geprüfter Herkunft in einen minimalen öffentlichen Linkindex projiziert; **21 Best-Effort-Direktlinks** wurden beim Firebase-Deploy tatsächlich ausgeliefert und per gesondertem HTTP-Readback geprüft. Fehlende, veraltete oder ungültige Quellen müssen den Linkindex entfernen und den bestehenden YouTube-Suchfallback erhalten. Die Bereitstellung **aktiviert weder einen neuen Anbieterbadge noch eine unabhängig verifizierte DE-Filmfassung oder ein Tarifangebot**. Ein echter Android-/Fire-TV-Wiedergabetest steht weiterhin aus.

## Technische Meilensteine und verbleibende Arbeiten

1. **Erledigt (#616):** Echter privater Known-ID-Refresh mit **21 plausiblen Best-Effort-Linkkandidaten** aus dem erfolgreichen Run #40196539918.
2. **Erledigt (#617/#618):** Kontrollierte Preview→Linkindex-Promotion mit Quellprovenienz, sieben Tagen Gültigkeit und Widerrufsprüfung; **21 Links über das reale Hosting per HTTP nachgewiesen**. Die private Original-QA bleibt geschützt.
3. **Teilweise vorbereitet (#619), Live-Suche weiterhin gesperrt:** Erst **eine `search.list`-Anfrage** pro bislang unbekanntem TMDB-Film, eine zweite nur nach separater Prüfung und Budgetfreigabe. Die Implementierung darf erst nach echter projektweiter Quota-Prüfung, atomarem GCS-CAS-Tagesledger, dauerhaftem Fortschrittscursor und HTTP-429-Hartstopp suchen. Aktuell **0 autorisierte neue Suchen**.
4. **Offen:** Playlists und Global-Kandidatencache inkrementell skalieren, kleine Link-Trefferstichprobe und tatsächliche Android-/Fire-TV-Klick-/Wiedergabetests durchführen. Ohne Gerätebeleg keine Aussage über erfolgreiches Playback.

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

## HTTP-Abnahme nach dem erfolgreichen Firebase-Release (PR #618)

Der **erste echte** Main-Promotion-Lauf nach #617 ist [Firebase #40198505759](https://github.com/matthias-ennen/movie-hub/actions/runs/40198505759) **SUCCESS** inklusive Quelle [Review #40196539918](https://github.com/matthias-ennen/movie-hub/actions/runs/40196539918), Download, Projektions- und Hosting-Deploy-Schritt. Das Firebase-Joblog hat folgende zusammengefasste, echte Ausgabe: `publicLinkShortcuts:21`, `originalPrivateQaPublished:false`, `badgeWrites:0`, `verifiedDEOffers:0`, `searchCallsPerformed:0`. Auch die allgemeine vorhandene Publikationsintegrität war erfolgreich. Dies ist der **erste erfolgreiche Hosting-Build mit 21 Best-Effort-Links**; der damals noch fehlende separate HTTP-Readback wurde anschließend durch #618 im Main-Deploy #40199419996 erfolgreich nachgeholt.

Der ergänzte technische Final-Check `scripts/verify-youtube-best-effort-publication.mjs` läuft **nach** der allgemeinen erfolgreichen `verify-published-data.mjs`-Prüfung. Er ruft den tatsächlichen Firebase-Hosting-HTTP-Endpunkt mit `cache:no-store` und einem einmaligen Queryparameter ab, verlangt das exakte vorbereitete JSON mit identischen Feldwerten, die erwartete Anzahl, `application/json` und `Cache-Control:no-store`. Er führt **keine YouTube-/TMDB-API-Suche** aus. Bei fehlendem lokalen Index muss der echte veröffentlichte Endpunkt nicht mehr die alte JSON-Datei liefern: 404 oder die gewöhnliche HTML-SPA-Rewrite-Antwort gelten als erfolgreich **widerrufen**; ein noch erreichbares JSON trotz Entfernung ist ein Fehler. Es gibt drei kurze HTTP-Prüfversuche und einen fehlerhaften Gesamt-Deploy, falls die neue veröffentlichte Datei nicht dem Build entspricht. Damit werden Browser-Cache, Rollback und eindeutiger Link-Generationsstand messbar.

**Gesondert offen:** Eine HTTP-Antwort und ein App-Klick sind noch **keine** belegte Videowiedergabe auf echter Android- oder Fire-TV-Hardware. Genaues Filmwerk, DE-Fassung, Tarif und Rechte bleiben weiterhin keine Zusage des Best-Effort-Index.

## Neu: sparsame erste Suche pro unbekanntem Film (PR #619)

Für die TMDB-first-Recherche wird der bisherige zweistufige Ablauf **nicht mehr automatisch als ein unteilbarer Pflichtblock** behandelt. Das spart Budget, ohne den Matcher, die Videometadaten oder die Fallback-Regeln abzuschwächen:

1. **Erstpass:** Für eine unbekannte `movie:TMDB-ID` **genau eine** spezifische, nach Filmname/Jahr gestellte `search.list`-Anfrage, deren Ergebnisse über die bisherige `videos.list`-Stapelabfrage bewertet werden. Bei bereits bekannten Video-IDs weiterhin **0 neue Suchen**.
2. **Bewertung:** Der bestehende v1.1-Score und die Best-Effort-Kandidatenfilter bleiben. Ein überzeugender erster Kandidat benötigt keine redundante zweite Suche.
3. **Schlechte/fehlende Ergebnisse:** Das Ergebnis ist `firstPassReviewUnresolvedMovies` und ein normaler Such-Fallback – **kein** verdeckter zweiter API-Aufruf. Eine spätere ursprüngliche-Titel-/Ohne-Jahr-Suche benötigt einen **separaten** budgetierten, kontrollierten Folgeauftrag. Weder ein einfaches `no-video-candidate` noch die Quota-Warteschlange behauptet, dass es überhaupt kein YouTube-Video gibt.
4. **Gleiches Inventar:** Der kanonische Filmindex und die bisherigen Video-ID-Reuse-Regeln sind identisch. Der reine Offline-Quotavorschlag #609 kalkuliert jetzt **maximal 5 geplante neue Google-`search.list`-Aufrufe** für einen 5-Film-Erstpass statt maximal 10 – unter derselben konservativen internen 10er-Pacific-Tagesgrenze; je bekanntem Film wird eine statt zwei geplante Suchen vermieden. Historische Offline-Replays mit zwei Queries bleiben durch expliziten Standardmodus vergleichbar.
5. **Betriebssicherheit:** Der alte Live-Runner ist weiterhin durch die Schutzregel #610 **vor externen API-Aufrufen** für alle geplanten `search.list`-Calls gesperrt. Dieser PR **bucht kein Quota, macht keine tatsächliche neue Suche, schreibt keinen Fortschritt in GCS, aktualisiert keine Badge- oder DE-Tarifdaten**. Erst nach echter projektweiter Vorprüfung + atomarer Tagesreservierung + dauerhaftem erfolgreichem Fortschritts-Cursor darf die erste automatische Suche aktiviert werden.

**Wirtschaftliche Zielgröße:** Aktuell haben 2.993 der 3.023 öffentlichen YouTube-TMDB-Film-Badges keine global gespeicherte Video-ID. Ein hypothetischer Erstpass mit je einem Call würde die *maximale theoretische* anfängliche Suchanfragenzahl von 5.986 auf **2.993** reduzieren, bevor je nach gemessener Trefferqualität weitere gezielte Nachrecherchen erfolgen. Das ist **keine Laufzeit- oder Verfügbarkeitsgarantie**, da Googles aktuelles Projektbudget unbekannt ist und alle API-Consumers Quota teilen.

## Verifizierter Nachtest nach #619 (25.10.2026)

[Main-CI #40202015353](https://github.com/matthias-ennen/movie-hub/actions/runs/40202015353), [Android-APK #40202015358](https://github.com/matthias-ennen/movie-hub/actions/runs/40202015358) und [Firebase-Deploy #40202015355](https://github.com/matthias-ennen/movie-hub/actions/runs/40202015355) für `main`-Commit `98bc5cee` sind jeweils **completed / SUCCESS**. Der Firebase-Job hat auch den gesonderten Schritt **„Verify hosted best-effort link index and true rollback (read-only)“ erfolgreich** abgeschlossen. Dies ist ein technischer Veröffentlichungsnachweis, **keine** unabhängige Wiedergabe-/DE-Tarifabnahme. Der neue Ein-Such-Erstpass wurde weiterhin **nicht** für reale `search.list`-Anfragen aktiviert.
