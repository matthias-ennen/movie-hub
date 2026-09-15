# Movie Hub – Issue-Plan

Stand: 15. September 2026

## Arbeitsprinzip

Movie Hub wird weiterhin in klar abgegrenzeten Arbeitspaketen entwickelt. Technisch integrierte Pakete bleiben offen, solange eine ausdrücklich geforderte manuelle Geräteabnahme fehlt. Änderungen an denselben kritischen Bereichen werden möglichst nacheinander umgesetzt, damit Diagnose und Regression nachvollziehbar bleiben.

## Bereinigter Status

Am 15.09.2026 ausdrücklich abgenommen und geschlossen:

- #134 – Android-WebView gegen schwarzen Bildschirm beim App-Start absichern
- #150 – TMDB-Bewertungsreihe aus synchronisierten Ratings erzeugen
- #166 – Hero-first Rendering und progressive Posterreihen
- #170 – Movie Hub als eigener Anbieter-Katalog
- #171 – profilgebundene Heroes und Posterreihen dynamisch kuratieren
- #185 – optionalen Firestore-IAM-Backfill sicher aktivieren
- #196 – Datenbestand unter Über Movie Hub anzeigen
- #202 – getrennte Launcher-Grafiken für Android und Fire TV

### Abschlussnachweis #185

Deploy-Firebase Run #141 (`35006831757`) bestätigt:

- Authentifizierung weiterhin über Workload Identity Federation;
- Service Account `github-movie-hub-deploy@movie-hub-62459.iam.gserviceaccount.com`;
- Schritt `Enrich personal Movie-Hub provider metadata` erfolgreich;
- Backfill-Ausgabe: `scanned 44, selected 0, updated 0, failed 0`;
- kein `PERMISSION_DENIED`;
- Hosting- und Firestore-Rules-Deployment anschließend erfolgreich.

## Aktuelle Priorisierung

### 1. #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität optimieren

**Nächstes großes Entwicklungs-Arbeitspaket und höchste technische Priorität.**

Gründe:

- bekannte Fire-TV-Abstürze beim Wechsel zwischen Home, Filme, Serien und Meine Inhalte;
- blockiert die endgültige Fire-TV-Abnahme von #178;
- #195 greift später in dieselbe D-Pad-/Scroll-/Posterlogik ein und soll deshalb erst danach folgen.

Schwerpunkte:

- posterweise Firestore-Fallback-Reads entfernen;
- Movie-Hub-Präsenz zentralisieren;
- D-Pad-Repeat und Scrollbewegungen kontrollieren;
- Hero-Preloading beruhigen;
- Fire-TV-Speicher/Renderer mit Logcat und Messwerten diagnostizieren;
- horizontale Begrenzung nur bei nachgewiesenem Bedarf.

### 2. #178 – Serien-Staffeln und Folgen endgültig abschließen

Die Staffel-/Folgendaten und Folgenliste sind grundsätzlich integriert. Die zuletzt festgelegte Produktentscheidung gilt:

- Folgen können in der Liste per D-Pad/Scroll durchlaufen werden;
- eine Folge ist nicht anklickbar/öffnbar;
- die Serien-Detailseite verändert sich beim Navigieren durch Folgen nicht;
- die Serienbeschreibung bleibt unverändert.

Nach erfolgreicher #191-Stabilisierung wird dieses Verhalten auf Smartphone, Tablet und Fire TV gezielt geprüft und #178 abgeschlossen.

### 3. #114 – Großen Suchindex fachlich und performant abschließen

Die wesentliche Architektur ist bereits umgesetzt: separater Suchindex, Lazy-Details, großer Datenbestand und rollierende Detailaktualisierung. Es folgt nur noch die abschließende Bestands-/Performanceprüfung gegen die Abnahmekriterien.

### 4. #117 – Dependency-Audit und Security-Hygiene

- aktuellen npm-Audit-Stand neu ermitteln;
- Critical/High-Funde bewerten und soweit möglich beseitigen;
- keine blinden Breaking-Updates;
- Web-, Firebase- und Android-Regression vollständig prüfen.

### 5. #205 – Persönliche Links, SMB-Pfade und Notizen in Firestore verschlüsseln

Festgelegte pragmatische Verschlüsselung mit appseitigem Schlüssel:

- `sharedMedia.entries.url` verschlüsseln;
- `sharedMedia.entries.label` verschlüsseln;
- persönliche `note` verschlüsseln;
- AES-256-GCM, zufälliger IV/Nonce und `cryptoVersion`;
- bestehende Klartextdaten verlustfrei migrieren;
- möglichst native Android-/Fire-TV-Kryptobrücke statt Schlüssel im öffentlichen Web-Bundle;
- keine E2E-, Gerätefreigabe- oder Recovery-Key-Architektur.

### 6. #195 – Posterreihen auf 50 Titel und bedingt zyklische D-Pad-Navigation

Erst nach #191 umsetzen, weil beide Pakete dieselbe zentrale D-Pad-, Scroll- und Posterlogik berühren.

### Danach

- #176 – profilbezogenes Sichtbarkeitskonzept
- #190 – optionale automatische Hero-Trailer
- #4 – Live-TV-/waipu-/EPG-Ausbau
- #118 – „Benachrichtigen, wenn inklusive“
- #7 – persönliche Empfehlungen / Top 100 / Automatisierung
- #129 – Deutsch/Englisch-Umschaltung
- #112 – Compliance als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen

- #8 – Ideen-Sammelstelle

## Abhängigkeitskette

`#191 → #178 → #114 → #117 → #205 → #195`

## Leitentscheidung

Aktuell werden Stabilität, Datenkonsistenz und Sicherheit vor neuen Komfortfunktionen priorisiert. Insbesondere wird keine zusätzliche komplexe Fire-TV-Navigation eingeführt, solange #191 nicht erfolgreich auf beiden vorhandenen Fire-TV-Geräten abgenommen wurde.
