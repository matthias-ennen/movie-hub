# YouTube #388 – unbekannte Google-Methoden als mögliche Such-Verbraucher eingrenzen

Stand 28.10.2026. Hintergrund: Der reale reine Cloud-Monitoring-GET-Lauf #40692468420 zeigte 223 beobachtete abgeschlossene YouTube-API-Requests innerhalb des 24h-Fensters, **alle 223 unklassifiziert** mit YouTube-Präfix. Daraus kann weder 0 echte Suchaufrufe noch die Zahl externer Verbraucher abgeleitet werden.

## Änderung
Der bereits vorhandene rein lesende Parser api/request_count differenziert zusätzlich ausschließlich **anonym aggregierte** unbekannte Methoden:
- possibleSearchAmongUnknown zählt nur unbekannte, mit youtube. beginnende Methodennamen mit der Zeichenfolge search (Groß-/Kleinschreibung ignoriert). Das ist **nur ein unscharfer Verdacht**, niemals der Nachweis einer tatsächlichen search.list-Methode.
- otherUnknownMethodRequests enthält die übrigen bisher unbekannten Methoden. **Auch diese können Suchen enthalten**; 0 Verdachtsfälle ist kein Beweis für 0 Suchaufrufe.
- Das bestehende Schema und die identitätsfreien Struktur-Buckets bleiben erhalten. Rohmethoden, API-Schlüssel, Credential-IDs, Video-/Film-IDs und Google-Antworten werden nicht ausgegeben.
- Der bestehende Pacific-GET-only-Workflow validiert strikt die Summe beider neuen Buckets gegen unclassifiedMethodRequests vor der Zusammenfassung.

## Echte Prüfung und Freigabegrenzen
Ein Testsieg beweist nur die Offline-Logik. Ein späterer tatsächlicher Readback benötigt den **bereits bestehenden**, einmaligen main-Commit-Marker [youtube-pacific-budget-preflight-once] oder einen manuellen workflow_dispatch. Ohne diesen Trigger kein neuer Cloud-Lauf.

Die Messung bleibt zeitlich verzögert, erfasst ausschließlich berichtete abgeschlossene Requests, entspricht nicht zwingend einem Pacific-Tag und ist keine Inventur aller Google-API-Schlüssel und externen Projekt-Verbraucher. actualSearchListRequests=null, quotaRemaining=null, externalConsumersFullyAccountedFor=false sowie authorizedSearchCalls=0 bleiben erzwungen.

**Keine neue YouTube-Suche, keine Quotenfreigabe, keine neue Google-Berechtigung, kein Publikations-/Firebase-/Firestore- oder Matcher-Eingriff.** Die alten produktiven 10/1-PT-Tag-Suchgrenzen bleiben aktiv; das neue 95er-Konto bleibt inaktiv. #388 bleibt offen; #336/#391 bleiben pausiert.

## Parallel bereits echt bestätigter erster funktionierender Teil
- Bekannter Null-Such-Videorecheck #40721906999 (SUCCESS): 62 private Filme, 58 kollisionsfrei in der Basis, 33 aktuelle TMDB-YouTube-Badge-Filme, 21 rein vorläufige Watch-Shortcuts, 0 search.list.
- Firebase Hosting #40721887584 (SUCCESS) nutzte genau diesen trusted Review-Lauf, publizierte **21** Best-Effort-Watch-Links und las sie live wieder zurück. Suchbegleitindex: **75** Einträge; 0 verifizierte DE-Angebote. Das ist ein echter positiver Teilschritt der V1-Abnahme, aber keine abgeschlossene Nightly-Neusuche.
