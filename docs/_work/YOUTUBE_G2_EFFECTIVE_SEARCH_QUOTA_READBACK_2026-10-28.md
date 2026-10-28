# YouTube #388 – tatsächliche konfigurierte Google-Quotenlimits nur lesen

Stand 28.10.2026, auf Basis des erfolgreichen echten GET-only Pacific-Cloud-Readbacks #40689429142.

## Begründung

Der reale Google-Service-Usage-Readback meldete HTTP 200, vollständige Antwort ohne Pagination, vier Google-Quota-Metriken und **eine passende search_list-Metrik mit zwei Limit-Konfigurationen**. Bisher fehlt im öffentlichen anonymen Workflow-Status der **konkrete effektive Projektlimitwert und dessen Einheit**. Genau das wird isoliert nachgetragen; die bisherige allgemeine Annahme von 100 Search-Calls/Tag ist ausdrücklich **kein** projektbezogener Freigabebeleg.

Im selben echten Lauf meldete Google Cloud Monitoring 215 abgeschlossene Requests innerhalb von 24 Stunden, aber alle 215 Methoden waren unter der aktuellen engen Allowlist unklassifiziert. Eine Credential-Gruppe wurde beobachtet; das beweist weder nur einen existierenden Schlüssel noch die Abwesenheit externer Nutzer. Quota-Exceeded-Telemetrie war ausgelassen und Pacific-Readiness geblockt.

## Umsetzung

- Reine Funktion configuredSearchLimitReadback im bestehenden read-only Service-Usage-Parser. Nur exakt youtube.googleapis.com/search_list wird übernommen, dazu die zuvor strikt validierten Strings unit, effectiveLimit, defaultLimit und die booleschen Flags dimensioned/overridden. Kein Anzeigen roher Google-Antworten, fremder Metriken, API-Schlüssel oder Dimension-Werte.
- Konfigurationswerte werden ausschließlich bei vollständigem HTTP-200-Response, enabled YouTube-Dienst und keiner Pagination als auswertbare Konfiguration markiert. Fehler bleiben UNKNOWN. Dimensionierte Buckets werden als solche markiert, nicht mit dem gesamten Projektlimit gleichgesetzt.
- Der bestehende nur manuell bzw. explizit einmalig auslösbare Google quota-readonly-audit Workflow schreibt die validierte Suchkonfiguration als kleine anonyme Zeile in Log und Schrittbericht. Keine neue Google-Anfrage, keine neuen IAM-Rechte.
- Regressionstests prüfen mehrere unterschiedliche Einheiten, Override, Dimensionen ohne deren Werte, unvollständige HTTP-Readbacks, manipulierte Freigabe und unveränderte Trigger.

## Echter einmaliger Lauf

Ein grüner PR-Test testet nur synthetische Eingaben. Der tatsächliche Google-Cloud-Nachweis kann erst nach einem Merge in main mit dem bereits bestehenden Commit-Marker [youtube-quota-readonly-once] im Merge-Commit erscheinen. Der Quoten-Workflow hat weiterhin einen Push-Pfad für nur seine eigene Workflow-Datei und einen expliziten Marker-Gate; normale PR-/Push-Läufe führen keine Cloud-Abfrage aus.

## Sicherheits- und Entscheidungsgrenze

**Konfigurierte Limits sind nicht verbrauchte Einheiten, nicht das aktuelle Restkontingent, keine nachgewiesene Abwesenheit anderer Verbraucher und keine globale Google-Search-Serialisierung.** Auch ein explizites 100er- oder 95er-Limit berechtigt den Adapter nicht zu 95 Suchen. Weiterhin fehlen vollständige Caller-/Credential-Inventur, Cutover aller drei aktiven Suchwege auf ein einziges GCS-Tageskonto und echte End-to-End-Abnahme.

Unverändert: bisherige 10/1-Live-Budgetgrenze, keine YouTube-API-Suche durch diesen Patch, keine Provider-/Firestore-/Hosting-/Routen-/Rechteänderung. #388 bleibt offen; #336 und #391 pausieren.
