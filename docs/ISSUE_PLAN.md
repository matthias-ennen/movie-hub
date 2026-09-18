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
- #117 – Dependency-Audit und Security-Hygiene

Die Fire-TV-App wurde mit diesem Stand zuletzt am 18.09.2026 abgenommen.

## Aktuelles Arbeitspaket

### #4 – Persönlichen Waipu-Live-Katalog aus Konto-EPG erzeugen

- #4A: FreeEPG-Qualitätsprototyp abgeschlossen; Feed wegen veralteter Daten ungeeignet
- **#4B aktiv:** rein lesender Konto-API-Prototyp für Device OAuth, Refresh,
  persönliche Sender und sparsame EPG-Horizont-Stichproben
- #4C: native Waipu-Verbindung und Keystore-geschützte Tokenablage
- #4D: rollierende EPG-Synchronisierung und Kandidatenmodell
- #4E: sichere TMDB-Zuordnung und atomaren persönlichen Katalog erzeugen
- #4F: Waipu-Live-Reihen, Badge, Sendetermine und Status darstellen
- #4G: Robustheit, Geräteabnahme und Release-/Rechte-Gate
- keine Waiputhek-/VOD-Aussage aus linearen Sendeterminen ableiten
- #4B schreibt weder nach Firestore noch in einen sichtbaren Katalog und
  persistiert keine Token oder persönlichen Rohdaten

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

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau

## Abhängigkeitskette

`#4A → #4B → #4C → #4D → #4E → #4F → #4G → #118 → #7`

#4 ist wieder aktiv. Die öffentliche Verteilung bleibt bis zur API-/Rechteprüfung und zur Compliance-Prüfung #112 gesperrt.

## Leitentscheidung

Der Waipu-Live-Ausbau beginnt nach dem gescheiterten FreeEPG-Qualitätstest mit
einem vollständig isolierten persönlichen Konto-Machbarkeitsnachweis. Erst
wenn Geräteanmeldung, Refresh, persönliche Sender, EPG-Horizont und vertretbare
Requestlast praktisch bestätigt sind, beginnt die native Integration. Ein
technischer Erfolg ersetzt nicht die spätere API-/Rechtefreigabe.
