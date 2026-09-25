# Movie Hub – Roadmap

Stand: 25. September 2026

## Leitprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn technische Prüfpunkte und erforderliche manuelle Geräteabnahmen erfüllt sind.

Für die nächste Entwicklungsstrecke gilt:

1. **Datenintegrität vor neuen Produktfeatures absichern.**
2. **Security-/Dependency-Hygiene anschließend bereinigen.**
3. Danach wieder sichtbare Produktfeatures in klaren Paketen weiterentwickeln.
4. Vor Beginn jedes größeren Pakets wird dessen Scope noch einmal fachlich und technisch überprüft.
5. Der veröffentlichte Movie-Hub-Katalog ist der kanonische Ist-Zustand für öffentliche Titelmetadaten; Laufzeit-Anreicherungen dürfen gültige Katalogdaten nicht verschlechtern.

## Aktuell abgeschlossener Stand

Zu den zuletzt abgeschlossenen bzw. abgenommenen Paketen gehören insbesondere:

- #114 – großer Suchindex
- #178 – Staffeln und Folgen auf der Serien-Detailseite
- #191 – Fire-TV-Navigation, Posterlast und WebView-Stabilität
- #195 – zentrale Begrenzung normaler Posterreihen / D-Pad-Entscheidung
- #207 – robuste persönliche TMDB-Synchronisierung
- #218 – Layout-Sammelissue / UI-Konsistenz
- #222 – Einstellungen, Profilsteuerung und Sichtbarkeit
- #205 – persönliche Daten schützen und SMB-Verbindungen konsolidieren
- #190 – automatische Hero-Trailer und nativer Trailer-/Teaser-Player
- #226 – einheitlicher TV-Switch-On/Off-Effekt für Startsequenz und native Player
- #225 – kanonische Katalogdaten bei Metadaten-Anreicherung verlustfrei erhalten
- #228 – robuster nativer Kaltstart ohne zusätzlichen Tastendruck
- #117 – Dependency-Audit und Security-Hygiene
- #4 – öffentlicher Waipu-Live-Katalog einschließlich 50-Sender-Bestand, TV-Integration und Geräteabnahme
- #256 – vollständige kanonische Titelmetadaten, gemeinsamer Nachtlauf und atomarer Search-only-Detailpfad
- #259 – exakter Waipu-Programmlink mit sicherer Fallbackkette und Geräteabnahme auf Smartphone, Tablet und Fire TV
- #281 – TV-Hero, Zeitraumwahl und Videothek-Posterreihen
- #283 – gemeinsamer Hero-first-Seitenrahmen für TV
- #285/#289 – TV-/Hero-UI-Finish, Aktivierungsfokus und Folgekorrekturen

Der aktuelle Fire-TV-Stand einschließlich der oben genannten Pakete wurde zuletzt am 22.09.2026 abgenommen.

## Abgeschlossenes Datenfundament

### #256 – Datenfundament: vollständige kanonische Titelmetadaten vor Veröffentlichung

#256 ist technisch und auf Fire TV abgenommen. Der V3-Vollständigkeitsvertrag,
die gemeinsame Prioritätswarteschlange nach `Medientyp + TMDB-ID`, der zentrale
[Titel-Executor](TITLE_PRIORITY_QUEUE.md), die atomare Veröffentlichung und der
Search-only-Lade-/Fehlerpfad sind produktiv verifiziert. Deploy Firebase #372
bestätigte den ruhigen Steady State mit 3.209 Kandidaten, 23 berechtigten
Queue-Einträgen, 0 Queue-Dubletten und 0 Rückstand. Der echte Watchdog-Lauf #3
meldete die 302-minütige Verzögerung sichtbar. „The Equalizer 2“ und „2012“
sowie der Search-only-Fehler mit **Erneut versuchen** wurden auf Fire TV
abgenommen.

Verbindlicher Umfang:

