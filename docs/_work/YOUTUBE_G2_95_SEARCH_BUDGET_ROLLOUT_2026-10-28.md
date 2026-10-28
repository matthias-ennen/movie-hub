# YouTube #388 – kontrollierter Ausbau auf bis zu 95 gemeinsame Suchversuche

Arbeitsstand: 28.10.2026 – erste technische Arbeitsfassung. Projekt: matthias-ennen/movie-hub, [Issue #388](https://github.com/matthias-ennen/movie-hub/issues/388).

## Ziel

Maximal **95 search.list-Versuche je Pacific-Tag für alle kontrollierten Movie-Hub-Aufrufer gemeinsam**, nicht je Workflow. Die übrigen fünf des **nominellen** 100er-Google-Kontingents bleiben als Reserve. Das tatsächliche Limit und der projektweite Fremdverbrauch sind noch unabhängig zu prüfen. Weniger als 95 Suchen bei unzureichendem Backlog, API-Sperren oder ungeklärten Voraussetzungen sind richtig.

**Kein neuer produktiver API-Zugang durch diesen PR.** Bestehende Matcher- und Fassungsprüfungen, Rechte-/Compliance-Grenzen sowie redaktionelle Best-Effort-Kennzeichnung bleiben erhalten. YouTube Policies III.E.2/III.E.4 sind nicht durch technischen Erfolg geklärt.

## Bestandsaufnahme aus main vom 28.10.2026

| Teil | Gesicherter Befund | Konsequenz |
| --- | --- | --- |
| scripts/youtube-g2-atomic-search-budget-ledger.mjs | GCS-Generation-CAS und Tagesgrenze 10 für kooperierende Forschungsjobs; nicht für alle Google-Projektverbraucher. Einmal reservierte Suchen werden nicht erstattet. | Sichere Basis, aber kein projektweites Quoten-Gateway. |
| scripts/youtube-g2-pacific-search-preflight.mjs | Nur beratendes Google-Monitoring, 30 Fremdverbraucher/10 Monitoring-Verzug/10 weitere Sicherheitsreserve; fehlende Daten sind kein Nullverbrauch. | Limit nicht blind erhöhen. |
| scripts/youtube-g2-nightly-discovery-live.mjs | 60 TMDB-Vorprüfungen, 20 Sekunden Abstand; normal 10 Suchen, im eng begrenzten Monitoring-Fehlermodus nur 1. | Queue, TMDB-Budget und Laufzeit skalieren. |
| .github/workflows/youtube-g2-nightly-discovery.yml | Cron 35 11 UTC, 35-Minuten-Timeout und eigener Preflight. | Nicht ohne Gates auf 95 öffnen. |
| scripts/youtube-g2-five-search-public-batch.mjs und scripts/youtube-g2-one-search-admission.mjs | Manuelle 5er-/1er-Recherche mit altem gemeinsamem Ledger. | Auf genau einen Gateway migrieren. |
| scripts/youtube-api-smoke.mjs | Gemeinsamer API-Transport mit Fehlerklassifikation, aber keine verbindliche projektweite Reservierung vor jedem search.list. | Suchzugang später transportnah erzwingen. |
| Ältere YouTube-G1/G2-Workflows | Zahlreiche manuelle und teilweise Push-Forschungspfade; **vollständiges ausführbares Callsite-Audit noch offen**. | Vor 95-Freigabe jeden Suchaufrufer migrieren oder kontrolliert sperren. |
| docs/YOUTUBE_G2_CAPACITY_AND_ENRICHMENT.md | Privater Kandidatencheckpoint bis 3.500 Filme; täglicher stabiler Recheck derzeit bis 250 Filme, Overflow-Rotation separat. | Ab >250 separate sichere automatische Rotation. |

Referenz: [Firebase #40670842189](https://github.com/matthias-ennen/movie-hub/actions/runs/40670842189) mit 134 Playlist-Video-IDs, 73 editoralen Watch-Links, 21 vorläufigen Best-Effort-Links und 61 Reviews. Diese Zahlen sind **kein** Quoten- oder Rechtebeleg.

## Änderung 1: isolierter, derzeit nicht aktivierter Gateway-Kern

Neue Datei scripts/youtube-g2-shared-search-gateway.mjs, unter separatem privatem GCS-Objektpräfix; keine Änderung am bestehenden v1-Tageskonto.

- Pacific-Tagesgrenze inklusive DST und harte gemeinsame 95er-Obergrenze.
- **Eine atomare GCS-Generation-CAS-Reservierung je Versuch, vor dem API-Transport**, eindeutiges Paar aus Run-ID und Versuchsnummer.
- Ergebnisse success, quota-exceeded, rate-limited, failed-unknown oder reserved-unknown. **Unklare oder abgestürzte Versuche bleiben reserviert**, ohne automatische Rückbuchung oder Wiederholung.
- Quota-403 stoppt weitere Tagesreservierungen; 429 bleibt gesonderter Fehler und der betroffene Lauf bricht ab.
- Nur technische Zähler/Run-ID/Versuchsnummer/Zeit und Status im privaten Tagesledger; **keine Film-, Video-, Suchbegriffs-, URL- oder Secret-Daten**.
- Ein technisches Admission-Objekt verlangt ein bestätigtes Projektlimit, vollständige Migration aller Suchaufrufer, geklärten Fremdverbrauch und explizite Freigabe. Diese Eingabe ersetzt **keinen** tatsächlichen Google-Cloud-Nachweis.
- Nur isolierte Tests nutzen simulierte Freigaben und ein In-Memory-GCS. **Kein Workflow nutzt diesen Code.** Die produktiven 10er-/1er-Grenzen bleiben erhalten.

Tests: kein Zugriff ohne Admission, 95/96-Grenze, Doppelausgabe, Manipulation/Privatfelder, parallele CAS-Reservierungen, Pacific-Winterzeit, keine Rückbuchung, 403-Halt, 429-Trennung, Persistenz und kein API-Aufruf vor Reservierung.

## Änderung 2: Migration und Durchsatz (noch offen)

1. **Vollständige ausführbare Aufrufstellen-Inventur** von Live-, manuellen und historischen Jobs im Repo und anderen Nutzern des gleichen Google-Projekts. Alte parallele Recherche-Wege auf Gateway umstellen oder stilllegen; Videos-/Playlist-Budget separat kontrollieren.
2. **Google Cloud verifizieren:** tatsächliches search.list-Projektlimit, Quota-Projekt und alle Fremdverbraucher. Ohne nachweisliche kontrollierte Nutzung ist 95 nicht freigabefähig.
3. Migration der bisherigen Discovery-, 1er- und 5er-Aufrufer auf einen einzigen GCS-Gateway; kein Parallelbetrieb zweier Suchbudget-Ledger. Sicheren Pacific-Tagesübergang wählen und Quoten-/Altledger-Readback durchführen.
4. Discovery-Queue mit mehr als 60 Vorprüffilmen resumierbar skalieren, 20s-Abstand und TMDB-Budget einhalten; Timeout anpassen oder Batches aufteilen. Matcher, Kollisions- und Content-Checks unverändert lassen.
5. 250er-Basiskohorte beibehalten, vorhandenen privaten Overflow-Recheck auf sichere tägliche Rotation erweitern und erst nach Prüfung zusätzliche Best-Effort-Links publizieren.

## Änderung 3: Live- und Endabnahme (noch offen)

Parallele Runs, GCS-CAS, Abstürze vor und nach API-Aufruf, Tageswechsel, 403/429, Monitoring-Lücken, externe Verbraucher, fehlgeschlagene Rechecks und falsch zugeordnete Filme testen. Danach einen echten Pacific-Tag mit getrennten Kennzahlen für reservierte, versuchte, erfolgreiche und unklare Suchen prüfen. Weder Reservierung noch Erfolg der Google-API alleine beweist eine richtige Filmidentität.

**Automatische E2E-Kette**: erfolgreicher geplanter Discovery-Lauf → wirklich workflow_run-getriggerter Known-Recheck → nachfolgender regulärer Firebase-Deploy, jeweils mit echten Job- und Originalartefakten sowie HTTP-Readback.

Erst dann persönliche Endabnahme. **#388 bleibt offen; #336 DVB-I und #391 Prime Video pausieren.**

## Grenzen dieser ersten PR

Enthalten: inaktiver Gateway-Kern, Tests und diese Arbeitsfassung. **Nicht enthalten**: operative Aktivierung oder 95 Suchaufrufe, Google-Quota-Verifikation, Cloud-/Workflow-Änderungen, Deploy, neue Links, Compliance-Freigabe oder Endabnahme. Keine ungetesteten Quotenexperimente. Nächster PR erst auf Grundlage grüner CI und vollständiger Aufrufstellenprüfung.
