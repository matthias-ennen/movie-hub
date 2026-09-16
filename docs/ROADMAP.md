# Movie Hub – Roadmap

Stand: 16. September 2026

## Leitprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn technische Prüfpunkte und erforderliche manuelle Geräteabnahmen erfüllt sind.

Für die nächste Entwicklungsstrecke gilt:

1. **Kleine sichtbare UI-Themen zuerst sauber abschließen.**
2. **Einstellungen, Profilsteuerung und Sichtbarkeit gemeinsam strukturieren.**
3. **Security-/Dependency-Hygiene vor größeren Datenmigrationen.**
4. **SMB-Identität, Migration und Verschlüsselung als zusammenhängendes Datenpaket behandeln.**
5. Vor Beginn jedes größeren Pakets wird dessen Scope noch einmal fachlich und technisch überprüft; zusätzliche Punkte dürfen dabei ergänzt werden.

## Aktuell abgeschlossener Stand

Zu den zuletzt abgeschlossenen bzw. abgenommenen Paketen gehören insbesondere:

- #114 – großer Suchindex
- #178 – Staffeln, Folgen und Episodendetail
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – zentrale Begrenzung normaler Posterreihen / D-Pad-Entscheidung
- #207 – robuste persönliche TMDB-Synchronisierung

Die Fire-TV-Stabilität wurde durch vertikale Virtualisierung, gezieltes Poster-Prefetching und reduzierte Posterlast deutlich verbessert und real getestet.

Das bisherige starre 20er-/40er-Verhalten einzelner Reihen wird nicht mehr in #195 weiterentwickelt, sondern in #222 als profilbezogene Einstellung neu gelöst.

## Zusammengeführte Arbeitspakete

Zur Vermeidung von Doppelarbeit wurden zwei Überschneidungen bereinigt:

- **#176 wurde vollständig in #222 übernommen.** Einstellungen, Profilsteuerung und Sichtbarkeit von Inhaltsbereichen werden gemeinsam umgesetzt.
- **#220 wurde vollständig in #205 übernommen.** SMB-Normalisierung/Dubletten, lokale Credential-Zuordnung, Migration und Verschlüsselung persönlicher Pfade werden gemeinsam geplant und umgesetzt.

#176 und #220 sind deshalb als separate Arbeitspakete geschlossen.

## Aktuelle Entwicklungsreihenfolge

### 1. #218 – Layout-Sammelissue: UI-Konsistenz und visuelle Korrekturen

Kleine sichtbare Inkonsistenzen bündeln und bereinigen:

- Movie-Hub-Badge überall wie auf regulären Posterkacheln darstellen
- Abstand Anbieterbadges ↔ Titel/Jahr kompakter machen
- Fokusrahmen der Staffel-Schaltflächen auf Serien-Detailseiten sauber ausrichten und vollständig sichtbar machen

Das Paket wird vor Umsetzung noch einmal gegen die betroffenen Ansichten geprüft und darf um weitere kleine Layoutpunkte ergänzt werden.

### 2. #222 – Einstellungen, Profilsteuerung und Sichtbarkeit aufräumen und erweitern

Gemeinsames Profil-/Settings-Arbeitspaket:

- Posterreihen: **30 / 40 / 50 / 60 / 70**, Standard 50
- Heroes: **3 / 4 / 5 / 6 / 7**, Standard 5
- Hauptbenutzer und Unterbenutzer können unterschiedliche Werte besitzen
- alte feste 20er-/40er-Grenzen normaler Reihen entfallen zugunsten der Profil-Einstellung
- Limits greifen früh nach Filterung/Sortierung, nicht erst beim Rendern
- Einstellungsseite logisch neu gruppieren
- profilbezogene Sichtbarkeit größerer Inhaltsmodule integrieren
- keine redundanten Einzelschalter für bereits vorhandene Detailsteuerungen
- ausgeblendete Bereiche verursachen möglichst keine unnötige Aufbereitung

Vor Umsetzung wird eine Seiten-/Modulmatrix für Home, Filme, Serien und Meine Inhalte festgelegt und geprüft, welche weiteren sinnvollen Einstellungen in dasselbe Paket gehören.

### 3. #117 – Dependency-Audit: bekannte npm-Sicherheitswarnungen bereinigen

- aktuellen `npm audit`-Stand ermitteln
- Critical-/High-Funde fachlich bewerten und kontrolliert beheben
- keine blinden Breaking-Updates
- verbleibende Findings dokumentieren
- vollständige Web-/Firebase-/Android-Regression

### 4. #205 – Persönliche Daten schützen und SMB-Verbindungen konsolidieren

Gemeinsames Daten-/SMB-Sicherheits-Arbeitspaket:

- Host + Share als case-insensitive SMB-Verbindungsidentität normalisieren
- `Share`, `share` und `SHARE` derselben realen Freigabe zuordnen
- vollständige Unterordner-/Dateipfade unverändert erhalten
- bestehende Netzlaufwerk-Dubletten zusammenführen
- nur einen lokalen Credential-Satz je realer Freigabe verwenden
- anschließend sensible persönliche Felder (`url`, `label`, `note`) per AES-256-GCM verschlüsseln
- `cryptoVersion` und verlustfreie idempotente Migration vorsehen
- native Kryptobrücke gegenüber öffentlichem Web-Bundle bevorzugen
- keine E2E-, Gerätefreigabe- oder Recovery-Key-Architektur

Interne Reihenfolge des Pakets: zuerst SMB-Identität und Dubletten stabilisieren, danach Verschlüsselungsformat und Klartextmigration durchführen.

## Danach geplante Produktpakete

Nach diesen vier Paketen wird die weitere Reihenfolge neu bewertet. Bereits vorhandene spätere Kandidaten sind unter anderem:

- #190 – optionale automatische Trailer im Hero
- #4 – Live-TV-/waipu-/EPG-Ausbau
- #118 – Benachrichtigen, wenn ein Titel inklusive wird
- #7 – persönliche Empfehlungen / Top 100 / Automatisierung
- #129 – Deutsch/Englisch-Umschaltung
- #112 – Compliance als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen

- #8 – Ideen-Sammelstelle

## Nächste Abhängigkeitskette

`#218 → #222 → #117 → #205`

Diese Reihenfolge gilt als aktueller Arbeitsplan. Jedes Paket wird unmittelbar vor Beginn noch einmal fachlich und technisch geschärft; dabei können zusätzliche Punkte ergänzt werden, ohne die Grundreihenfolge unnötig zu verändern.