- katalogrelevante Titel aus Browse/Anbietern, persönlichem TMDB-Katalog, Movie Hub und `waipu-live` zu einem kanonischen Bestand nach `Medientyp + TMDB-ID` zusammenführen;
- vollständige Titel serverseitig wiederverwenden und fehlende beziehungsweise veraltete Metadaten zentral ergänzen;
- `metadataComplete` als vollständig geprüft definieren, ohne optionale bei TMDB nicht vorhandene Felder zu erzwingen;
- TMDB-Änderungslisten als tägliche Schnellspur für Korrekturen, neue Trailer und andere Änderungen nutzen;
- vollständige Titel zusätzlich rollierend nach spätestens 30 Tagen erneut prüfen; die in #200 umgesetzte Suchdetail-Logik wird eingebunden;
- eine gemeinsame deduplizierte Prioritätswarteschlange für neue, fehlerhafte, geänderte und altersbedingt fällige Titel führen;
- normale Code-Deployments vom planmäßigen beziehungsweise manuellen Datenlauf trennen;
- alle zusammengehörigen Artefakte mit gemeinsamer Generationskennung validieren und atomar veröffentlichen;
- bei jedem Teilfehler den letzten gültigen Stand online lassen;
- verspätete oder ausgefallene Nachtläufe sichtbar melden und fehlende Changes-Zeiträume kontrolliert nachholen.

Reine Suchindex-Titel außerhalb aller sichtbaren Kataloge müssen nicht vorangereichert werden. Beim Öffnen dürfen sie vollständig geladen werden, zeigen bis dahin jedoch ausschließlich einen klaren Ladezustand und anschließend die vollständige Detailseite auf einmal.

## Abgeschlossener Waipu-Deep-Link

### #259 – Waipu-Live: laufende Sendung direkt in waipu.tv starten

#259 ist technisch umgesetzt und auf Android-Smartphone, Android-Tablet sowie
Fire TV abgenommen. Aus konkreten Sender- und Programm-IDs entsteht der exakte
`app.waipu.tv/epgdetails/...`-Link. Die aktuelle Waipu-App öffnet damit
reproduzierbar die richtige Programmseite; bei laufenden Sendungen startet
**Play** den richtigen Live-Sender. Ein automatischer Streamstart ohne diesen
Zwischenschritt wird vom bestätigten Linkvertrag nicht bereitgestellt.

Fehlende oder ungültige Ausstrahlungsdaten, eine fehlende App und nicht
unterstützte Linkziele werden über die bestehende sichere Waipu-/Web-Fallbackkette
behandelt. Anmeldung, Tarif, DRM und Wiedergaberechte verbleiben vollständig bei
waipu.tv und werden in Movie Hub weder geprüft noch umgangen.

## Abgeschlossene TV-/Inhaltsseiten-Grundlage

Die Beobachtungen zum Referenzstand APK 0.1.473 wurden in #254 gesammelt und in
[Bestandsaufnahme ab APK 0.1.473](APP_REVIEW_0.1.473.md) strukturiert. #255 bleibt
für die weitere Triage und die noch offenen Trailer-/Erinnerungspakete erhalten.

Verbindliches Ziel ist eine gemeinsame technische Inhaltsseiten-Grundlage für
**Home, Filme, Serien, TV und Meine Inhalte**. Bewährte Seiten-, Hero-,
Posterreihen-, Fokus-, Lade- und Detailseitenlogik wird gemeinsam genutzt;
TV ergänzt ausschließlich die fachlich notwendigen Zeit-, Sender- und
Ausstrahlungszustände.

Die gemeinsame TV-/Inhaltsseiten-Grundlage wurde über #281, #283, #285 und #289
umgesetzt. Hero-first-Laden, Zeitraumwahl, Posterreihen, Fokus, Rückkehrzustand,
Abstände und TV-Statusdarstellung sind auf Smartphone, Android-Tablet und Fire
TV abgenommen. Die noch offenen Trailer-/Teaser- und Erinnerungspakete bleiben
in #255 getrennt dokumentiert.

## Nächstes Arbeitspaket: #271 – modulare Quellenplattform

