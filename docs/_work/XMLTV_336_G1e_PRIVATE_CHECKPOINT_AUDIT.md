# MovieHub #336 – G1e: private, nur lesende Originalquellen- und Cacheprüfung

**Stand: 12.11.2026. Kein produktiver Index, keine neuen TMDB-/Waipu-/Joyn-Requests, kein Datenexport.**

## Warum dieses Arbeitspaket nötig ist

Der reproduzierbare Echtdaten-Audit aus [#771](https://github.com/matthias-ennen/movie-hub/pull/771) bestätigte, dass das veröffentlichte Nightly-Artefakt zwar 46.089 Waipu- und 23.785 Joyn-Ausstrahlungen enthält, aber **keine privaten Matcher- und Antwort-Caches, ursprüngliche Waipu-EPG-Titel oder ausdrücklich freigegebene Original-Matcherquittungen**. Das aktuelle A/B-Testgerüst aus [#770](https://github.com/matthias-ennen/movie-hub/pull/770), gehärtet durch [#772](https://github.com/matthias-ennen/movie-hub/pull/772), kann deshalb aus den öffentlichen Envelopes **keine echten vermiedenen TMDB-Requests** bestimmen.

Das Repository besitzt allerdings bereits eine abgesicherte private Checkpoint-Verwaltung (`scripts/durable-data-checkpoint.mjs`) für diese originalen Waipu- und Joyn-Zustände. Die Gruppen umfassen Roh-EPG-Quellcaches, Waipu-Matcherentscheidungen und Joyn-Matcher-/TMDB-Response-Caches. Der bestehende Import schreibt diese Snapshots in ein privates Google-Cloud-Storage-Bucket, das nur der GitHub-Runner per Workload Identity nutzen darf.

## Neue, ausdrücklich einmalige Audit-Funktion

`scripts/epg-g1e-private-checkpoint-readiness.mjs` analysiert **nur bereits restaurierte lokale private Daten**:
- prüft die Quell-Checkpoint-Formate und den Status beider 14-Tage-Syncs;
- zählt Originaltitel und echte Originalprogramm-IDs anhand **begrenzt gesampelter** Waipu-Grid-Records und Joyn-EPG-Fenster;
- zählt vorhandene Waipu-Matcherentscheidungen sowie Joyn-Entscheidungs- und TMDB-Response-Cacheeinträge;
- markiert ausdrücklich, dass **historische Cacheeinträge noch keine gesonderten frischen G1e-Quittungen** sind; ein Original-EPG-Titel oder ein vorhandener TMDB-Match führt **niemals** automatisch zur Beweisfreigabe;
- veröffentlicht ausschließlich anonymisierte Zähler, boolesche Prüf-Gates und generische fehlende Voraussetzungen. **Keine Filmtitel, Programm-IDs, Quellpfade, TMDB-IDs, Tokens, privaten Cacheinhalte oder Hashwerte** erscheinen im Report.

Der Audit verwendet begrenzte Datei- und Arraygrößen. Nur lokale `readFile`-/`stat`-/`readdir`-Operationen; keine Netzwerkanfrage und keine Änderung der Matcher-Caches.

## Neuer GitHub-Actions-Workflow

`.github/workflows/shared-epg-g1e-private-checkpoint-readiness.yml` trennt **synthetische PR-Tests** strikt von **privatem, geschütztem Quellzugriff**.

- Bei Pull Requests laufen ausschließlich synthetische Vitest-Gegenproben, ohne Cloud-Zugang.
- Ein privater Check kann auf `main` manuell via `workflow_dispatch` oder **genau einmal** über einen ausdrücklich markierten Merge-Commit `[g1e-private-readiness-once]` gestartet werden. Die Workflow-Datei muss dafür neu auf `main` gelangen; gewöhnliche Commits oder PRs starten den privaten Job **nicht**.
- Nur der private Job fordert OIDC an und verifiziert `MOVIE_HUB_DURABLE_CHECKPOINT_ENABLED=true` sowie das erwartete, bereits eingerichtete Bucket. Er authentifiziert sich über die **bestehende** GitHub Workload Identity, liest `restore waipu` und `restore joyn` aus privatem Storage und analysiert ausschließlich lokal die restaurierten Roh-/Matchcaches.
- Es gibt kein `upload`, keinen neuen Waipu-/Joyn-Sync, keinen neuen TMDB-Transport, keine Firebase-Publikation, keine neue öffentliche Quelldatei. Das einzige Download-Artefakt ist ein **aggregierter Sicherheits-/Vollständigkeitsbericht**. Selbst Fehlerausgaben dürfen keinen Quelltext oder private JSON-Zeilen enthalten.
- Der bestehende normale Push-Deploy auf `main` wird durch seine bisherige Workflowlogik ausgelöst; er ist unabhängig von diesem privaten QA-Job und aktiviert keinen Shared-EPG-Index.

**Wichtig:** Der private Audit weist nur nach, welche ursprünglichen Quellen und Caches tatsächlich bereitstehen. Er führt **noch nicht** das echte Baseline/Index-A/B-Matching aus; dazu fehlen die gesonderten frischen Matcherquittungen.

## Weiteres Gate vor einem realen G1e-A/B-Pilot

Nach diesem Nachweis: Die vorhandenen Waipu- und Joyn-Opt-in-Capture-Funktionen aus #768 und #769 nur innerhalb einer separat isolierten, vollständigen und gesunden Matcher-Generation verwenden. **Weder alte Cachetreffer umdatieren noch private Quellbelege öffentlich speichern.** Anschließend den A/B-Controller mit den tatsächlich restaurierten Ausgangscaches und identischen Source-Kandidaten instrumentieren; tatsächliche TMDB-HTTP-Requests zählen, nicht Anzahl veröffentlichter Ausstrahlungen.

Erst nach wiederholter Qualitätssicherung darf über eine produktive G2-Integration gesprochen werden. Waipu, Joyn und XMLTV müssen weiterhin unabhängig bleiben; AIR-/Playback-Links sind ein getrenntes Freigabethema.
