# YouTube #388 – einmaliger echter Google-Cloud-Readback ohne YouTube-Requests

Stand 28.10.2026. Der bestehende read-only Workflow
\`.github/workflows/youtube-g2-pacific-search-preflight.yml\`
liest mit vorhandenem OIDC-Zugang Google Cloud Service Usage und Monitoring.
Er löst **keinen** YouTube-Data-API-Request aus, reserviert keinen GCS-
Suchslot und ändert keine Quota-, Firestore-, Provider- oder Hosting-Daten.

## Dieser Schritt

Die vorhandene 24h-API-Request-Telemetrie bekommt im GitHub-Actions-Job
nur **anonyme Aggregate** in der Schrittzusammenfassung:
- beobachtete explizite \`search.list\`-Methoden;
- eindeutig bekannte andere Lese-Methoden;
- unbekannte/ungelabelte Methoden und Form-Vollständigkeit;
- Anzahl (aber **niemals Identität**) unterschiedlicher im Monitoring
  beobachteter Credential-Gruppen.

Der Workflow prüft die strengen Invarianten aus dem neuen Parser
\`scripts/youtube-g2-api-traffic-diagnostic.mjs\`, bevor ein Aggregat
ausgegeben wird: \`externalConsumersFullyAccountedFor=false\`,
\`actualSearchListRequests=null\`, \`quotaRemaining=null\`,
\`authorizedSearchCalls=0\`, \`youtubeApiCalls=0\`, \`gcsWrites=0\`,
\`quotaWrites=0\` und \`publicationPermitted=false\`.
Der eigentliche Parser und die Cloud-Anfragen bleiben unverändert.

## Einmalige reale Ausführung

Ein normaler PR-Lauf führt diese OIDC-Diagnose **nicht** aus. Der Workflow
hat weiterhin nur \`workflow_dispatch\` und einen Push-Pfad auf **seine
eigene Workflow-Datei**. Bei diesem Push ist die Ausführung zusätzlich
an den bestehenden exakt markierten Commit-Messagetext
\`[youtube-pacific-budget-preflight-once]\` gebunden. Erst beim gemergten,
entsprechend markierten \`main\`-Commit ist ein tatsächlicher Cloud-Readback
auszulösen und an echter Run-ID, Schritten und ausschließlich
anonymisiertem Bericht zu überprüfen.

Das ist weder ein Nightly-Discovery-Run noch ein Suchbudget-Cutover.

## Grenzen

Die Google-Telemetrie kann 30 Minuten verzögert, zeitlich unvollständig,
mehrdeutig oder gar nicht vorhanden sein. Ein einzelner beobachteter
Credential-ID-Wert bedeutet **nicht**, dass im Projekt nur ein Schlüssel
oder ein Consumer existiert. Das 24-Stunden-Zeitfenster ist **kein**
Pacific-Tag. Fehlende oder unbekannte Monitoring-Labels bleiben UNKNOWN.
Die tatsächliche Projektquota, externalen Verbraucher, möglichen
weiteren Schlüssel, alle Search-Callsites und der gemeinsame
Cutover bleiben getrennte Freigabegates.

Keine Aktivierung der 95er-Grenze; die alten v1-10/1-Live-Workflows
bleiben unangetastet. Issue #388 bleibt offen, #336/#391 pausieren.