Die 228-Sender-Stufe aus #260 ist veröffentlicht und auf Smartphone, Tablet und
Fire TV abgenommen. Als Nächstes wird #271 in Angriff genommen. Zuerst werden
die bestehenden Waipu-, Titel- und TV-Datenwege inventarisiert und ein
versionierter gemeinsamer Vertrag für Quellenadapter festgelegt: kanonische
Titelidentität (`Medientyp + TMDB-ID`), neutrales Senderereignis, getrennte
Anbieter- und Wiedergabeziele, Zeitfenster, Datenalter, Qualität und Fehler.
Ein Ausfall oder eine partielle Generation einer Quelle darf keinen gültigen
Bestand einer anderen Quelle ersetzen. TMDB bleibt für öffentliche
Titelmetadaten maßgeblich.

Die erste abgrenzbare Stufe von #271 liefert dokumentiertes Datenmodell,
Adapter- und Veröffentlichungsvertrag sowie überprüfbare Normalisierungs-,
Zeitfenster- und Fehlerfalltests anhand des vorhandenen Waipu-Pfads. Vor dem
Joyn-Piloten müssen die Eingangs- und Ausgabeformate sowie die Behandlung
mehrerer Anbieter am selben Ereignis geklärt sein. Weitergehende Direktstreams,
DVB-I und zusätzliche Quellen bleiben im offenen #271 gesonderte Prüfpunkte;
ihre Verfügbarkeit oder Zulässigkeit wird damit nicht vorausgesetzt.

## Direkt danach: #280 – Joyn-Adapter als erster zweiter Quellenpilot

Nach der belastbaren ersten Plattformstufe beginnt #280 mit einer begrenzten
Joyn-Senderinventur, Prüfung eines stabilen und zulässig nutzbaren strukturierten
EPG-Wegs und verifizierbaren sendergenauen Absprungzielen. Nur bestätigte Daten
werden über den Vertrag aus #271 normalisiert und dem vorhandenen kanonischen
Titelbestand zugeordnet. Waipu und Joyn bleiben als Wiedergabewege getrennt,
auch wenn sie dasselbe Senderereignis abdecken. Die geplante Pilotveröffentlichung
und Geräteabnahme hängen von Datenqualität, erlaubter Nutzung und echten
Linktests auf Smartphone, Tablet und Fire TV ab; ein offenes Prüfergebnis wird
als solches dokumentiert.

## Bereits abgenommene Waipu-Stufe, Restarbeiten in #260

### #260 – Waipu-Live: Senderbestand über 50 hinaus vollständig ausbauen

Die offizielle Liste mit 338 Einträgen wurde inventarisiert. Die ersten 100
Sender bleiben erhalten; 128 weitere fachlich geeignete Sender wurden
ausgewählt. PR #309 hat die 228 festen Waipu-IDs, den checkpoint-gestützten
Import und die bedarfsbezogene TV-Tagesladung umgesetzt. Der planmäßige
Datenlauf #390 hat am 23.09.2026 die vollständige 228er-Generation mit 1.617
Titeln und 15.520 Ausstrahlungen veröffentlicht. Der Produktionsindex meldet
`status=complete`, 228 Sender und 14 Tagesdateien.

Die 228er-Stufe ist auf Smartphone, Tablet und seit dem 25.09.2026 auch auf
Fire TV von Matthias abgenommen. #260 bleibt offen für die nachvollziehbare
Klassifizierung der 61 nur technisch gelisteten Einträge und die noch offenen
Gesamtkriterien. Die Betriebsüberwachung des Nachtlaufs wird in #315 verfolgt;
beide Restarbeiten blockieren die Vertragsarbeit von #271 nicht.

## Bereits getrennt dokumentierte Waipu-Folgepakete

### #259 – Waipu-Live: laufende Sendung direkt in waipu.tv starten

- abgeschlossen und auf Smartphone, Tablet sowie Fire TV abgenommen;
- bestätigter Vertrag: exakte Programmseite aus konkreter Sender- und Programm-ID;
- **Play** startet bei einer laufenden Sendung den richtigen Live-Sender;
- allgemeiner Waipu-/Web-Einstieg bleibt sicherer Fallback;
- Waiputhek, Aufnahmen, Zugangsdaten, Tarifprüfung und DRM bleiben getrennt.

