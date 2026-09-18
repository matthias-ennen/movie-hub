# Movie Hub – Roadmap

Stand: 18. September 2026

## Leitprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn technische Prüfpunkte und erforderliche manuelle Geräteabnahmen erfüllt sind.

Für die nächste Entwicklungsstrecke gilt:

1. **Datenintegrität vor neuen Produktfeatures absichern.**
2. **Security-/Dependency-Hygiene anschließend bereinigen.**
3. Danach wieder sichtbare Produktfeatures in klaren Paketen weiterentwickeln.
4. Vor Beginn jedes größeren Pakets wird dessen Scope noch einmal fachlich und technisch überprüft.
5. Der veröffentlichte Movie-Hub-Katalog ist der kanonische Ist-Zustand für öffentliche Titelmetadaten; Laufzeit-Anreicherungen dürfen gültige Katalogdaten nicht verschlechtern.

## Aktuell abgeschlossener Stand

Zu den zuletzt abgeschlossenen bzw. abgenommenen Paketen gehören insbesondere:

- #114 – großer Suchindex
- #178 – Staffeln und Folgen auf der Serien-Detailseite
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – zentrale Begrenzung normaler Posterreihen / D-Pad-Entscheidung
- #207 – robuste persönliche TMDB-Synchronisierung
- #218 – Layout-Sammelissue / UI-Konsistenz
- #222 – Einstellungen, Profilsteuerung und Sichtbarkeit
- #205 – persönliche Daten schützen und SMB-Verbindungen konsolidieren
- #190 – automatische Hero-Trailer und nativer Trailer-/Teaser-Player
- #226 – einheitlicher TV-Switch-On/Off-Effekt für Startsequenz und native Player
- #225 – kanonische Katalogdaten bei Metadaten-Anreicherung verlustfrei erhalten
- #228 – robuster nativer Kaltstart ohne zusätzlichen Tastendruck

Der aktuelle Fire-TV-Stand einschließlich der oben genannten Pakete wurde zuletzt am 18.09.2026 abgenommen.

## Aktuelles Arbeitspaket

### #117 – Dependency-Audit: bekannte npm-Sicherheitswarnungen bereinigen

- aktuellen `npm audit`-Stand neu ermitteln
- Critical-/High-Funde fachlich bewerten und kontrolliert beheben
- keine blinden Breaking-Updates
- verbleibende Findings dokumentieren
- vollständige Web-/Firebase-/Android-Regression

## Danach geplante Arbeitspakete

### 1. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

- einfache Aktion direkt am Titel
- rent/buy-only oder derzeit nicht enthaltene Titel beobachten
- Wechsel zu `flatrate`, `free` oder `ads` bei aktivierten Anbietern erkennen
- nur bei echter Zustandsänderung benachrichtigen
- keine unnötige Regelverwaltung im normalen UI

### 2. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

- Bewertungen, gesehen/ungesehen, Favoriten, Watchlist und Katalogdaten als Signale verwenden
- persönliche Top-100- und Empfehlungsreihen erzeugen
- wiederholbaren automatisierten Job etablieren
- objektive Verfügbarkeitsdaten weiterhin ausschließlich aus strukturierten Quellen ableiten
- Empfehlungen ohne APK-Update aktualisierbar machen

## Weitere spätere Pakete

- #129 – Deutsch/Englisch-Umschaltung der GUI
- #112 – rechtliche & Compliance-Prüfung als Release-Gate vor öffentlicher Verteilung

## Ganz am Ende / zurückgestellt

### #4 – Streaming-Verfügbarkeit und waipu.tv-/Live-TV-Ausbau

- kein vollständiger kostenloser und offiziell dokumentierter Waiputhek-Katalog verfügbar
- keine kostenlose offizielle EPG-Quelle mit vollständiger 14-Tage-Abdeckung der relevanten deutschen waipu.tv-Sender gefunden
- mögliche EPG-plus-Teilintegration ist zeitlich, senderseitig und lizenzrechtlich begrenzt
- keine kostenpflichtigen Quellen und keine privaten/reverse-engineerten waipu.tv-Schnittstellen verwenden
- vor einer Wiederaufnahme Datenquellen, Nutzungsrecht und Produktumfang erneut prüfen
- falls später umgesetzt, Waiputhek/VOD und konkrete lineare Sendetermine strikt trennen und Unvollständigkeit sichtbar machen

#4 bleibt offen, gehört aber nicht mehr zur aktiven Entwicklungsstrecke. Die Neubewertung erfolgt frühestens nach dem Release-Gate #112 beziehungsweise dann, wenn sich die Datenlage wesentlich verbessert.

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau; bleibt offen, solange noch Legacy-/Migrationspfade existieren

## Aktuelle Abhängigkeitskette

`#225 → #117 → #118 → #7`

#4 ist bewusst aus der aktiven Abhängigkeitskette entfernt und ans Ende der Roadmap verschoben. Vor Beginn jedes aktiven Pakets wird dessen Scope noch einmal kurz gegen den dann aktuellen Stand geprüft.
