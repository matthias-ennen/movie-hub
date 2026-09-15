# Movie Hub – Issue-Plan

Stand: 15. September 2026

## Arbeitsprinzip

Movie Hub wird weiterhin in klar abgegrenzten Arbeitspaketen entwickelt. Technisch integrierte Pakete bleiben offen, solange eine ausdrücklich geforderte manuelle Geräteabnahme fehlt. Neue Funktionspakete sollen nicht gleichzeitig auf dieselben kritischen Bereiche zugreifen, wenn dadurch Diagnose und Regression unnötig erschwert werden.

## Kern-Issues

- #5 – Phase 0: Firebase-Fundament, Security, Hosting und Web-Grundgerüst – abgeschlossen
- #1 – Phase 1: TV-optimierte Streaming-Oberfläche – weitgehend abgeschlossen
- #2 – Phase 2: TMDB-Filmdaten und persönliches Filmgedächtnis – weitgehend abgeschlossen
- #3 – Phase 3: Fire-TV-APK und native App-Brücke – abgeschlossen
- #6 – Phase 4: Deep Links und Provider-Auswahl auf Fire TV – abgeschlossen
- #4 – Phase 5: Streaming-Verfügbarkeit und waipu.tv-Live-Badges – teilweise umgesetzt, Live-TV/waipu bleibt später offen
- #7 – Phase 6: Persönliche Empfehlungen, Top 100 und Automatisierung – spätere Ausbaustufe

## Aktuelle Priorisierung

### 0. Offene Abnahme- und Aufräumpunkte bereinigen

Keine neuen Funktionen beginnen, bevor geklärt ist, welche technisch bereits integrierten Alt-Issues nur noch formal offen sind.

Zu prüfen bzw. gegebenenfalls anschließend zu schließen:

- #134 – Android-WebView gegen schwarzen Bildschirm beim App-Start absichern; technisch umgesetzt, nur manuelle Kaltstart-Abnahme offen.
- #150 – TMDB-Bewertungsreihe; technischer Fix integriert, nur erneute TMDB-Synchronisierung und Sichtprüfung offen.
- #166 – Hero-first Rendering / progressive Posterreihen; technisch umgesetzt, manuelle Geräteabnahme offen.
- #170 – Movie Hub als eigener Anbieter-Katalog; technisch integriert, manuelle/fachliche Abnahme offen.
- #171 – profilgebundene Kuratierung; technisch gemeinsam mit #170 integriert, manuelle/fachliche Abnahme offen.

#196 und #202 sind am 15.09.2026 ausdrücklich abgenommen und geschlossen.

### 1. #185 – Optionalen Firestore-IAM-Backfill sicher aktivieren

Kleines Betriebs-/Security-Paket vor den nächsten Datenmigrationen:

- minimal erforderliche Firestore-IAM-Rechte für das Deployment-Dienstkonto festlegen;
- keine Owner-/Editor-/pauschale Admin-Rolle;
- Workload Identity Federation beibehalten;
- Backfill ohne `PERMISSION_DENIED` prüfen.

Der Schritt ist funktional nicht zwingend, schafft aber einen sauberen vertrauenswürdigen Wartungspfad für spätere Migrationen und Backfills.

### 2. #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität optimieren

**Nächstes großes Entwicklungs-Arbeitspaket und höchste technische Priorität.**

Gründe:

- bekannte Fire-TV-Abstürze beim Wechsel zwischen Home, Filme, Serien und Meine Inhalte;
- blockiert die endgültige Fire-TV-Abnahme von #178;
- #195 greift später in dieselbe D-Pad-/Scroll-/Posterlogik ein und soll deshalb ausdrücklich erst danach folgen;
- stabile Laufzeitbasis ist wichtiger als weitere sichtbare Features.

Schwerpunkte:

- posterweise Firestore-Fallback-Reads entfernen;
- Movie-Hub-Präsenz zentralisieren;
- D-Pad-Repeat und Scrollbewegungen kontrollieren;
- Hero-Preloading beruhigen;
- Fire-TV-Speicher/Renderer mit Logcat und Messwerten diagnostizieren;
- horizontale Begrenzung nur bei nachgewiesenem Bedarf.

### 3. #178 – Serien-Staffeln und Folgen endgültig abschließen

Die Staffel-/Folgendaten und Folgenliste sind technisch bereits integriert. Die zuletzt festgelegte Produktentscheidung gilt:

- Folgen können in der Liste per D-Pad/Scroll durchlaufen werden;
- eine Folge ist **nicht anklickbar/öffnbar**;
- die Serien-Detailseite verändert sich beim Navigieren durch Folgen nicht;
- insbesondere bleibt die Serienbeschreibung unverändert.

Nach erfolgreicher #191-Fire-TV-Stabilisierung wird #178 auf Smartphone, Tablet und Fire TV nochmals gezielt geprüft und danach geschlossen.

### 4. #114 – Großen Suchindex fachlich und performant abschließen

Die wesentliche Architektur ist bereits umgesetzt: separater Suchindex, Lazy-Details, großer Datenbestand und rollierende Detailaktualisierung. Nach #191 soll eine abschließende Bestands-/Performanceprüfung erfolgen und #114 anschließend geschlossen werden, sofern die Abnahmekriterien erfüllt sind.

