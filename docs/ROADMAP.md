# Movie Hub – Roadmap

Stand: 3. Oktober 2026

## Leitprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. TMDB bleibt die kanonische Quelle für öffentliche Film- und Serienmetadaten. Zusätzliche Quellen liefern Verfügbarkeiten, Senderereignisse und Wiedergabeziele. Ein Adapterfehler darf weder andere Quellen noch den letzten gültigen veröffentlichten Datenstand beschädigen.

Nach Abschluss der Fundamenthärtung und der Nachtlauf-Betriebsabsicherung beginnt als nächstes großes Produktpaket die Konsolidierung der Mitteilungen und Benachrichtigungen. Danach wird die modulare Quellenplattform mit weiteren belastbaren Quellen fortgeführt.

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
- #280 – Joyn-Adapter; zweiter unabhängiger Live-TV-/EPG-Adapter mit gemeinsamem Waipu/Joyn-Vertrag abgeschlossen
- #281/#283/#285/#289 – gemeinsame TV-/Hero-/Inhaltsseiten-Grundlage
- #315 – Nachtlauf-Überwachung, Datenfrische, unabhängiger Alarm und dauerhafte Cloud-Checkpoints; am 03.10.2026 abgeschlossen
- #346 – Fundamenthärtung und Performance; technische Phasen, Dokumentation und reale Smartphone-/Fire-TV-Abnahme am 03.10.2026 abgeschlossen

## Aktive Hauptstrecke

### 1. #314 – Mitteilungen und Benachrichtigungen konsolidieren

#314 ist ab 03.10.2026 das **aktuelle große Arbeitspaket**. Es bündelt die noch offenen Produktentscheidungen und Randfälle der bereits vorhandenen Mitteilungsbasis, ohne die bestehende App-Architektur unnötig umzubauen.

Ausgangsstand:
- #312 stellt Glocke, Posteingang und globale Admin-Mitteilungen bereit; Smartphone-Grundstrecke und Fire-TV-D-Pad-Bedienung sind bestätigt;
- #118 stellt „Wenn inklusive“ bereit;
- die Detailseite bietet zusätzlich „Wenn im TV“ als getrennten persönlichen Auslöser;
- persönliche Meldungen bleiben zunächst innerhalb von Movie Hub; Betriebssystem-Push und E-Mail gehören nicht automatisch zum aktuellen Umfang;
- Deploy #939 hat als konkreten Betriebsbefund gezeigt, dass der vertrauenswürdige serverseitige TV-Prüflauf beim transaktionalen Schreiben von `titleAlertState`/Meldungen mit `PERMISSION_DENIED` scheitern kann. Dieser IAM-/Serverpfad ist vor fachlicher Abnahme gezielt zu klären.

Der erste Block von #314 ist bewusst **Bestandsaufnahme und Produktklärung vor neuen Codeänderungen**:
1. vorhandene Ende-zu-Ende-Strecke aus #312 vollständig gegen Gültigkeit, Rücknahme, Lesestatus und Mehrgeräteverhalten prüfen;
2. serverseitigen Prüflauf für „Wenn inklusive“/„Wenn im TV“ zuverlässig machen und den IAM-Befund aus #939 schließen;
3. Meldeanlässe, Darstellung, Ziel beim Öffnen, Häufigkeit, Deduplizierung, Gültigkeit und Profilregeln gemeinsam festlegen;
4. erst danach einzelne Umsetzungen als kleine, abnehmbare Folgepakete schneiden.

#312 und #118 bleiben bis zu ihrer fachlichen beziehungsweise Ende-zu-Ende-Abnahme als verknüpfte Teilpakete offen. Sie werden nicht künstlich geschlossen, nur weil #314 nun die gemeinsame Klammer bildet.

### 2. #271 – Modulare Quellenplattform danach fortführen

#271 bleibt das übergeordnete Quellenpaket. Die erste praktische Mehrquellenstufe ist belegt: #280 hat Joyn als zweiten unabhängigen Adapter abgeschlossen. Waipu und Joyn können denselben kanonischen Titel beziehungsweise dasselbe lineare Ereignis bedienen, während Providerkennungen, Programm-IDs und PlaybackRoutes getrennt erhalten bleiben.

Nach dem Mitteilungspaket wird der kontrollierte Ausbau um weitere belastbare Quellen wieder aufgenommen. Verbindlich bleiben:
- kanonische Titelidentität `Medientyp + TMDB-ID`;
- neutrales Sender-/Verfügbarkeitsereignis;
- getrennte Quellen- und Provideridentität;
- mehrere getrennte Wiedergabeziele;
- Zeitfenster, Datenalter und Quellenzustand;
- Match-Sicherheit;
- Qualitäts-, Last- und Fehlergates;
- letzter gültiger veröffentlichter Stand bei Adapterfehlern.

### 3. Weitere Adapter

Weitere Quellen werden jeweils als getrennte, kleine Adapterpakete unter #271 bewertet. #336 bleibt als isolierter DVB-I-Diagnosepilot offen; ein Produktivadapter entsteht daraus nur bei belastbarem Zugang und sauberem Datenvertrag. Weitere offizielle Free-TV-/FAST-Quellen werden ebenfalls nur nach technischer und rechtlicher Prüfung eingebunden.

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

- #329 – Waipu-Restklassifizierung der technischen-only Einträge; Wartung, blockiert die aktuelle Hauptstrecke nicht
- #312/#118 – bleiben als Teilpakete des aktiven #314 offen, bis Ende-zu-Ende- und fachliche Abnahme vollständig sind
- #7 – erste Top-100-Stufe veröffentlicht und am 26.09.2026 auf Fire TV abgenommen; Empfehlungen und Automatisierung später
- #328 – Trailer/Teaser-Finish: Sprachwahl und Wiedergabestabilität; späteres UI-/Player-Finish
- #327 – TMDB-Kontosynchronisation; bewusst für später zurückgestellt
- #129 – Deutsch/Englisch-Umschaltung; spätere Release-Konsolidierung

## Release 1.0 – Zielblöcke

Vor einer öffentlichen Version 1.0 sollen mindestens folgende Blöcke abgeschlossen oder ausdrücklich freigegeben sein:

1. **Quellenfundament**
   - #271 erste Plattformstufe
   - #280 Joyn-Pilot – abgeschlossen; dient als Beleg für den zweiten unabhängigen Adapter
   - mindestens weitere belastbare Quellenadapter, sodass Movie Hub nicht funktional von einem einzelnen EPG-/Verfügbarkeitsweg abhängt

2. **Verfügbarkeitsdarstellung**
   - klare Trennung von flatrate/free/ads/rent/buy/TV/live
   - konsistente Darstellung in Poster, Detailseite, TV und Benachrichtigungen
   - keine irreführende Gleichsetzung von Sender, Provider und Wiedergabeweg

3. **Betrieb**
   - #315 – Datenfrische, Wiederanlauf, unabhängige Alarmierung und Cloud-Checkpoints – abgeschlossen
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

`#314 Mitteilungen/Benachrichtigungen (#312 + #118 + TV-Auslöser/IAM) → #271/#336 weitere Quellen → Verfügbarkeitsdarstellung und Produkt-Finish → #112 Release-Gate → 1.0`

#346 und #315 sind abgeschlossen. #329 bleibt Wartung. Das leichte verbleibende Fire-TV-Ruckeln ist kein offener Abnahmepunkt von #346 und kann bei Bedarf als eigenes eng begrenztes Performance-Folgepaket behandelt werden.
