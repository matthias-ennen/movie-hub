# YouTube #388 – Suchaufruf-Inventur und Altpfad-Sperre

Stand: 28.10.2026. Ziel: verhindern, dass historische G1/G2-Suchjobs das gemeinsame YouTube-search.list-Tagesbudget unabhängig von der bestehenden GCS-CAS-Reservierung ausgeben. Ausgangs-HEAD: ead7935183f10f87bd80129aa921ab6d9dac1f64.

## Sechs nachgewiesene unbudgetierte Workflow-Einstiegsstellen

Die folgenden Jobs haben vor ihrem tatsächlichen search.list-Aufruf keine gemeinsame Reservierung im GCS-Konto youtube-g2/private-search-budget/v1/days/. Ihre lokalen Limits ersetzen keinen gemeinsamen Quotenbeleg.

| GitHub-Workflow | Aufgerufener Runner | Risiko |
| --- | --- | --- |
| youtube-movies-all-categories-hundred-g1.yml | youtube-movies-all-categories-hundred-g1.mjs | G1 Kategorien-Discovery, lokal MAX_SEARCH=76 |
| youtube-movies-fifty-g1.yml | youtube-movies-fifty-g1.mjs | G1 YouTube-first, lokal MAX_SEARCH_CALLS=20 |
| youtube-movies-store-id-g1.yml | youtube-movies-store-id-g1.mjs | G1 Film-ID-Forschung mit lokalem Suchzähler |
| youtube-movies-three-sorts-g1.yml | youtube-movies-three-sorts-g1.mjs | G1 Vergleich, maximal drei lokale Suchen |
| youtube-g2-tmdb-first-link-pilot.yml | youtube-g2-tmdb-first-link-pilot.mjs | G2 TMDB-first-Pilot mit lokaler Suchgrenze |
| youtube-g2-one-search-quota-preflight.yml | youtube-g2-one-search-quota-diagnostic.mjs | G2 Einzelsuche, bislang ohne projektweiten CAS-Zugang |

**Dieser Patch** setzt beim jeweiligen GitHub-Job ein ausdrücklich falsches UND-Glied (false &&) vor die bestehende Job-Bedingung. Damit bleibt die Datei und ihr historischer Ablauf dokumentiert, der Job wird aber selbst bei manuellem Workflow-Dispatch übersprungen. Auch markierte Push-Trigger der beiden G2-Altjobs werden blockiert. Die Skripte bleiben als Quellcode erhalten und werden nicht neu an einen anderen Workflow gebunden.

**Beweisgrenze:** Die Sperre betrifft genau diese sechs GitHub-Actions-Jobs. Wer das historische Skript außerhalb von GitHub mit Zugangsdaten direkt ausführt, umgeht die Job-Bedingung. Vollständige Quotenhoheit erfordert später den zentralen API-Transport-Gateway und die Erfassung aller weiteren Projektverbraucher.

## Drei bereits konservativ budgetierte Suchwege – unangetastet

- youtube-g2-nightly-discovery.yml: nightly-discovery-live mit reserveWithAtomicGcs, bisher maximal 10 pro Pacific-Tag, bei fehlenden geeigneten Monitoringdaten höchstens 1.
- youtube-g2-five-search-public-batch.yml: five-search-public-batch mit admitPreparedFiveSearches, bisher maximal 5 gleichzeitig reserviert.
- youtube-g2-full-catalog-queue.yml: full-catalog-queue-live mit admitPreparedOneSearchPlan, bisher jeweils 1 im gemeinsamen Zehner-Konto.

Alle drei verwenden noch das alte GCS-Tagesledger. Der neue 95er-Gateway aus dem separaten Draft-PR #673 ist noch nicht produktiv angeschlossen. Ebenso unverändert sind die Playlist-/Known-Video-Refreshes, die für ihre normalen Abläufe keine neue search.list brauchen.

## Weitere inspizierte Quellen ohne zusätzliche search.list

- youtube-api-smoke und youtube-api-inventory-pilot: Kanäle, Playlists und Videos.
- youtube-adapter-live-preflight und youtube-g2-large-live-audit: explizit auf channels, playlistItems und videos eingegrenzte Quellenprüfung.
- youtube-g2-curated-two-playlists-live, youtube-g2-curated-source-sync-live, youtube-g2-pending-video-refresh: bekannte Quellen- und VIDEO-ID-Daten.
- youtube-g2-tmdb-first-known-videos-refresh, youtube-g2-global-known-no-search-live, youtube-g2-overflow-recheck-live: Videos-Recheck ohne neue Suchen.

Diese Inventur basiert auf der Prüfung der YouTube-namentlichen GitHub-Workflows und der zugehörigen Skripte. **Eine vollständige Laufzeitinventur sämtlicher indirekter, nicht YouTube-benannter oder externen Projektverbraucher ist damit noch nicht nachgewiesen.**

## Regression und weiteres Vorgehen

Der neue Test tests/youtube-g2-legacy-search-suspension.test.js prüft die sechs tatsächlichen Job-Sperren und deren Runner sowie den Erhalt der drei konservativ budgetierten Suchwege und zweier No-Search-Pfade. Er ist ein statischer Quelltext-Check, kein Google-Quota-Nachweis.

Vor der 95er-Aktivierung erforderlich:

1. Vollständige Transport- und Aufrufstellenprüfung aller YouTube-API-Caller (auch Shell/Inline/andere Systeme/Schlüssel), aktive Suchwege auf exakt einen gemeinsamen CAS-Zugang migrieren.
2. Tatsächliches Google-Projektlimit und alle externen Verbraucher unabhängig prüfen. Kein nominelles 100er-Limit als garantierten Restbestand ausgeben.
3. Live-Gateway erst nach Migration und sicherem Pacific-Tageswechsel aktivieren. Alte GCS-v1- und neue Gateway-Ledger nie unkoordiniert parallel als getrennte Budgets nutzen.
4. Discovery-Queue, TMDB-Limits und automatische Known-Video-Overflow-Rotation für höhere Last skalieren, Rechte-/Fassungs-/Matcherprüfungen nicht lockern.
5. CI, Android sowie echte GitHub-Schedule-Discovery → workflow_run-Recheck → Firebase-Veröffentlichung mit QA- und HTTP-Readbacks nachweisen. Persönliche Endabnahme ausstehend.

**Dieser Patch führt keine YouTube-Suchen, Cloud-Quota-Änderungen, neue Filmlinks, Matcher-Anpassungen, Firebase-Deploys oder neue Rechtefreigaben aus.** #388 bleibt offen; #336 und #391 bleiben pausiert.
