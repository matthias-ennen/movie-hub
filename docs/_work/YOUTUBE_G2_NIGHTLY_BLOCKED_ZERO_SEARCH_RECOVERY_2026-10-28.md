# YouTube #388 – gesicherter Null-Such-Recheck nach fehlgeschlagener Discovery

Stand 28.10.2026. Der echte einmalige Nightly-Discovery-Lauf [#40711789959](https://github.com/matthias-ennen/movie-hub/actions/runs/40711789959) ist **korrekt fail-closed** gescheitert: Google Monitoring lieferte einen alten Rate-Messpunkt, aber keine vollständige quota/exceeded-Telemetrie. Der private Fehlerreadback bestätigte **0 eigene Reservierungen**, GCS-Ledger/Queue/Kandidaten lesbar und **0 produktive Writes**. Es ist nicht belegt, dass die Ursache durch erneutes Starten verschwände. Daher keine automatische Wiederholung und keine Lockerung der 10/1-PT-Suchgrenzen.

Der vom Discovery-Erfolg abhängige workflow_run-Known-Video-Lauf wurde entsprechend **SKIPPED**. Der davon unabhängige tägliche Null-Such-Workflow ist weiterhin vorgesehen.

## Dieser PR: sichere positive Teilabnahme unabhängig von search.list

Der bestehende Null-Such-Recheck kontrolliert schon heute maximal 250 valide bereits bekannte TMDB-Filmidentitäten aus dem privaten checkpoint, nutzt ausschließlich YouTube videos.list und erzeugt nur private QA und eine optionale private Best-Effort-Vorschau. Wir ergänzen eine *zweite harte Netzwerkgrenze*:

- Für jedes videos.list müssen genau part=snippet,contentDetails,status und eine gültige ID-Liste mit 1 bis 50 YouTube-IDs übergeben werden.
- Jede einzelne Video-ID muss aus dem validierten privaten Checkpoint und der heute ausgewählten konfliktfreien Kohorte stammen. Unbekannte/fremde IDs, Duplikate, Zusatzparameter und freie Suchwörter werden vor einer API-Anfrage abgelehnt.
- Der bisherige zwingende endpoint=videos-Guard, Null-Such-Zähler, 250er-Reviewdeckel und strenge Veröffentlichungssperre bleiben unverändert.
- Das GitHub-Workflow-Preflight prüft vor OIDC, dass die neue Vertrauenskohorten-Prüfung im Live-Skript vorhanden ist.
- Regressionstests prüfen einzelne/batched valide IDs und alle genannten negativen Fälle ohne API-Aufrufe.

**Einmaliger echter Prüflauf**: Nach grüner PR-CI/APK nur mit dem bestehenden speziellen Marker [youtube-global-known-once] auf main squash-merge auslösen. Dieser erzeugt echten privaten TMDB-/videos.list-Readback und prüft QA, ohne search.list-Quota zu verbrauchen oder den Discovery-Fehler als gelöst zu behaupten. Bei fehlenden aktuellen Daten oder API-Fehlern weiterhin FAIL CLOSED.

Nicht enthalten: Neue Such-Requests, verifizierte DE-Miet- oder Kaufangebote, Provider-/Badge-/Firestore-/Firebase-Writes oder Aktivierung des vorbereiteten 95er-Gateways. Die drei produktiven Suchpfade bleiben bis zur gesonderten gemeinsamen Cutover-Abnahme auf dem 10/1er-Ledger. Issue #388 bleibt offen; #336/#391 pausieren.