### #260 – Waipu-Live: Senderbestand über 50 hinaus vollständig ausbauen

- offiziellen Senderbestand, technischen Senderstamm und tatsächlich Movie-Hub-fähige lineare Sender nachvollziehbar abgleichen;
- 100 Sender bilden den bereits eingeführten Ausgangsstand; von aktuell 338 offiziellen Listeneinträgen sind 128 weitere für Movie Hub ausgewählt, sodass die Zielmenge 228 Sender umfasst;
- Catch-up, VOD, Dubletten, regionale Varianten, fehlendes EPG und andere Ausschlussgründe dokumentieren;
- Ausbau auf 228 feste Waipu-IDs nach #256 und #259 checkpoint-gestützt über mehrere kontrollierte Läufe;
- mehrere hundert Sender dürfen auf den Geräten nur als benötigter Zeit-/Sichtausschnitt geladen und gerendert werden;
- öffentliche Verteilung bleibt vom Compliance-Gate #112 abhängig.

## Bewusst offen gehaltene Produktpakete

### 1. #118 – Benachrichtigen, wenn ein Titel ohne Aufpreis verfügbar wird

Die zwei ersten profilbezogenen Anlässe „Wenn inklusive“ und „Wenn im TV“ sind
seit #323/#324 veröffentlicht. Ein bereits inklusiver Titel darf beim Einschalten
einen einmaligen Ersttreffer erzeugen; ein TV-Termin am selben Abend ebenfalls.
#118 und #314 bleiben für den echten Nachtlauf, die Geräteabnahme und spätere
Entscheidungen über Texte und zusätzliche Anlässe offen. Die Weiterentwicklung
folgt nach dem Quellenpilot und wird nicht durch die Umpriorisierung abgenommen.

### 2. #7 – Persönliche Empfehlungen, Top 100 und Automatisierung

Erste Stufe: „Meine Top 100“ ausschließlich aus den eigenen 1–10-Bewertungen
des aktiven Profils ableiten. Weniger als 100 Bewertungen ergeben eine kürzere
Liste; mehrfach vorhandene Titel werden nur einmal gezählt. Die Anzeige nutzt
mehrere begrenzte Posterreihen und lädt keine weiteren persönlichen Daten.
Die erste Top-100-Stufe ist veröffentlicht. Persönliche Vorschläge,
Auswahlregeln für gesehen/ungesehen, ein täglich
überwachbarer Job und die zugehörige Geräteabnahme bleiben in #7 offen.
Verfügbarkeitsfakten kommen dabei weiterhin ausschließlich aus strukturierten
Quellen. Auch #7 bleibt offen und ist vorerst zurückgestellt.

## Weitere spätere Pakete

- #129 – Deutsch/Englisch-Umschaltung der GUI
- #112 – rechtliche & Compliance-Prüfung als Release-Gate vor öffentlicher Verteilung

## Dauerhaft offen / Wartung

- #8 – Ideen-Sammelstelle
- #223 – temporäre Übergangslösungen und späterer Rückbau; bleibt offen, solange noch Legacy-/Migrationspfade existieren

## Aktuelle Abhängigkeitskette

`#4/#256/#259/TV-Grundlage abgenommen → #260: 228er-Stufe abgenommen, Reste offen → #271: gemeinsame Quellenbasis → #280: Joyn-Pilot → #118/#314 und #7: spätere Weiterentwicklung`

#4, #256, #259 sowie die TV-Grundlage aus #281, #283, #285 und #289 sind
vollständig abgenommen und geschlossen. Der 228-Sender-Bestand ist veröffentlicht;
die noch ausstehende Klassifizierung in #260 und die Betriebsbeobachtung in
#315 laufen als gesonderte Restarbeiten. #271 ist das nächste Hauptpaket;
#280 folgt nach seinem ersten tragfähigen Vertrag. #118/#314 und #7 werden
später in getrennten Stufen weitergeführt. Öffentliche Verteilung bleibt von
der Compliance-Prüfung #112 abhängig.
