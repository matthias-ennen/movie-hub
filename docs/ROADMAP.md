# Movie Hub – Roadmap

Stand: 16. Oktober 2026

## Leitprinzip

Movie Hub wird in klar abgegrenzeten Arbeitspaketen weiterentwickelt. TMDB bleibt die kanonische Quelle für öffentliche Film- und Serienmetadaten. Zusätzliche Quellen liefern Verfügbarkeiten, Senderereignisse und Wiedergabeziele. Ein Adapterfehler darf weder andere Quellen noch den letzten gültigen veröffentlichten Datenstand beschädigen.

**Projektentscheidung 16.10.2026:** Das gesamte Mitteilungspaket einschließlich #314 und #385 ist auf ausdrücklichen Wunsch abgeschlossen; #380–#384 waren zuvor abgenommen. Spätere neue Meldungstypen sind nicht Teil der aktiven Entwicklung. **Neue Hauptstrecke ist #271 (Quellenplattform), erster Adapter #388 (YouTube), danach #336 (DVB-I) und #391 (Prime Video).** Die Adapter werden zunächst analysiert und über getrennte Pilot-/Freigabegates vorbereitet; es besteht noch keine Produktivfreigabe. [Verbindlicher Adapterplan](ADAPTER_PROGRAM.md).

## Aktive Hauptstrecke ab 16.10.2026 – Adapter-Fundament

1. **#388 YouTube – Priorität 1:** Zulässige Quellen/API, echte kostenlose vollständige Filme in Deutschland, konservatives TMDB-Matching, exakte YouTube-Video-Routen und Fire-TV-Absprung untersuchen. Zuerst begrenzter nichtproduktiver Datenpilot, anschließend Go/No-Go. Keine Scraping- oder Direktstream-Lösung.
2. **#336 DVB-I – Priorität 2:** Offiziellen deutschen Service-List-/Content-Guide-Zugang, EPG, Region, Rechte und Wiedergabeziele als isolierten Pilot prüfen. Produktionszugang nicht voraussetzen.
3. **#391 Prime Video – Priorität 3:** Vorliegende Fire-TV-GTI-Erfahrungen und mögliche belastbare Quelle für titelgenaue IDs prüfen. Kein universeller Deep-Link und kein Adapter ohne geprüften Datenzugang.
4. **Weitere offizielle Quellen** nach Entscheidung einzeln priorisieren, ohne #271 zur Sammelimplementierung aufzublähen.
5. **Danach:** Verfügbarkeits- und Kostenpriorität (FLAT/FREE/ADS/RENT/BUY/TV), Gerätefinish, #112-Release-Gate.

**Architektur:** TMDB ist die kanonische Titelbasis; Adapter ergänzen Provenienz, Verfügbarkeit und PlaybackRoute im bestehenden gemeinsamen Vertrag. Quellenfehler dürfen andere Quellen und den letzten gültigen Stand nicht beschädigen. Technische und manuelle Abnahmen bleiben getrennt.

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
- #118/#381/#312 – vollständige Mitteilungs-Grundstrecke einschließlich aller vier Restabnahmen; am 12.10.2026 durch Matthias ausdrücklich bestätigt und geschlossen
- #380 – Server-Prüflauf/IAM und produktiver Beobachtungsnachweis; am 08.10.2026 abgeschlossen
- #383 – aktive Beobachtungen unter Einstellungen → Mitteilungen; am 12.10.2026 durch Matthias abgenommen und geschlossen
- `movie-hub-admin#11` – Übersicht, Gültigkeits-/Statusanzeige und kontrollierte Rücknahme; am 12.10.2026 ausdrücklich abgenommen und geschlossen
- #382 – vollständige TV-Erinnerungskette für Film und ganze Serie; am 12.10.2026 durch Matthias abgenommen und geschlossen
- #413 – persönliche Smart-Reihen aus dem zusammengeführten Bestand; am 12.10.2026 auf Smartphone/Fire TV abgenommen und geschlossen
- #415 – Schauspielersuche im öffentlichen und persönlichen Bestand; am 12.10.2026 auf Smartphone/Fire TV abgenommen und geschlossen
- #387 – Einstellungen, flache Navigation und Stilkorrektur über #422/#424/#425; am 13.10.2026 mit „Das ist abgenommen.“ bestätigt und abgeschlossen
- #426 – Detailseiten, Episodennavigation, gemeinsamer Datenabgleich und Navigationsnachträge; Stand `6ef4f83` am 13.10.2026 um 20:46 Uhr (Europe/Berlin) ausdrücklich abgenommen und abgeschlossen

## Gezielter aktueller Betriebsauftrag (07.10.2026)

