# Movie Hub – Roadmap

Stand: 12. Oktober 2026

## Leitprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. TMDB bleibt die kanonische Quelle für öffentliche Film- und Serienmetadaten. Zusätzliche Quellen liefern Verfügbarkeiten, Senderereignisse und Wiedergabeziele. Ein Adapterfehler darf weder andere Quellen noch den letzten gültigen veröffentlichten Datenstand beschädigen.

Nach Abschluss der Fundamenthärtung und der Nachtlauf-Betriebsabsicherung ist #314 die aktuelle Produkt-Hauptstrecke für Mitteilungen und Benachrichtigungen. Der gezielt vorgezogene Waipu-/Joyn-Betriebsnachtrag vom 07.10.2026 verändert diese Reihenfolge nicht. Danach wird die modulare Quellenplattform mit weiteren belastbaren Quellen fortgeführt.

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
- #380 – Server-Prüflauf/IAM und produktiver Beobachtungsnachweis; am 08.10.2026 abgeschlossen
- #382 – vollständige TV-Erinnerungskette für Film und ganze Serie; am 12.10.2026 durch Matthias abgenommen und geschlossen
- #413 – persönliche Smart-Reihen aus dem zusammengeführten Bestand; am 12.10.2026 auf Smartphone/Fire TV abgenommen und geschlossen
- #415 – Schauspielersuche im öffentlichen und persönlichen Bestand; am 12.10.2026 auf Smartphone/Fire TV abgenommen und geschlossen

## Gezielter aktueller Betriebsauftrag (07.10.2026)

Matthias hat nach der Nachtlauf-Prüfung ausdrücklich Joyn auf 14 Tage EPG und
auf die Waipu-Betriebsstufe priorisiert: dauerhafte Cache-/Checkpoint-Nutzung,
inkrementelle TMDB-Verarbeitung, gleichwertiger Bericht und Überwachung der
tatsächlich veröffentlichten gemeinsamen App-Daten. Dies erweitert den
abgeschlossenen Adapter #280; der vorherige Stand hatte nur rund 31 Stunden
Joyn-Vorschau. Quellenprüfung, Umsetzung und produktive Datenabnahme sind
getrennte Nachweise; Details stehen in [DATA_WORKFLOW_RELIABILITY.md](DATA_WORKFLOW_RELIABILITY.md).
Movie Hub Admin bleibt ein eigenes späteres Arbeitspaket.

