## G1e – unabhängiges Sync-Gesundheits-Gate (PR nach #775)

Die aggregierte Vorabprüfung trennt **historisch zugängliche EPG-Rohdaten**
von einer **vollständig gesunden** Waipu-/Joyn-Quellgeneration. Der Gate-Wert
`existingPrivateSourceDataAccessible` ist nur dann wahr, wenn **beide**
Sync-Statuswerte ausdrücklich `complete` melden **und** die begrenzten
Originaltitel-/Checkpoint-Proben positiv sind. Verbleibende Caches aus
fehlgeschlagenen oder unvollständigen Imports sind keine Freigabe.
Regressionstests prüfen ausgefallenes Waipu bzw. Joyn bei weiterhin vorhandenen
Rohdaten und Matcher-Caches. Der echte A/B-Test bleibt weiterhin gesperrt;
kein produktiver Shared-Index, kein neuer externer Request.

---

## G1e – Joyn-Großcache nur lesend zählen

Der zweite echte, private GitHub-Audit [#43202254720](https://github.com/matthias-ennen/movie-hub/actions/runs/43202254720) war erfolgreich. Waipu: 19.152 Checkpoint-Slots, **78** Originaltitel in begrenzter Rohdatenstichprobe, **27.629** Matcher-Entscheidungscacheeinträge. Joyn: 56 EPG-Fenster, **14.935** Originaltitel in der Stichprobe. **Eine** originale private Cachedatei überschritt das 128-MiB-Leselimit; die Anzahl der Joyn-Entscheidungen blieb daher bislang unbekannt.

**Neue schreibgeschützte Streaming-Auswertung:** `scripts/epg-g1e-stream-private-cache-count.mjs` verarbeitet private Joyn-Match-/TMDB-Response-Cachedateien blockweise (standardmäßig 128 KiB statt des vollständigen JSON). Es prüft kontrolliert die JSON-Objekt-/Arraystruktur, die Cacheart (`joyn-match-cache` bzw. `joyn-lookup-cache`), `schemaVersion: 1`, das direkte `entries`-Objekt sowie vollständige Schlüssel/Wertegrenzen. **Es zählt nur abgeschlossene direkte Entries**, lädt keine Diagnostiken, TMDB-Antworten, privaten Cache-Schlüssel oder EPG-Originaltitel in den Bericht. Defekte, zu tief verschachtelte oder über **1 GiB** große Quelldateien werden nicht als gültige Belege akzeptiert.

Der geschützte Audit nutzt Streaming **nur** für die Dateien oberhalb der alten 128-MiB-Grenze. Er behält die Grenze für vollständiges Cache-Deserialisieren bei; die Anzahl kann zwar überprüft werden, der Cache gilt damit **nicht** als vollständiger, für den A/B-Originalmatcher verwendbarer Snapshot. Übergrößen und eventuelle Parser-Fehler werden mit neutralen Zählern/Beleg-Gates dokumentiert. Weder `fullMatchApprovalReceiptsAvailable` noch `canRunUnmodifiedOriginalMatcherAb` werden dadurch automatisch aktiv, und echte vermiedene TMDB-HTTP-Aufrufe bleiben ausdrücklich **unbekannt**.

**Regressionen:** Grenzübergreifende Sonderzeichen-/Escape-Sequenzen, nested JSON, Originaltitel-Isolation, falsch behaupteter Cachetyp, doppelter `entries`-Block, kaputte Dateien und der vollständige A/B-No-Go trotz gefundener Cache-Einträge.

Der Cloud-Zugriff verbleibt auf dem bereits existierenden geschützten G1e-Audit in `main`. Pull-Request-Tests nutzen nur synthetische Daten. Einmaliger nächster privater Lauf erst nach grüner Spezialprüfung, CI und Android APK, ausgelöst durch den expliziten Merge-Marker. Der gemeinsame Index bleibt unverändert standardmäßig **ausgeschaltet**.

---

## Beobachtung und Korrektur nach dem ersten realen privaten Lauf

Der nach PR #773 einmalig gestartete private GitHub-Lesetest [#43200414776](https://github.com/matthias-ennen/movie-hub/actions/runs/43200414776) konnte **beide echten Checkpoints authentifiziert und ohne Quelldatenanfragen restaurieren**: Waipu-Archiv **222.962.780 Bytes** (Checkpoint vom 12.11.2026, 06:55 UTC), Joyn-Archiv **48.041.003 Bytes** (06:53 UTC). Der isolierte QA-Job scheiterte anschließend **an einer absichtlich begrenzten Datei-Lesegrenze**, nicht an defekten Quellcaches oder fehlendem Speicherzugriff.

Die Korrektur hält diese Obergrenzen bei, ersetzt aber den Komplettabbruch durch einen **fail-closed aggregierten Unvollständigkeitsbericht**: sehr große optionale Original-Matcher-/Response-Caches werden nicht eingelesen und als `matcher_cache_files_above_safe_read_limit` gemeldet. Zu große gesampelte EPG-Grid-/Fensterdateien werden nicht geöffnet; die Anzahl und `sampled_raw_source_files_above_safe_read_limit` werden dokumentiert. Bei fehlenden Belegen ist ein echter A/B-Test weiterhin **nicht freigegeben**; keinerlei frei geratene TMDB-Ersparnis.

Die Workflow-Push-Filter nehmen nun Änderungen am Audit-Skript auf. Der private Job bleibt ausschließlich durch den expliziten Merge-Tag `[g1e-private-readiness-once]` auf `main` oder durch eine manuelle `workflow_dispatch`-Aktion startbar.

---

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
