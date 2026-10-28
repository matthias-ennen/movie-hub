# YouTube #388 – geschlossene Inventur der GitHub-Suchjobs

Stand 28.10.2026. Konkreter Anlass ist der echte einmalige Nightly-Discovery-Abnahmelauf #40711789959 auf main 788bdc8b. Der Job wurde noch VOR einem API-Aufruf mit Kategorie quota-preflight-or-monitoring abgebrochen: Google Monitoring lieferte beim Quota-Exceeded-Signal keine vollständige Zeitreihe, während der beobachtete Search-Rate-Messpunkt nicht frisch genug war. Der anonymisierte Fehler-Readback meldete 0 vom Lauf reservierte Search-Slots, aber die exakte gesendete Anzahl bleibt korrekterweise unbekannt. Der automatische workflow_run-Handoff #40711914701 wurde mit skipped vom Success-Gate zurückgehalten. Daher ist eine erfolgreiche automatische End-to-End-Kette noch nicht nachgewiesen.

## Konkreter statischer Schutz

Der neue Test tests/youtube-g2-workflow-search-entrypoint-closure.test.js hält die **43 aktuell vorhandenen YouTube-benannten GitHub-Actions-Workflows** in einer expliziten Review-Liste fest. Ein neues YouTube-Workflow-File erzeugt dadurch sofort einen CI-Fehler, bis sein Search-Risiko geprüft und die Liste explizit erweitert wird.

Dabei sind sechs bekannte unbudgetierte historische Search-Jobs weiterhin **jobweit deaktiviert**. Genau drei Search-Runner sind als bisher konservativ über das atomare GCS-v1-Tageskonto autorisiert: Nightly Discovery, manueller Fünfer-Batch und Einzelsuche der Full-Catalog-Queue. Die Grenzen 10 pro Pacific-Tag bzw. degradierte 1/Tag sind im Test fixiert.

Für die übrigen **34 überprüften Workflow-Dateien** scannt der Test ihre direkt per node scripts/*.mjs startbaren Skripte und blockiert triviale direkte search-Transporte und rohe YouTube-search-URLs. Auch die neue, noch inaktive 95er-Gateway-Fabrik darf in keiner Workflow-Datei verdrahtet sein.

## Harte Beweisgrenze

Das ist ein zusätzlicher regressionssicherer Schutz der **lokalen GitHub Actions**. Eine statische Regex-basierte Prüfung beweist NICHT alle indirekten/importierten Suchpfade, dynamische API-Endpunkte, andere Google-Projekte oder Verbraucher fremder Schlüssel. Vollständige Quotenhoheit erfordert weiterhin die tatsächliche Caller-/Credential-Inventur und die transaktionale Migration der drei aktiven Search-Jobs auf EIN gemeinsames GCS-Tageskonto.

Der Test führt keinerlei YouTube-/TMDB-/Cloud-Anfrage aus; weder Monitoring-Guard noch echte 95er-Quotenfreigabe, Firebase-Links, Rechteprüfungen oder produktive Adapterdaten ändern sich.

## Danach

1. CI/Android auf dem konkreten PR-Head abwarten; erst bei Erfolg sicher übernehmen.
2. Den bereits beobachteten Google-Monitoring-Quoten-Block nicht als Matcher- oder Programmfehler umdeuten und nicht durch ein offenes Retry umgehen.
3. Beim nächsten echten scheduled-Discovery-Lauf die protokollierte Aufnahmeentscheidung und den vertrauenswürdigen Success-Handoff prüfen. Falls Google weiterhin keine geeignete Quotenmessung liefert, bleibt der Search-Teil vorsichtig gesperrt; die unabhängigen bekannten-Video-Null-Such-Rechecks können weiterlaufen.
4. Für Version 1 keine unbewiesenen deutschen Miet-/Kaufangebote oder exakte 95-Restquota behaupten.

#388 bleibt offen, #336 und #391 pausieren.
