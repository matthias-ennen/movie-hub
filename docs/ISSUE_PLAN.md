# Movie Hub – Issue-Plan

Stand: 17. September 2026

## Arbeitsprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. Vor Beginn eines Pakets wird dessen Umfang noch einmal kurz fachlich und technisch überprüft. Bereits bekannte, gültige Katalogdaten dürfen durch nachgeladene oder partielle Metadaten nicht verschlechtert werden.

## Bereinigter aktueller Status

Zuletzt abgeschlossen bzw. abgenommen:

- #114 – großer Suchindex
- #178 – Staffeln/Folgen
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – Posterreihen-/D-Pad-Paket
- #207 – robuste persönliche TMDB-Synchronisierung
- #218 – Layout/UI-Konsistenz
- #222 – Einstellungen, Profilsteuerung und Sichtbarkeit
- #205 – Verschlüsselung persönlicher Daten und SMB-Konsolidierung
- #190 – automatische Hero-Trailer sowie nativer Trailer-/Teaser-Player

Die Fire-TV-App wurde mit diesem Stand am 17.09.2026 als zusammenhängender Stand abgenommen.

## Neu festgestelltes Datenintegritätsproblem

Nach der Abnahme wurde bei einem Film beobachtet, dass ein Trailer im Hero vorhanden war, auf der Detailseite jedoch fehlte. Die Analyse zeigte: Der Katalog enthielt die Videodaten korrekt, eine spätere Metadaten-Anreicherung konnte sie jedoch durch ein leeres `videos`-Array überschreiben.

Das wird nicht als einzelner Trailer-Sonderfall behandelt, sondern als allgemeines Datenintegritäts-/Merge-Arbeitspaket.

## Aktuelle Priorisierung

### 1. #225 – Kanonische Katalogdaten bei Metadaten-Anreicherung verlustfrei erhalten

- alle Titel-Merge-Wege und Datenquellen inventarisieren
- `catalog.json` als kanonischen öffentlichen Ist-Zustand behandeln
- Feldmatrix für Merge-Regeln erstellen
- leere Arrays, leere Strings, `null` und unvollständige Nachladedaten dürfen bestehende gültige Werte nicht löschen
- Videos/Trailer/Teaser, Cast, Genres, Beschreibung, Artwork/Bilder, Provider, Collections, Serienmetadaten und weitere relevante Felder prüfen
- zentrale Merge-Regeln statt UI-spezifischer Reparaturen
- explizite „geprüft und leer“-Semantik nur dort verwenden, wo sie fachlich definiert ist
- Regressionstests für monotone, verlustfreie Anreicherung
- Hero, Reihe, Suche und Detailseite müssen für denselben Titel konsistente öffentliche Metadaten sehen

### 2. #117 – Dependency-Audit und Security-Hygiene

- aktuellen npm-Audit-Stand neu ermitteln
- Critical-/High-Funde bewerten und kontrolliert beseitigen
- keine blinden Breaking-Updates
- verbleibende Findings dokumentieren
- Web-, Firebase- und Android-Regression vollständig prüfen

### 3. #4 – Streaming-Verfügbarkeit und waipu.tv-/Live-TV-Ausbau

- strukturierte Streaming-Verfügbarkeit weiter ausbauen
- geeignete deutsche Live-TV-/EPG-Quelle prüfen
- waipu.tv-/lineare TV-Verfügbarkeit getrennt von Streaming-Abos modellieren
- Sendezeiten und Live-TV-Badges sinnvoll in UI und Detailansicht integrieren
- Aktualitätszeitpunkt und Attribution nachvollziehbar halten

### 4. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

- einfache Beobachten-Aktion direkt am Titel
- rent/buy-only bzw. aktuell nicht inklusive Titel beobachten
- Zustandswechsel zu `flatrate`, `free` oder `ads` erkennen
- Benachrichtigungen nur bei echten Änderungen
- Beobachtung einfach wieder entfernen

### 5. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

- persönliche Signale aus Bewertungen, gesehen/ungesehen, Favoriten und Watchlist nutzen
- persönliche Top-100- und Empfehlungsreihen erzeugen
- automatisierten, reproduzierbaren Job einrichten
- strukturierte Verfügbarkeitsdaten als Faktenbasis verwenden
- Ergebnisse ohne APK-Update aktualisieren

## Weitere spätere Themen

- #129 – Deutsch/Englisch-Umschaltung der Movie-Hub-GUI
- #112 – Compliance als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau

## Abhängigkeitskette

`#225 → #117 → #4 → #118 → #7`

## Leitentscheidung

Vor neuen Komfort- und Erweiterungsfunktionen wird zuerst sichergestellt, dass der bestehende Katalogzustand innerhalb der gesamten App konsistent und verlustfrei bleibt. Danach folgt die offene Security-Hygiene. Anschließend geht die Produktentwicklung mit Streaming-/Live-TV-Ausbau, Verfügbarkeitsbenachrichtigungen und persönlicher Empfehlung/Automatisierung weiter.