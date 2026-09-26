# Movie Hub – Roadmap

Stand: 26. September 2026

## Leitprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. TMDB bleibt die kanonische Quelle für öffentliche Film- und Serienmetadaten. Zusätzliche Quellen liefern Verfügbarkeiten, Senderereignisse und Wiedergabeziele. Ein Adapterfehler darf weder andere Quellen noch den letzten gültigen veröffentlichten Datenstand beschädigen.

Die nächste Entwicklungsstrecke konzentriert sich auf ein breites, modulares Quellenfundament und danach auf eine klarere Darstellung der tatsächlichen Verfügbarkeit eines Titels: im Abo enthalten, kostenlos, werbefinanziert, Rent/Buy, bald im TV oder jetzt live.

## Bereinigter abgeschlossener Stand

Zu den zuletzt abgeschlossenen beziehungsweise abgenommenen Paketen gehören insbesondere:

- #4 – öffentlicher Waipu-Live-Katalog
- #114 – großer Suchindex
- #117 – Dependency-Audit und Security-Hygiene
- #178 – Staffeln und Folgen
- #190 – automatische Hero-Trailer und nativer Trailer-/Teaser-Player
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – Posterreihen-/D-Pad-Paket
- #205 – Verschlüsselung persönlicher Daten und SMB-Konsolidierung
- #207 – robuste persönliche TMDB-Synchronisierung
- #218 – Layout/UI-Konsistenz
- #222 – Einstellungen, Profilsteuerung und Sichtbarkeit
- #225 – verlustfreie Metadaten-Anreicherung; Fire-TV-Abnahme am 26.09.2026 bestätigt
- #228 – robuster nativer Kaltstart
- #254/#255 – historische Bestandsaufnahme und Triage; Restthemen in eigene Issues überführt
- #256 – vollständige kanonische Titelmetadaten und gemeinsamer Nachtlauf
- #259 – exakter Waipu-Programmlink mit sicherer Fallbackkette
- #260 – produktiver Ausbau auf 228 Waipu-Sender; auf Smartphone, Tablet und Fire TV abgenommen
- #281/#283/#285/#289 – gemeinsame TV-/Hero-/Inhaltsseiten-Grundlage

## Aktive Hauptstrecke

### 1. #271 – Modulare Quellenplattform

Nächstes Hauptarbeitspaket.

Ziel der ersten Stufe ist ein verbindlicher, versionierter Adapter- und Veröffentlichungsvertrag auf Basis des bestehenden Waipu-Pfads. Er muss mindestens sauber trennen:

- kanonische Titelidentität: `Medientyp + TMDB-ID`
- neutrales Sender-/Verfügbarkeitsereignis
- Quelle und Provider
- mehrere getrennte Wiedergabeziele
- Zeitfenster und Live-Status
- Datenalter und Quellenzustand
- Match-Sicherheit
- Qualitäts-, Last- und Fehlergates
- letzter gültiger Stand bei Adapterfehlern

Die erste Stufe von #271 endet, sobald Waipu denselben Vertrag wie spätere Adapter nachweisbar bedienen kann und mehrere Providerziele für dasselbe Ereignis ohne Sonderlogik im App-Kern möglich sind.

DVB-I, Direktstreams und weitere Quellen bleiben spätere Teilziele von #271 und blockieren den Joyn-Pilot nicht.

### 2. #280 – Joyn-Adapter

Direkt nach der ersten tragfähigen #271-Stufe.

Joyn dient als erster Beweis, dass ein zweiter unabhängiger Adapter ohne Umbau des App-Kerns aufgenommen werden kann:

- begrenzte Senderinventur
- strukturierte und stabil nutzbare EPG-Quelle prüfen
- Programme normalisieren und mit TMDB verbinden
- identische Waipu-/Joyn-Ausstrahlungen als ein neutrales Senderereignis behandeln
- Joyn- und Waipu-Ziele getrennt erhalten
- sendergenaue Joyn-Ziele auf Smartphone, Tablet und Fire TV praktisch verifizieren
- Teilfehler und veraltete Generationen sicher isolieren

### 3. Weitere Adapter nach erfolgreichem Joyn-Pilot

Weitere Quellen werden jeweils als getrennte, kleine Adapterpakete unter #271 bewertet. Bevorzugte Reihenfolge:

