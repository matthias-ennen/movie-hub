# Movie Hub – Issue-Plan

Stand: 16. September 2026

## Arbeitsprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. Vor Beginn eines Pakets wird dessen Umfang noch einmal kurz fachlich und technisch überprüft; dabei können weitere sinnvolle Punkte ergänzt werden. Überschneidende Themen werden bewusst zusammengeführt, damit keine parallelen Migrations- oder Einstellungslogiken entstehen.

## Bereinigter aktueller Status

Zuletzt abgeschlossen bzw. abgenommen:

- #114 – großer Suchindex
- #178 – Staffeln/Folgen/Episodendetail
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – Posterreihen-/D-Pad-Paket; spätere variable Reihenlängen werden in #222 weitergeführt
- #207 – robuste persönliche TMDB-Synchronisierung

Die Fire-TV-App ist nach Phase 2 von #191 deutlich stabiler. Virtualisierung und Poster-Prefetching gelten damit als abgenommen.

## Zusammenführungen

- **#176 → #222:** Profilbezogene Sichtbarkeit von Inhaltsbereichen wird gemeinsam mit Einstellungen und Profilsteuerung umgesetzt; #176 ist als separates Paket geschlossen.
- **#220 → #205:** SMB-Normalisierung, Dublettenbereinigung und Credential-Zuordnung werden gemeinsam mit der Verschlüsselungs-/Migrationsarchitektur umgesetzt; #220 ist als separates Paket geschlossen.

## Aktuelle Priorisierung

### 1. #218 – Layout-Sammelissue: UI-Konsistenz und visuelle Korrekturen

- MH-Badge überall konsistent wie auf normalen Posterkacheln darstellen
- vertikalen Abstand zwischen Anbieterbadges und Titel/Jahr reduzieren
- Fokusrahmen der Staffel-Schaltflächen auf Serien-Detailseiten korrigieren
- vor Umsetzung weitere kleine Layoutauffälligkeiten sammeln, sofern sie fachlich in dieses Paket passen

### 2. #222 – Einstellungen, Profilsteuerung und Sichtbarkeit aufräumen und erweitern

- Einstellungsseite logisch neu gruppieren
- Posterreihen pro Profil auf 30/40/50/60/70 einstellbar machen, Standard 50
- Hero-Anzahl pro Profil auf 3/4/5/6/7 einstellbar machen, Standard 5
- alte feste 20er-/40er-Grenzen normaler Reihen ablösen
- Limits früh nach Filterung/Sortierung anwenden, nicht erst im Rendering
- profilbezogene Sichtbarkeit größerer Inhaltsbereiche integrieren
- Seiten-/Modulmatrix für Home, Filme, Serien und Meine Inhalte festlegen
- keine redundanten Einzelschalter für bereits vorhandene Detailsteuerungen
- vor Umsetzung weitere sinnvolle Profil-/Account-Einstellungen ergänzen, falls sie in denselben Scope gehören

### 3. #117 – Dependency-Audit und Security-Hygiene

- aktuellen npm-Audit-Stand neu ermitteln
- Critical-/High-Funde bewerten und kontrolliert beseitigen
- keine blinden Breaking-Updates
- verbleibende Findings dokumentieren
- Web-, Firebase- und Android-Regression vollständig prüfen

### 4. #205 – Persönliche Daten schützen und SMB-Verbindungen konsolidieren

Gemeinsames Daten-/SMB-Sicherheits-Arbeitspaket:

- Host + Share als case-insensitive SMB-Verbindungsidentität normalisieren
- Share-Schreibvarianten derselben realen Freigabe zuordnen
- vollständige Unterordner-/Dateipfade unverändert erhalten
- vorhandene Netzlaufwerk-Dubletten zusammenführen
- pro realer Freigabe nur einen lokalen Credential-Satz verwenden
- danach `sharedMedia.entries.url`, `sharedMedia.entries.label` und persönliche `note` verschlüsseln
- AES-256-GCM mit zufälligem IV/Nonce und `cryptoVersion`
- bestehende Klartextdaten verlustfrei und idempotent migrieren
- native Kryptobrücke gegenüber öffentlichem Web-Bundle bevorzugen
- keine E2E-, Gerätefreigabe- oder Recovery-Key-Architektur

Interne Reihenfolge: **SMB-Identität/Dubletten zuerst, Verschlüsselung/Migration danach**.

## Danach

Nach Abschluss dieser vier Pakete wird die Reihenfolge neu bewertet. Bereits vorgemerkte spätere Themen:

- #190 – optionale automatische Hero-Trailer
- #4 – Live-TV-/waipu-/EPG-Ausbau
- #118 – „Benachrichtigen, wenn inklusive“
- #7 – persönliche Empfehlungen / Top 100 / Automatisierung
- #129 – Deutsch/Englisch-Umschaltung
- #112 – Compliance als Release-Gate

## Dauerhaft offen

- #8 – Ideen-Sammelstelle

## Abhängigkeitskette

`#218 → #222 → #117 → #205`

## Leitentscheidung

Der aktuelle Arbeitsplan ist bewusst kompakt: erst sichtbare UI-Korrekturen, dann die komplette Settings-/Profilarchitektur, danach Dependency-/Security-Hygiene und schließlich das zusammengeführte Daten-/SMB-Sicherheits- und Migrationspaket. Jedes Paket wird vor Start noch einmal konkretisiert und kann dabei sinnvoll erweitert werden.
