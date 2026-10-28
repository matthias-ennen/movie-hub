# YouTube #388 – read-only Zuordnung von Google Discovery Method-IDs

Stand 28.10.2026. Der tatsächlich erfolgreiche Google-Cloud Monitoring Readback #40689429142 meldete 215 abgeschlossene API-Requests/24h, aber alle 215 Method-Labels fielen durch den bisher exakt auf search.list, videos.list und wenige weitere Kurzformen begrenzten Parser. Diese **unbekannten** 215 dürfen nicht als 0 Suchaufrufe fehlinterpretiert werden.

## Kleine sichere Erweiterung

Google veröffentlicht im offiziellen YouTube REST Discovery-Dokument auch Method-IDs wie youtube.search.list und youtube.videos.list. Deshalb erkennt der read-only Parser jetzt ausschließlich die beiden exakten Search-IDs search.list und youtube.search.list und wenige ausdrücklich bekannte reine List-Lese-IDs in beiden Formen. Insbesondere werden keine beliebigen Methodennamen mit 'search' per Teilstring erraten; andere Namensformen bleiben UNCLASSIFIED.

Für nicht zugeordnete Labels werden nur Zähler für fünf grobe **strukturelle Kategorien** ausgegeben: missingOrInvalid, otherYoutubePrefixed, slashFormatted, otherDotted und other. Kein einziger tatsächlicher Methodenname, API-Schlüssel, Credential-Identifier, Video-/Filmtitel oder URL wird ausgegeben. Die Kategorien selbst belegen keine Endpunktidentität oder Search-Freiheit.

Das bereits bestehende manuelle Pacific-Quota-Workflow schreibt diese neuen aggregierten Zahlen im nächsten authentifizierten Google-Readback in den privaten Artefakt- und Step-Report. Der Workflow-Gate bleibt: workflow_dispatch auf main oder eine einzige Push-Ausführung nach Marker [youtube-pacific-budget-preflight-once] und nur Änderung an seiner Workflowdatei. Keine neue Monitoring-API-Anfrage und keine YouTube-Data-API-Anfrage, kein neuer IAM-Grant.

## Getrennte Quotenfreigabe

Das Google-Projekt hat im echten Service-Usage-Readback #40691449634 die effektive Konfiguration search_list mit **100/Tag und 100/Minute** gemeldet, ohne Dimension-Override. Eine solche Konfiguration ist kein aktuelles Restkontingent, kein Beleg über die übrigen API-Consumer und keine automatische 95er-Freigabe. Auch die neue Methodenklassifizierung kann unvollständige/laufzeitverzögerte Monitoring-Telemetrie nicht in vollständige Verbrauchszahlen verwandeln.

Die produktiven drei YouTube-Suchwege bleiben auf dem bisherigen atomaren GCS-10/1-Tagesledger. Der neue Shared-95-Gateway bleibt inaktiv. Vor Cutover sind alle externen API-Schlüssel/Consumer und Suchaufrufstellen zu inventarisieren, dann alle aktiven Jobs **gemeinsam** auf EIN Tagesledger zu migrieren und echtes End-to-End unter Pacific-Tagesbedingungen nachzuweisen. Keine ungeprüften DE-Angebote freigeben.

Quelle zu den öffentlich dokumentierten Method-IDs: https://code.googlesource.com/google-api-go-client/+/cd5935c8eb7842ca0138a57c4794bd280e455611/youtube/v3/youtube-api.json