Dieser Betriebsnachtrag wird unter #271 dokumentiert und ergänzt #280/#315;
es wurde kein neues eigenes Issue dafür angelegt. Technisch sind der
14-Tage-Vollaufbau, Fehlerschutz, differenzierte Berichte und der Restore der
größeren Titeldatei umgesetzt und veröffentlicht. Der finale Code-Deploy
[37603310094](https://github.com/matthias-ennen/movie-hub/actions/runs/37603310094)
und die Rückprüfung aller fünf öffentlichen Endpunkte sind erfolgreich.
Die nachfolgenden Fehlerkorrekturen #411/#412 sind übernommen. Der reguläre
[Nachtlauf vom 12.10.2026](https://github.com/matthias-ennen/movie-hub/actions/runs/38191419867)
bestätigt Fortschreibung, normale Budgets, Checkpoints, vollständigen
TMDB-Verbraucherabschluss und öffentliche Rückprüfung. Er startete allerdings
erst um 03:19 Uhr statt 00:17 Uhr Europe/Berlin (182 Minuten Verzögerung).
Die Datenstrecke ist nachgewiesen; pünktlicher Start bleibt ein Überwachungspunkt.

## Gezielte Korrektur persönlicher Reihen (12.10.2026)

#413 ist über PR #414 technisch geprüft und veröffentlicht: gemeinsame Titelbasis und einheitliche Filtermetadaten für alle fünf persönlichen Smart-Reihentypen, einschließlich Erhalt der Metadaten und Nachpflege älterer Referenzen im bestehenden kanonischen Datenlauf. Keine Änderung der Hauptreihenfolge. Matthias hat am 12.10.2026 den gemeinsamen Abnahmeschritt #413/#415 auf Smartphone/Fire TV ausdrücklich mit „Abgenommen“ bestätigt: Josh Hartnett suchen, „30 Days of Night“ öffnen, persönliche Reihe kontrollieren und flüssige Fire-TV-Bedienung prüfen. #413 ist geschlossen; die technischen Prüfungen aller fünf Filtertypen bleiben im Issue nachgewiesen. Web-Korrektur nach App-Neustart; neue vollständige native Importe benötigen die neue APK.

## Ergänzung Schauspielersuche (12.10.2026)

#415 ergänzt über den übernommenen PR #416 das bestehende Suchfeld um Schauspielernamen. Gemeinsame Besetzungs-IDs mit #413, öffentlicher Suchindex aus vorhandenen Metadaten und lokale Ergänzung persönlicher Titel; keine zusätzlichen Netzwerkabfragen beim Tippen. Technische Tests und Veröffentlichung sind erfolgreich. Die manuelle Smartphone-/Fire-TV-Abnahme wurde am 12.10.2026 im gemeinsamen Schritt mit #413 bestätigt; #415 ist geschlossen. Die Reihenfolge der Hauptstrecke ändert sich nicht. Für die Sucherweiterung reicht ein vollständiger App-Neustart.

## Aktive Hauptstrecke

### 1. #314 – Mitteilungen und Benachrichtigungen konsolidieren

#314 ist ab 03.10.2026 das **aktuelle große Arbeitspaket**. Es bündelt die noch offenen Produktentscheidungen und Randfälle der bereits vorhandenen Mitteilungsbasis, ohne die bestehende App-Architektur unnötig umzubauen.

Aktueller Stand:
- #312 stellt Glocke, Posteingang und globale Admin-Mitteilungen bereit; Smartphone-Grundstrecke und Fire-TV-D-Pad-Bedienung sind bestätigt;
- #118 stellt „Wenn inklusive“ bereit;
- die Detailseite bietet zusätzlich „Wenn im TV“ als getrennten persönlichen Auslöser;
- persönliche Meldungen bleiben zunächst innerhalb von Movie Hub; Betriebssystem-Push und E-Mail gehören nicht automatisch zum aktuellen Umfang;
- der in Deploy #939 beobachtete Server-/IAM-Fehler ist über #380 produktiv behoben und abgeschlossen;
- #381 ist produktiv, einschließlich Kontoisolation aus PR #404; Fire-TV-Bedienung, Zwei-Geräte-Lesestatus und persönliche Profiltrennung sind bestätigt;
- #382 ist seit 12.10.2026 fachlich abgenommen und geschlossen. Matthias bestätigt die fünf offenen TV-Prüfpunkte ausdrücklich mit „1 bis 5 abgenommen“; Zeitverhalten und automatischer Abschluss waren zuvor bestätigt.

Die Produktentscheidungen vom 03.10.2026 stehen bereits in #314; dafür wurden
die Teilpakete #380–#385 angelegt. Sie werden nicht erneut als ungeklärte
Grundsatzfragen behandelt. Die konkrete Fortsetzung lautet:

1. **#383:** am 12.10.2026 abgenommen und geschlossen. Die Verwaltung unter
   Einstellungen → Mitteilungen ist auf Smartphone/Fire TV einschließlich
   Profilwechsel und geräteübergreifendem Ausschalten bestätigt.
2. **#381 + #118:** die eigenständigen Restabnahmen des produktiven Lebenszyklus
   abschließen: globale Admin-Meldungen/Lesestatus bei Konto- und Profilwechsel,
   fachliche Inklusiv-Restfälle und ausdrückliche Gesamtfreigabe.
3. **#312:** noch offene Grundstrecken-/Mehrgeräte-Abnahmen durchführen;
   Die noch fehlende Rücknahme wird als Voraussetzung im getrennten
   `movie-hub-admin#11` ergänzt; danach globale Meldungen gemeinsam abnehmen.
4. **#384/#385:** optionalen E-Mail-Kanal und weitere Anlässe separat entscheiden.

#382 ist abgeschlossen. Film-/Serien-Kette, frühe Fundmeldung mit Termin/Sender,
Titelöffnung, Deduplizierung und Erinnerung bei geschlossener App sind durch
Matthias bestätigt; Zeitverhalten und automatischer Abschluss ebenfalls.
Kein Vorlaufpuffer und keine erneute Scheduler-Aktivierung erforderlich.

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
- #312/#118 und #381–#385 – offene Teilpakete der Hauptstrecke #314; #380 ist abgeschlossen
- #386 – eng begrenzte Fire-TV-Nacharbeit zu verbliebenen Navigations-Freezes; eigenes offenes Folgeissue
- #387 – Inventur, Fokus und Navigation der Einstellungen; eigenes offenes Folgeissue
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

`#314 (#383; Restabnahmen #381/#118 und danach #312; #384/#385 optional) → #271/#336 weitere Quellen → Verfügbarkeitsdarstellung und Produkt-Finish → #112 Release-Gate → 1.0`

#346, #315, #380 und #382 sind abgeschlossen. #329 bleibt Wartung. Die verbleibende Fire-TV-Nacharbeit ist in #386 separat erfasst; sie öffnet #346 nicht wieder. Die reguläre Datenfortschreibung ist am 12.10.2026 bestätigt; Startverzögerungen bleiben unter Beobachtung. #413/#415 sind durch Matthias abgenommen und geschlossen. Neue Quellenkandidaten #388 (YouTube) und #391 (Prime Video) bleiben getrennte Recherchepakete unter #271 und ändern die Hauptstrecke nicht.
