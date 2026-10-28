# YouTube #388 – anonyme Beobachtung von Methoden und API-Zugangsdaten

Stand 28.10.2026. Dieser Änderungsschritt ergänzt den vorhandenen read-only Cloud-Monitoring-Parser für serviceruntime.googleapis.com/api/request_count im Projekt movie-hub-62459. Es gibt **keine** neue Google API-Anfrage: Nur die **bereits bestehende** manuelle Workflow-Diagnose youtube-g2-pacific-search-preflight.yml kann die neuen Felder durch einen späteren echten Cloud-Lauf befüllen.

## Neue, begrenzte Aussagen

- observedSearchMethodRequests: nur Google-Zeitreihen mit **exaktem** resource.labels.method = "search.list"; andernfalls wird **kein** Search-Request aus der Bezeichnung erschlossen.
- observedOtherMethodRequests: nur explizit bekannte nicht-suchende List-Endpunkte (videos.list, channels.list, playlists.list, playlistItems.list, videoCategories.list).
- unclassifiedMethodRequests: fehlende, andere oder unbekannte Methodennamen werden **nicht** als search-frei angenommen. Damit bleibt die Auswertung sicher, wenn Google andere Schreibweisen oder Endpunktmethoden liefert.
- methodLabelsPresentForAllSeries: ausschließlich Form-Vollständigkeit der Methodenbezeichnungen; **kein** Beweis, dass alle tatsächlich gesendeten Requests beobachtet wurden.
- distinctCredentialGroupsObserved: Anzahl unterschiedlicher **nicht ausgegebener** credential_id-Werte, nur wenn jede empfangene Serie ein gültiges Label trägt. Schon zwei verschiedene beobachtete Werte sind eine wichtige Auffälligkeit für die spätere Quoten-/Schlüsselinventur, **beweisen aber keine fremden Verbraucher**. Eine oder null Gruppen beweisen umgekehrt **nicht**, dass es keine externen Schlüssel gibt.
- externalConsumersFullyAccountedFor: immer false; actualSearchListRequests und quotaRemaining immer null. Die 24-Stunden-Messung kann um 30 Minuten verzögert sein, ist kein Pacific-Tag, zeigt nur abgeschlossene und in Monitoring tatsächlich ausgegebene Requests. Leere, unvollständige oder paginierte Antworten liefern **keinen** vollständigen Methoden-/Schlüsselbefund.

Es werden **keine** tatsächlichen credential_id-Werte, Methodenbezeichnungen, API-Tokens, Film-/Video-IDs, Rohantworten oder Zeitreihen veröffentlicht. Die Testdaten zeigen nur die aggregierten Mengen und prüfen, dass Test-Credential-IDs nie im Ergebnis landen.

## Grenzen und Folgearbeiten

1. Bestehenden rein lesenden Quoten-Workflow in einem authentifizierten manuellen Lauf ausführen, HTTP-Status und beobachtete anonymisierte Gruppen lesen. Ein lokaler Test oder Workflow-CI allein bestätigt keine Cloud-Telemetrie.
2. Effektive **projektbezogene** Google-search.list-Limit-Konfiguration getrennt vom Default und den vorhandenen Schlüsseln prüfen. Googles allgemeines Standardlimit von 100 Search-Requests/PT-Tag ist **kein** projektspezifischer Freigabebeleg.
3. Weitere Credential-Inhaber bzw. externe Verbraucher über Cloud-Konfiguration/Betreiberinventur und die wirklichen Workflow-Aufrufstellen erfassen. Kein bloßer Methoden-Zählwert ersetzt diese Prüfung.
4. Erst nach vollständiger Migration aller produktiven search.list-Verbraucher vom alten GCS-v1-Tagesledger auf **denselben** neuen Shared Gateway, Absicherung des Tagesübergangs und Freigabe kontrolliert in Richtung 95 fortschreiten.

**Unverändert:** Alle bestehenden produktiven 10/1-Suchgrenzen, keine neuen YouTube-API-Aufrufe, kein neues Cloud-Recht, kein Deploy-/Firestore-/Link-/Anbieter-/Matcher-Eingriff, keine vorzeitige 95er-Aktivierung. #388 bleibt offen; #336 und #391 pausieren.
