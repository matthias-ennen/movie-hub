# Movie Hub – Roadmap

Stand: 16. September 2026

## Leitprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn technische Prüfpunkte und erforderliche manuelle Geräteabnahmen erfüllt sind.

Für die nächste Entwicklungsstrecke gilt:

1. **Kleine sichtbare UI-Themen zuerst sauber abschließen.**
2. **Einstellungen zentral und profilbezogen strukturieren.**
3. **Security-/Dependency-Hygiene vor größeren Datenmigrationen.**
4. **Daten- und SMB-Architekturänderungen nacheinander statt parallel.**
5. Vor Beginn jedes größeren Pakets wird dessen Scope noch einmal fachlich und technisch überprüft; zusätzliche Punkte dürfen dabei ergänzt werden.

## Aktuell abgeschlossener Stand

Zu den zuletzt abgeschlossenen bzw. abgenommenen Paketen gehören insbesondere:

- #114 – großer Suchindex
- #178 – Staffeln, Folgen und Episodendetail
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – zentrale Begrenzung normaler Posterreihen / D-Pad-Entscheidung
- #207 – robuste persönliche TMDB-Synchronisierung

Die Fire-TV-Stabilität wurde durch vertikale Virtualisierung, gezieltes Poster-Prefetching und reduzierte Posterlast deutlich verbessert und real getestet.

Das bisherige starre 20er-/40er-Verhalten einzelner Reihen wird **nicht mehr in #195 weiterentwickelt**, sondern bewusst in #222 als profilbezogene Einstellung neu gelöst.

## Aktuelle Entwicklungsreihenfolge

### 1. #218 – Layout-Sammelissue: UI-Konsistenz und visuelle Korrekturen

Kleine sichtbare Inkonsistenzen bündeln und bereinigen:

- Movie-Hub-Badge überall wie auf regulären Posterkacheln darstellen
- Abstand Anbieterbadges ↔ Titel/Jahr kompakter machen
- Fokusrahmen der Staffel-Schaltflächen auf Serien-Detailseiten sauber ausrichten und vollständig sichtbar machen

Das Paket wird vor Umsetzung noch einmal gegen die betroffenen Ansichten geprüft und darf um weitere kleine Layoutpunkte ergänzt werden.

### 2. #222 – Einstellungen aufräumen und erweitern

Die Einstellungsseite wird strukturell aufgeräumt und um profilbezogene Steuerungen ergänzt.

Fest vorgesehen:

- Posterreihen: **30 / 40 / 50 / 60 / 70**, Standard 50
- Heroes: **3 / 4 / 5 / 6 / 7**, Standard 5
- Hauptbenutzer und Unterbenutzer können unterschiedliche Werte besitzen
- alte feste 20er-/40er-Grenzen normaler Reihen entfallen zugunsten der Profil-Einstellung
- Limit greift früh nach Filterung/Sortierung, nicht erst beim Rendern

Vor Umsetzung wird zusätzlich geprüft, welche weiteren Einstellungen sinnvoll sind und wie bestehende Optionen logisch gruppiert werden.

### 3. #117 – Dependency-Audit: bekannte npm-Sicherheitswarnungen bereinigen

- aktuellen `npm audit`-Stand ermitteln
- Critical-/High-Funde fachlich bewerten und kontrolliert beheben
- keine blinden Breaking-Updates
- verbleibende Findings dokumentieren
- vollständige Web-/Firebase-/Android-Regression

### 4. #205 – Persönliche Links, SMB-Pfade und Notizen in Firestore verschlüsseln

Pragmatische appseitige Verschlüsselung sensibler persönlicher Klartextfelder:

- `sharedMedia.entries.url`
- `sharedMedia.entries.label`
- persönliche `note`
- AES-256-GCM mit zufälligem IV/Nonce und `cryptoVersion`
- bestehende Klartextdaten verlustfrei migrieren
- keine E2E-, Gerätefreigabe- oder Recovery-Key-Architektur

Vor Umsetzung wird die Kryptobrücke und Migration noch einmal konkret gegen die aktuelle App-/WebView-Architektur ausgearbeitet.

### 5. #220 – SMB-Netzlaufwerke normalisieren und Dubletten zusammenführen

- Host und Share für die Verbindungsidentität case-insensitive normalisieren
- vollständigen Medienpfad unverändert erhalten
- `Share`, `share` und `SHARE` als dieselbe reale SMB-Verbindung behandeln
- doppelte Netzlaufwerke migrieren/zusammenführen
- nur einen lokalen Credential-Satz je realer Freigabe benötigen

## Danach geplante Produktpakete

Nach diesen fünf Paketen wird die weitere Reihenfolge neu bewertet. Bereits vorhandene spätere Kandidaten sind unter anderem:

- #176 – profilbezogenes Sichtbarkeitskonzept für Inhaltsbereiche
- #190 – optionale automatische Trailer im Hero
- #4 – Live-TV-/waipu-/EPG-Ausbau
- #118 – Benachrichtigen, wenn ein Titel inklusive wird
- #7 – persönliche Empfehlungen / Top 100 / Automatisierung
- #129 – Deutsch/Englisch-Umschaltung
- #112 – Compliance als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen

- #8 – Ideen-Sammelstelle

## Nächste Abhängigkeitskette

`#218 → #222 → #117 → #205 → #220`

Diese Reihenfolge gilt als aktueller Arbeitsplan. Jedes Paket wird unmittelbar vor Beginn noch einmal kurz fachlich/technisch geschärft; dabei können zusätzliche Punkte ergänzt werden, ohne die Grundreihenfolge unnötig zu verändern.