Matthias hat nach der Nachtlauf-Prüfung ausdrücklich Joyn auf 14 Tage EPG und
auf die Waipu-Betriebsstufe priorisiert: dauerhafte Cache-/Checkpoint-Nutzung,
inkrementelle TMDB-Verarbeitung, gleichwertiger Bericht und Überwachung der
tatsächlich veröffentlichten gemeinsamen App-Daten. Dies erweitert den
abgeschlossenen Adapter #280; der vorherige Stand hatte nur rund 31 Stunden
Joyn-Vorschau. Quellenprüfung, Umsetzung und produktive Datenabnahme sind
getrennte Nachweise; Details stehen in [DATA_WORKFLOW_RELIABILITY.md](DATA_WORKFLOW_RELIABILITY.md).
Movie Hub Admin bleibt ein separates Repository; Übersicht und Rücknahme aus #11 sind inzwischen am 12.10.2026 abgenommen.

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

## Historischer Umsetzungsverlauf bis 15.10.2026 (nicht mehr aktive Priorisierung)

### Abgeschlossen: #426 einschließlich Navigationsnachtrag

Matthias hat Build `6ef4f83` am 13.10.2026 um 20:46 Uhr (Europe/Berlin)
mit „Ja, ist abgenommen und damit abgeschlossen“ ausdrücklich bestätigt.
Damit sind auch mitscrollende Kopfaktionen, zeilenweise D-Pad-Navigation,
vollständige Scrollgrenzen, stabile Ladepositionen und Favoritenfarben abgenommen.
Für dieses Arbeitspaket bleibt keine Abnahme offen. Basisabnahme und Verlauf
bleiben erhalten; #328/#391 gehören nicht zu diesem Umfang.

1.054 Anwendungstests, Browser-Komponentenprüfung in sechs Bildschirmformaten,
CI, Android-Build und Veröffentlichung sind nachgewiesen.
Abnahme und Nachweise: [Detailpaket](_work/DETAIL_426.md).
**#384 – Auch per E-Mail je Profil** ist produktiv und am 15.10.2026 vollständig abgenommen. Als Nächstes wird **#385** priorisiert.

### 1. #314 – Mitteilungs-Grundpaket und #384 abgeschlossen; #385 folgt

Matthias hat am 12.10.2026 sämtliche vier zuletzt vorgelegten Restpunkte
mit „Ja, das ist alles abgenommen“ bestätigt. #118/#381/#312 sind geschlossen;
#380/#382/#383 und `movie-hub-admin#11` waren bereits abgeschlossen.
Keine offene Geräteabnahme der gelieferten Basis.

**#384 ist abgeschlossen.** Unter **Profile & Konto** stehen Empfängeradresse,
„E-Mail speichern“ und der direkt speichernde optionale Mail-Schalter je Profil.
E-Mails aus persönlichen Inklusiv-, TV-Fund- und TV-Enderinnerungsereignissen
werden über den eigenen, verifizierten Resend-Absender versandt. Vier bestehende
Mailfunktionen, Secrets, Index und privater Minutenjob sind produktiv eingerichtet.
Der Nutzer bestätigte echte Live-Empfänge im Haupt- und Unterprofil,
Bestätigungs- und Abmeldelinks und schließlich am 15.10.2026 die Gesamtabnahme.
Keine alten Testsender-/DNS-/Secret-Einrichtungsanweisungen erneut ausführen.
[Abschluss und Nachweisgrenzen](_work/EMAIL_384.md).

**Nächster Schritt:** #385 als eigenständiges Paket zur Bewertung zusätzlicher
sinnvoller Anlässe priorisieren. #314 bleibt als Erweiterungs-Master offen.
Details: [Tagesabschluss und Analyse](TITLE_NOTIFICATIONS.md#tagesabschluss-12102026).

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
- #388 – YouTube-Erstanalyse als nächstes Adapterpaket unter #271; #314/#385 sind abgeschlossen
- #386 – eng begrenzte Fire-TV-Nacharbeit zu verbliebenen Navigations-Freezes; eigenes offenes Folgeissue
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

`#271 / #388 YouTube-Analyse + Pilot → #336 DVB-I → #391 Prime-Video-Analyse → weitere Quellen nach Go/No-Go → Verfügbarkeitsdarstellung und Produkt-Finish → #112 Release-Gate → 1.0`

#346, #315, #118, #312, #380, #381, #382, #383, #387 und `movie-hub-admin#11` sind abgeschlossen. #426 ist einschließlich aller Nachträge abgenommen und abgeschlossen. #329 bleibt Wartung. Die verbleibende Fire-TV-Nacharbeit ist in #386 separat erfasst; sie öffnet #346 nicht wieder. Die reguläre Datenfortschreibung ist am 12.10.2026 bestätigt; Startverzögerungen bleiben unter Beobachtung. #413/#415 sind durch Matthias abgenommen und geschlossen. Die Adapter #388 (YouTube), #336 (DVB-I) und #391 (Prime Video) bilden die neu priorisierte Hauptstrecke unter #271; #314/#385 sind abgeschlossen.
