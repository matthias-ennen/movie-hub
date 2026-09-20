# Movie Hub – Issue-Plan

Stand: 20. September 2026

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
- #4 – öffentlicher Waipu-Live-Katalog einschließlich 50-Sender-Bestand, TV-Integration und Geräteabnahme

Die Fire-TV-App wurde mit diesem Stand zuletzt am 18.09.2026 abgenommen.

## Aktuelles Arbeitspaket

### #256 – Datenfundament: vollständige kanonische Titelmetadaten vor Veröffentlichung

#4 ist vollständig abgenommen und geschlossen. #256 ist das nächste eigenständige Arbeitspaket; vor der Umsetzung erfolgt nur noch eine kurze technische Scope-Kontrolle.

- alle katalogrelevanten Titelquellen in einem kanonischen Bestand nach `Medientyp + TMDB-ID` zusammenführen;
- vollständige, geprüfte Metadaten zentral wiederverwenden und kontrolliert aktualisieren;
- TMDB-Änderungslisten als tägliche Schnellspur einsetzen;
- vollständige Titel zusätzlich im rollierenden 30-Tage-Umlauf erneut prüfen;
- #200 für reine Suchdetails wiederverwenden und keine konkurrierende zweite Logik schaffen;
- eine gemeinsame deduplizierte Prioritätswarteschlange aufbauen;
- Code-Deployment und Datenlauf trennen;
- eine vollständige Generation mit gemeinsamer Generationskennung validieren und atomar veröffentlichen;
- bei Teilfehlern den letzten gültigen Stand erhalten;
- verspätete oder ausgefallene Nachtläufe und einen zu alten Datenstand sichtbar melden;
- reine Suchindex-Titel außerhalb sichtbarer Kataloge weiterhin erst beim Öffnen vollständig laden, dabei aber einen geschlossenen Lade-/Fehlerzustand verwenden.

## Triage des Referenzstands APK 0.1.473

Die vollständige Sammlung steht in #254. Die strukturierte
[Bestandsaufnahme ab APK 0.1.473](APP_REVIEW_0.1.473.md) und das
Fortsetzungs-/Triage-Issue #255 bündeln sie in sieben vorläufige beziehungsweise bereits ausgearbeitete Pakete:

1. gemeinsame Inhaltsseiten-Grundlage und Fokus;
2. TV als zeitgesteuerte Videothek;
3. #256 – katalogübergreifendes Datenfundament und kontrollierter Nachtlauf;
4. Trailer und Teaser;
5. TV-Beobachtungen und Erinnerungen;
6. #259 – direkter Start der laufenden Waipu-Sendung;
7. #260 – vollständiger, kontrollierter Senderausbau über 50 hinaus.

Für **Home, Filme, Serien, TV und Meine Inhalte** gilt verbindlich eine
gemeinsame technische Inhaltsseiten-Grundlage. Vor jedem daraus entstehenden
Umsetzungspaket werden die zugehörigen offenen Produktfragen Matthias erneut
einzeln vorgelegt. Die Paketvorschläge ändern die bestätigte Hauptpriorisierung
nicht automatisch; vor #118 wird gemeinsam entschieden, welche Korrekturen
zwingend davor liegen.

## Aktuelle Priorisierung

### 1. #256 – Datenfundament und Nachtlauf

- nächstes Arbeitspaket nach #4
- gemeinsame kanonische Titelmetadaten für alle katalogrelevanten Quellen
- TMDB-Änderungslisten plus 30-Tage-Sicherheitsumlauf
- deduplizierte Warteschlange, atomare Veröffentlichung und Laufüberwachung
- Trennung von Code-Deployment und Datenpflege

### 2. #259 – Waipu-Live-Deep-Link

- aus konkreter Waipu-Ausstrahlung einen verifizierten `epgdetails`-Link bilden
- mit dem bestehenden 50-Sender-Bestand auf Android und Fire TV testen
- Abnahme nur bei tatsächlichem Start des richtigen laufenden Senders
- allgemeiner Waipu-Live-Einstieg als sicherer Fallback
- keine Aufnahmen, Waiputhek, Zugangsdaten oder DRM in diesem Paket

### 3. Gemeinsame TV-Grundlage vor großer Senderausweitung

- TV als begrenzte zeitgesteuerte Videothek statt vollständiger 14-Tage-Listen auf dem Gerät
- nur den benötigten Zeit-/Sichtbereich laden und rendern
- Fokus, Scrollposition und Fire-TV-Speicher bei großen Senderzahlen stabil halten

### 4. #260 – Waipu-Senderbestand über 50 hinaus ausbauen

- offizielle Liste, technischen Stamm und tatsächlich lineare Movie-Hub-Sender abgleichen
- 337 dokumentierte offizielle Listeneinträge und zuletzt 398 technische Einträge klassifizieren
- Catch-up, VOD, Dubletten, regionale Varianten und fehlendes EPG ausweisen
- Ausbau mit Checkpoints, Budgets und Stabilitätsgates in kontrollierten Wellen
- neue Sender standardmäßig aktivieren und bestehende persönliche Einstellungen erhalten
- Compliance-Gate #112 vor öffentlicher Verteilung beachten

### 5. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

- einfache Beobachten-Aktion direkt am Titel
- rent/buy-only bzw. aktuell nicht inklusive Titel beobachten
- Zustandswechsel zu `flatrate`, `free` oder `ads` erkennen
- Benachrichtigungen nur bei echten Änderungen
- Beobachtung einfach wieder entfernen

### 6. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

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

`#4 abgeschlossen → #256 Datenfundament → #259 Deep-Link-Verifikation → gemeinsame TV-Grundlage → #260 Senderausbau in Wellen → #118 → #7`

#4 ist vollständig abgenommen und geschlossen. Der 50-Sender-Bestand bleibt der gültige Ausgangsstand. #259 verifiziert den direkten Live-Absprung zunächst auf diesem Bestand. Die Ausweitung über 50 Sender ist mit #260 als eigene, ausdrücklich freizugebende und stufenweise Aufgabe dokumentiert.

## Leitentscheidung

Der Waipu-Live-Ausbau verwendet die öffentlich und ohne Anmeldung erreichbaren
Waipu-Sender-, Grid- und Programmdetail-Endpunkte. Ein persönlicher Kontozugang
ist für den Basis-Katalog nicht erforderlich. Der Import läuft zentral,
budgetiert und gecacht; die App erhält ausschließlich fertige, bereinigte
Katalogartefakte. Die Schnittstelle ist nicht öffentlich dokumentiert, daher
bleiben Lastgrenzen, Langzeitstabilität und Rechteprüfung verbindliche Gates.