1. offizielle ARD-/ZDF-/Free-TV-Quellen und zulässige Live-/Deep-Link-Ziele
2. FAST-/Free-TV-Quellen wie Pluto TV, sofern technisch und rechtlich belastbar
3. weitere Anbieter mit stabilen strukturierten Daten und verifizierbaren Zielen
4. DVB-I, sobald Zugang, Marktstatus und Nutzbarkeit belastbar geklärt sind

Keine Quelle wird allein wegen technischer Erreichbarkeit produktiv eingebunden.

## Produktziel nach dem Adapterausbau

Die vorhandene Architektur soll nicht grundsätzlich umgebaut werden. Der Schwerpunkt wird stärker auf die verständliche Verfügbarkeit eines Titels gelegt.

Movie Hub soll konsistent sichtbar machen:

- **Im Abo enthalten**
- **Kostenlos**
- **Kostenlos mit Werbung**
- **Rent**
- **Buy**
- **Bald kostenlos im TV**
- **Jetzt live**
- **Eigener Movie-Hub-Link / eigenes Video**

Mehrere Quellen dürfen dieselbe Information bestätigen oder verschiedene Wiedergabewege liefern. Der Nutzer soll schnell erkennen können, ob er einen Titel jetzt kaufen/leihen müsste oder in absehbarer Zeit ohne Einzelkauf sehen kann.

Diese Darstellungs-/Priorisierungsarbeit folgt nach den ersten zusätzlichen Adaptern, damit sie auf einem breiteren realen Datenfundament statt auf Einzelfällen optimiert wird.

## Gesondert offene Betriebs- und Restpakete

- #315 – Nachtlauf zuverlässig überwachen; Betriebszuverlässigkeit, blockiert #271 nicht
- #329 – Waipu-Restklassifizierung der technischen-only Einträge; Wartung, blockiert #271/#280 nicht
- #312 – Mitteilungszentrale; Fire-TV-Bedienung am 26.09.2026 abgenommen, Ende-zu-Ende-/Mehrgeräte-Restpunkte offen
- #118/#314 – „Wenn inklusive“ und „Wenn im TV“ sind veröffentlicht und auf Fire TV bedienbar; produktive Lauf-/Randfallprüfung und spätere Produktentscheidungen offen
- #7 – erste Top-100-Stufe veröffentlicht und am 26.09.2026 auf Fire TV abgenommen; Empfehlungen und Automatisierung später
- #328 – Trailer/Teaser-Finish: Sprachwahl und Wiedergabestabilität; späteres UI-/Player-Finish
- #327 – TMDB-Kontosynchronisation; bewusst für später zurückgestellt
- #129 – Deutsch/Englisch-Umschaltung; spätere Release-Konsolidierung

## Release 1.0 – Zielblöcke

Vor einer öffentlichen Version 1.0 sollen mindestens folgende Blöcke abgeschlossen oder ausdrücklich freigegeben sein:

1. **Quellenfundament**
   - #271 erste Plattformstufe
   - #280 Joyn-Pilot
   - mindestens weitere belastbare Quellenadapter, sodass Movie Hub nicht funktional von einem einzelnen EPG-/Verfügbarkeitsweg abhängt

2. **Verfügbarkeitsdarstellung**
   - klare Trennung von flatrate/free/ads/rent/buy/TV/live
   - konsistente Darstellung in Poster, Detailseite, TV und Benachrichtigungen
   - keine irreführende Gleichsetzung von Sender, Provider und Wiedergabeweg

3. **Betrieb**
   - #315 für Datenfrische, Wiederanlauf und unabhängige Alarmierung
   - Adapterzustand, Datenalter und letzter gültiger Stand nachvollziehbar
   - partielle Datenläufe veröffentlichen keinen schlechteren Stand

4. **Produkt-Finish**
   - offene Geräteabnahmen und Randfälle
   - #328 Trailer-/Teaser-Finish
   - #129 soweit für den öffentlichen Zielmarkt erforderlich
   - Provisorien aus #223 soweit entfernbar zurückbauen

5. **Release-Gate**
   - #112 – Recht, Datenschutz, Attribution, Marken/Logos, Lizenzen, Nutzungsbedingungen und öffentliche Verteilung

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau
- #308 – langfristige Produktvision; kein aktueller Programmierauftrag

## Aktuelle Reihenfolge

`#271 Plattformvertrag → #280 Joyn-Pilot → weitere Adapter → Verfügbarkeitsdarstellung schärfen → Betriebs-/Produkt-Finish → #112 Release-Gate → 1.0`

#315 und #329 laufen bei Bedarf parallel. #118/#314, #7, #327 und #328 sind bewusst nach hinten gestellt und blockieren den Adapterpfad nicht.
