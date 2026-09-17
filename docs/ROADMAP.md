# Movie Hub – Roadmap

Stand: 17. September 2026

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

Der aktuelle Fire-TV-Stand einschließlich der oben genannten Pakete wurde am 17.09.2026 als zusammenhängender Stand abgenommen.

## Neue Erkenntnis nach der Abnahme

Bei einem Titel wurde entdeckt, dass im Hero ein Trailer vorhanden war, auf der Detailseite nach progressiver Metadaten-Anreicherung jedoch nicht mehr. Ursache ist kein fehlender TMDB-Datensatz, sondern eine zu aggressive Merge-Semantik: Ein unvollständiger Nachlade-Datensatz konnte bereits vorhandene gültige Katalogfelder überschreiben.

Daraus entsteht ein eigenständiges Datenintegritäts-Arbeitspaket:

### 1. #225 – Kanonische Katalogdaten bei Metadaten-Anreicherung verlustfrei erhalten

- alle Titel-Merge-Wege inventarisieren
- `catalog.json` als kanonischen öffentlichen Ist-Zustand absichern
- Feldmatrix für Merge-Semantik definieren
- leere/unvollständige Nachladedaten dürfen vorhandene gültige Werte nicht löschen
- insbesondere Videos, Cast, Genres, Beschreibung, Artwork/Bilder, Provider, Collections und Serienmetadaten prüfen
- zentrale statt ansichtsspezifische Merge-Regeln
- Trailer-/Teaser-Konsistenz zwischen Hero und Detailseite herstellen
- Regressionstests für verlustfreie und monotone Metadaten-Anreicherung

Dieses Paket hat Vorrang vor weiteren Produktfeatures.

## Danach geplante Arbeitspakete

### 2. #117 – Dependency-Audit: bekannte npm-Sicherheitswarnungen bereinigen

- aktuellen `npm audit`-Stand neu ermitteln
- Critical-/High-Funde fachlich bewerten und kontrolliert beheben
- keine blinden Breaking-Updates
- verbleibende Findings dokumentieren
- vollständige Web-/Firebase-/Android-Regression

### 3. #4 – Streaming-Verfügbarkeit und waipu.tv-/Live-TV-Ausbau

- aktuelle Streaming-Verfügbarkeit strukturiert weiterführen
- Live-TV-/EPG-Datenquelle für Deutschland prüfen und anbinden
- waipu.tv-/lineare TV-Verfügbarkeit getrennt von Streaming-Abos behandeln
- Sendezeit/Verfügbarkeit in Detailansicht und Badges sinnvoll darstellen
- Aktualität und Attribution nachvollziehbar halten

### 4. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

- einfache Aktion direkt am Titel
- rent/buy-only oder derzeit nicht enthaltene Titel beobachten
- Wechsel zu `flatrate`, `free` oder `ads` bei aktivierten Anbietern erkennen
- nur bei echter Zustandsänderung benachrichtigen
- keine unnötige Regelverwaltung im normalen UI

### 5. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

- Bewertungen, gesehen/ungesehen, Favoriten, Watchlist und Katalogdaten als Signale verwenden
- persönliche Top-100- und Empfehlungsreihen erzeugen
- wiederholbaren automatisierten Job etablieren
- objektive Verfügbarkeitsdaten weiterhin ausschließlich aus strukturierten Quellen ableiten
- Empfehlungen ohne APK-Update aktualisierbar machen

## Weitere spätere Pakete

- #129 – Deutsch/Englisch-Umschaltung der GUI
- #112 – rechtliche & Compliance-Prüfung als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau; bleibt offen, solange noch Legacy-/Migrationspfade existieren

## Aktuelle Abhängigkeitskette

`#225 → #117 → #4 → #118 → #7`

Diese Reihenfolge ist der aktuelle Arbeitsplan. Vor Beginn jedes Pakets wird dessen Scope noch einmal kurz gegen den dann aktuellen Stand geprüft.