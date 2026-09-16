# Movie Hub – Issue-Plan

Stand: 16. September 2026

## Arbeitsprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. Vor Beginn eines Pakets wird dessen Umfang jeweils noch einmal kurz fachlich und technisch überprüft; dabei können weitere sinnvolle Punkte ergänzt werden. Änderungen an denselben kritischen Bereichen werden möglichst nacheinander umgesetzt, damit Diagnose und Regression nachvollziehbar bleiben.

## Bereinigter aktueller Status

Zuletzt abgeschlossen bzw. abgenommen:

- #114 – großer Suchindex
- #178 – Staffeln/Folgen/Episodendetail
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – Posterreihen-/D-Pad-Paket; spätere variable Reihenlängen werden in #222 weitergeführt
- #207 – robuste persönliche TMDB-Synchronisierung

Die Fire-TV-App ist nach Phase 2 von #191 deutlich stabiler. Die neue Virtualisierung und das Poster-Prefetching gelten damit als abgenommen.

## Aktuelle Priorisierung

### 1. #218 – Layout-Sammelissue: UI-Konsistenz und visuelle Korrekturen

- MH-Badge überall konsistent wie auf normalen Posterkacheln darstellen
- vertikalen Abstand zwischen Anbieterbadges und Titel/Jahr reduzieren
- Fokusrahmen der Staffel-Schaltflächen auf Serien-Detailseiten korrigieren
- vor Umsetzung weitere kleine Layoutauffälligkeiten sammeln, sofern sie fachlich in dieses Paket passen

### 2. #222 – Einstellungen aufräumen und erweitern

- Einstellungsseite logisch neu gruppieren
- Posterreihen pro Profil auf 30/40/50/60/70 einstellbar machen, Standard 50
- Hero-Anzahl pro Profil auf 3/4/5/6/7 einstellbar machen, Standard 5
- alte feste 20er-/40er-Grenzen normaler Reihen ablösen
- Limits früh nach Filterung/Sortierung anwenden, nicht erst im Rendering
- vor Umsetzung prüfen, welche weiteren sinnvollen Profil-/Account-Einstellungen ergänzt werden sollen

### 3. #117 – Dependency-Audit und Security-Hygiene

- aktuellen npm-Audit-Stand neu ermitteln
- Critical-/High-Funde bewerten und kontrolliert beseitigen
- keine blinden Breaking-Updates
- verbleibende Findings dokumentieren
- Web-, Firebase- und Android-Regression vollständig prüfen

### 4. #205 – Persönliche Links, SMB-Pfade und Notizen in Firestore verschlüsseln

- `sharedMedia.entries.url` verschlüsseln
- `sharedMedia.entries.label` verschlüsseln
- persönliche `note` verschlüsseln
- AES-256-GCM mit zufälligem IV/Nonce und `cryptoVersion`
- bestehende Klartextdaten verlustfrei migrieren
- native Kryptobrücke gegenüber öffentlichem Web-Bundle bevorzugen
- keine E2E-, Gerätefreigabe- oder Recovery-Key-Architektur

### 5. #220 – SMB-Netzlaufwerke normalisieren und Dubletten zusammenführen

- Host und Share normalisiert als Verbindungsidentität behandeln
- `Share`, `share` und `SHARE` derselben Freigabe zuordnen
- vollständigen Unterordner-/Dateipfad unverändert lassen
- bestehende doppelte Netzlaufwerke zusammenführen
- nur einen lokalen Credential-Satz je realer Freigabe verwenden

## Danach

Nach Abschluss dieser fünf Pakete wird die Reihenfolge neu bewertet. Bereits vorgemerkte spätere Themen:

- #176 – profilbezogenes Sichtbarkeitskonzept
- #190 – optionale automatische Hero-Trailer
- #4 – Live-TV-/waipu-/EPG-Ausbau
- #118 – „Benachrichtigen, wenn inklusive“
- #7 – persönliche Empfehlungen / Top 100 / Automatisierung
- #129 – Deutsch/Englisch-Umschaltung
- #112 – Compliance als Release-Gate

## Dauerhaft offen

- #8 – Ideen-Sammelstelle

## Abhängigkeitskette

`#218 → #222 → #117 → #205 → #220`

## Leitentscheidung

Der aktuelle Arbeitsplan ist damit bewusst übersichtlich gehalten: erst sichtbare UI-Korrekturen, dann die Einstellungsarchitektur, danach Security-Hygiene und anschließend die beiden größeren Daten-/SMB-Pakete. Jedes Paket wird vor Start noch einmal konkretisiert und kann dabei sinnvoll erweitert werden.
