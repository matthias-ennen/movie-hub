# Movie Hub – Issue-Plan

Stand: 18. September 2026

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
- #225 – verlustfreie Metadaten-Anreicherung
- #228 – robuster nativer Kaltstart

Die Fire-TV-App wurde mit diesem Stand zuletzt am 18.09.2026 abgenommen.

## Aktuelles Arbeitspaket

### #117 – Dependency-Audit und Security-Hygiene

- aktuellen npm-Audit-Stand neu ermitteln
- Critical-/High-Funde bewerten und kontrolliert beseitigen
- keine blinden Breaking-Updates
- verbleibende Findings dokumentieren
- Web-, Firebase- und Android-Regression vollständig prüfen

## Aktuelle Priorisierung

### 1. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

- einfache Beobachten-Aktion direkt am Titel
- rent/buy-only bzw. aktuell nicht inklusive Titel beobachten
- Zustandswechsel zu `flatrate`, `free` oder `ads` erkennen
- Benachrichtigungen nur bei echten Änderungen
- Beobachtung einfach wieder entfernen

### 2. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

- persönliche Signale aus Bewertungen, gesehen/ungesehen, Favoriten und Watchlist nutzen
- persönliche Top-100- und Empfehlungsreihen erzeugen
- automatisierten, reproduzierbaren Job einrichten
- strukturierte Verfügbarkeitsdaten als Faktenbasis verwenden
- Ergebnisse ohne APK-Update aktualisieren

## Weitere spätere Themen

- #129 – Deutsch/Englisch-Umschaltung der Movie-Hub-GUI
- #112 – Compliance als Release-Gate vor öffentlicher Verteilung

## Ganz am Ende / zurückgestellt

### #4 – Streaming-Verfügbarkeit und waipu.tv-/Live-TV-Ausbau

Die Recherche vom 18.09.2026 ist im Issue dokumentiert. Derzeit existiert weder ein kostenloser offizieller Waiputhek-Gesamtkatalog noch eine kostenlose offizielle EPG-Quelle mit vollständiger 14-Tage-Abdeckung der relevanten deutschen waipu.tv-Sender.

Eine mögliche EPG-plus-Teilintegration wäre nur für wenige Sender und einen kürzeren Zeitraum geeignet und muss außerdem gegen die Nutzungsbedingungen des geplanten Verteilungsmodells geprüft werden. Kostenpflichtige Quellen, manuelle Katalogpflege sowie private oder reverse-engineerte waipu.tv-Endpunkte bleiben ausgeschlossen.

#4 bleibt offen, ist aber aus der aktiven Planung entfernt. Eine Neubewertung erfolgt frühestens nach #112 oder bei einer wesentlichen Änderung der offiziellen und kostenlosen Datenlage.

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau

## Abhängigkeitskette

`#225 → #117 → #118 → #7`

#4 gehört nicht mehr zur aktiven Abhängigkeitskette.

## Leitentscheidung

Vor neuen Komfort- und Erweiterungsfunktionen wird zuerst sichergestellt, dass der bestehende Katalogzustand innerhalb der gesamten App konsistent und verlustfrei bleibt. Danach folgt die offene Security-Hygiene. Anschließend geht die Produktentwicklung mit Verfügbarkeitsbenachrichtigungen und persönlicher Empfehlung/Automatisierung weiter. Der waipu.tv-/Live-TV-Ausbau bleibt bis zu einer tragfähigen kostenlosen und offiziellen Datenbasis zurückgestellt.