Keine erneute grundlegende Sucharchitektur planen, solange die aktuelle Lösung die Zielgröße zuverlässig trägt.

### 5. #117 – Dependency-Audit und Security-Hygiene

Nach stabiler Fire-TV-Baseline:

- aktuelle npm-Audit-Funde neu ermitteln;
- Critical/High-Funde technisch bewerten und soweit möglich beseitigen;
- keine blinden Breaking-Updates;
- Web-, Firebase- und Android-Regression vollständig prüfen.

Bewusst erst nach #191, damit Dependency-Updates die Diagnose des bestehenden Fire-TV-Problems nicht verfälschen.

### 6. #205 – Persönliche Links, SMB-Pfade und Notizen in Firestore verschlüsseln

Festgelegte pragmatische Verschlüsselung mit appseitigem Schlüssel:

- `sharedMedia.entries.url` verschlüsseln;
- `sharedMedia.entries.label` verschlüsseln;
- persönliche `note` verschlüsseln;
- AES-256-GCM, zufälliger IV/Nonce und `cryptoVersion`;
- bestehende Klartextdaten verlustfrei migrieren;
- möglichst native Android-/Fire-TV-Kryptobrücke statt Schlüssel im öffentlichen Web-Bundle;
- keine E2E-, Gerätefreigabe- oder Recovery-Key-Architektur.

Das Paket folgt bewusst auf die Fire-TV-/Shared-Media-Stabilisierung aus #191, damit Datenzugriff und Migration nur einmal auf einer stabilen Architektur erweitert werden.

### 7. #195 – Posterreihen auf 50 Titel und bedingt zyklische D-Pad-Navigation

Erst nach #191 umsetzen, weil beide Pakete dieselbe zentrale D-Pad-, Scroll- und Posterlogik berühren.

- reguläre Reihen maximal 50 Titel;
- rechter Rand kann die Schleife freischalten;
- linker Rand bleibt beim ersten Betreten geschlossen;
- direkte Sprünge ohne lange Smooth-Scroll-Fahrt über die gesamte Reihe.

### 8. #176 – Profilbezogenes Sichtbarkeitskonzept

Danach als normales UX-Arbeitspaket. Vor Implementierung müssen die bereits im Issue festgehaltenen Produktentscheidungen zur Modulmatrix gemeinsam getroffen werden. Keine Schalterflut und keine redundante Steuerung bereits vorhandener Kategorie-/Provider-/Smart-Reihen-Einstellungen.

### 9. #190 – Optionale automatische Hero-Trailer

Spätere Komfortfunktion. Erst nach stabiler Fire-TV-Performance und Navigation. Vor Umsetzung sind insbesondere Verzögerung, Ton, Gültigkeitsbereich der Einstellung und Player-Verhalten festzulegen.

### 10. #4 – Phase 5 gezielt vervollständigen

Die allgemeine Streaming-Verfügbarkeit ist inzwischen weitgehend Teil des Katalogsystems. #4 soll deshalb später auf die tatsächlich noch offenen Punkte konzentriert werden:

- lineares Fernsehen / waipu.tv;
- Live-/EPG-Status und Sendezeiten;
- Attribution und belastbare Aktualisierung.

Keine bereits vorhandene TMDB-/Providerlogik neu bauen.

### 11. #118 – „Benachrichtigen, wenn inklusive“

Erst sinnvoll, wenn Provider-/Verfügbarkeitsaktualisierung und großer Suchindex stabil abgeschlossen sind. Danach Zustandswechsel `rent/buy/nicht verfügbar → flatrate/free/ads` überwachen und benachrichtigen.

### 12. #7 – Persönliche Empfehlungen / Top 100 / Automatisierung

Auf die dann stabilen persönlichen Signale, Providerdaten und Such-/Katalogdaten aufbauen. KI nur für Empfehlung/Einordnung, nie für objektive Verfügbarkeitsfakten.

### 13. #129 – Deutsch/Englisch-Umschaltung

Spätere Internationalisierung, wenn die deutschsprachige Funktionsoberfläche weitgehend stabil ist. Dadurch müssen neue Oberflächentexte nicht während einer stark wechselnden Entwicklungsphase doppelt gepflegt werden.

### 14. #112 – Compliance als Release-Gate

#112 bleibt ein Querschnittsthema und muss **vor öffentlicher Verteilung** vollständig abgearbeitet werden. Einzelne Punkte wie Dependency-Hygiene, Datenminimierung und Security werden bereits vorher in den jeweiligen technischen Paketen bearbeitet.

## Dauerhaft offen

- #8 – Ideen-Sammelstelle: bleibt als Eingang für neue Wünsche offen.

## Abhängigkeitskette

`#185 → #191 → #178 → #114 → #117 → #205 → #195`

Danach folgen überwiegend voneinander unabhängigere Produktpakete wie `#176`, `#190`, `#4`, `#118`, `#7` und `#129`.

## Leitentscheidung

Aktuell werden **Stabilität, Datenkonsistenz und Sicherheit vor neuen Komfortfunktionen** priorisiert. Insbesondere wird keine zusätzliche komplexe Fire-TV-Navigation eingeführt, solange #191 nicht erfolgreich auf beiden vorhandenen Fire-TV-Geräten abgenommen wurde.
