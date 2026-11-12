# MovieHub #336 – G1e: private Waipu-A/B-Eingangsprüfung vor echtem Matcher-Test

**Stand 12.11.2026.** Gezielter, nur lesender Vorab-Audit. **Noch kein echter Matcher-A/B-Vergleich, keine frischen Joyn-Matcherquittungen, keine nachgewiesenen eingesparten TMDB-Anfragen.**

## Warum dieser Schritt nötig ist

Die vorherigen geschützten QA-Läufe bestätigten verfügbare originale Waipu-/Joyn-Quellcaches. Der Joyn-Matcher-Cache kann über 128 MiB groß sein, muss für den **Waipu-als-Ziel**-Versuch aus #780 jedoch nicht zweimal deserialisiert werden. Entscheidend ist jetzt, ob der **wirklich vorhandene Waipu-Originalmatcher-Cache** dem strengen 24-MiB-Limit des neuen isolierten Controllers entspricht. Eine bloße Anzahl von 27.629 alten Matcherentscheidungen beweist nicht, dass sich der echte Cache vollständig, korrekt und speicherschonend als A/B-Ausgangszustand verwenden lässt.

## Implementierung

`scripts/epg-g1e-private-waipu-ab-preflight.mjs` arbeitet ausschließlich auf bereits vom bestehenden G1e-Checkpoint-Audit wiederhergestellten privaten Dateien:

- `artifacts/waipu-sync/status.json`, `artifacts/joyn-sync/status.json`: Der jeweilige Original-Sync muss ausdrücklich `complete` melden, zur korrekten Source-Version passen, höchstens 24 Stunden alt sein und maximal 12 Stunden Generationenversatz haben.
- `artifacts/waipu-live/match-decisions.json`: Der ursprüngliche Dateistatus wird ohne Öffnen/Deserialisieren über das 24-MiB-Limit hinaus geprüft. Nur Dateien unter dieser Grenze werden auf ursprünglichen `kind`, `schemaVersion`, den echten `WAIPU_MATCHER_VERSION` und nichtleere, begrenzte `decisions` geprüft. Symbolische Links werden nicht gelesen. Bei fehlender oder kaputter Datei wird ein klares negatives Gate, kein improvisierter Snapshot erzeugt.
- Ausgabe: **Nur** ein kleines aggregiertes JSON mit Gesundheitsflags, Original-Entscheidungsanzahl und generischen fehlenden Voraussetzungen. Keine Dateipfade, privaten Cache-Schlüssel, Sendungstitel, TMDB-IDs, Quellprogramme, Hashwerte, Tokens oder Antwortinhalte. Das private Original wird nicht verändert.

`gate.readyForPrivateFreshEvidenceCollection` signalisiert ausschließlich, dass zwei aktuelle vollständige Sync-Status und ein kontrolliert ladbarer Waipu-Cache vorliegen. Es ist **keine Freigabe**, TMDB anzusprechen. Die Felder `fullJoynApprovalReceiptsAvailable: false`, `originalWaipuReplayInputsReady: false`, `canRunLiveWaipuAb: false`, `measuredAvoidedTmdbHttpRequests: null` bleiben ausdrücklich negativ, solange keine neue echte Originalgeneration ihre bewiesenen Matcherbelege im Speicher liefert und kein gesonderter Testlauf das kleine TMDB-Budget freigibt.

## Geschützter einmaliger Cloud-Audit

Die vorhandene, bereits geprüfte Workflow-Datei
`.github/workflows/shared-epg-g1e-private-checkpoint-readiness.yml`
erhält **nur einen zusätzlichen read-only Preflight-Schritt**. Pull Requests führen **ausschließlich synthetische Tests ohne Cloudzugriff** aus. Die private Stufe bleibt auf `main`, explizites `workflow_dispatch` oder einen ausdrücklich markierten einmaligen Merge-Commit `[g1e-private-readiness-once]` begrenzt. Sie liest dieselben restaurierten, bestehenden Checkpoints; **keine neuen Joyn-EPG-, Waipu- oder TMDB-API-Anfragen**, kein eigener Produktivsync und kein Deployment. Die einzigen hochgeladenen Dateien sind die beiden anonymisierten aggregierten JSON-Berichte im privaten QA-Artefaktpfad, weiterhin sieben Tage Aufbewahrung.

Die Regressionen prüfen gesunde/zu alte/fehlgeschlagene Originalgenerationen, zu große, fehlende, defekte, leere oder falsche Matcher-Caches, nicht gelesene Symlinks, rein aggregierte CLI-Standardausgabe und unveränderte Quelldateien.

## Entscheidung nach dem ersten privaten Resultat

- **Waipu-Cache passt:** Als Nächstes darf eine isolierte Generation mit **frisch vom bestehenden Joyn-Matcher bestätigten** `approvedEvidence`-Quittungen vorbereitet werden. Waipu-Originalmatcherinputs müssen aus derselben echten, gesunden Quellgeneration stammen, **nicht** aus TMDB-Projektionen.
- **Waipu-Cache überschreitet 24 MiB / Generationen ungültig:** Keine künstliche Teilmenge des Caches als vermeintlich vollständiger Ausgangszustand verwenden. Zuerst eine nachvollziehbare cacheäquivalente beschränkte Originalmatcher-Methode entwickeln beziehungsweise neue vollständige Quelle prüfen.
- **Kein realer TMDB-Test** ist durch das positive Vorab-Audit autorisiert; dieser verlangt einen weiteren expliziten, kleinen, getrennten Pilot und unabhängige Messung der tatsächlich gestarteten HTTP-Requests.

**Produktivgrenzen unverändert:** gemeinsamer EPG-Index aus, unabhängige Waipu-/Joyn-Matcher, keine Änderung der MovieHub-App, AIR-/Playback-Routen oder des zentralen Nachtlaufs.
