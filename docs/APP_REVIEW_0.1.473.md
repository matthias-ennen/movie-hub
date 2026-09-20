# Bestandsaufnahme der App ab APK 0.1.473

Stand: 20. September 2026

Quellen:

- [Sammel-Issue #254](https://github.com/matthias-ennen/movie-hub/issues/254) – vollständige Beobachtungen zum Referenzstand;
- [Fortsetzungs- und Triage-Issue #255](https://github.com/matthias-ennen/movie-hub/issues/255) – weitere Sammlung, Paketbildung und Entscheidungen;
- [Waipu-/TV-Hauptpaket #4](https://github.com/matthias-ennen/movie-hub/issues/4).

## Zweck und Status

Dieses Dokument hält den gemeinsam erreichten Stand fest, ohne die noch offenen Detailentscheidungen vorwegzunehmen. Es ist die kompakte Arbeitsgrundlage für die nächsten Arbeitspakete.

- Referenz-App: **APK 0.1.473**
- Zielgeräte: **Fire TV, Android-Smartphone und Android-Tablet**
- TV-Datenbasis: **50 Sender und 14 Tage EPG**
- #254 bleibt als vollständiger Quellnachweis erhalten.
- Neue Beobachtungen und die weitere Triage werden in #255 fortgeführt.
- Aus diesem Dokument entsteht **kein automatischer Programmierauftrag**.
- Vor jedem Umsetzungspaket werden Scope, offene Fragen und Abnahme gemeinsam bestätigt.

## Verbindliches gemeinsames Architekturprinzip

**Home, Filme, Serien, TV und Meine Inhalte sollen technisch auf derselben stabilen Inhaltsseiten-Grundlage aufbauen.**

Bereits bewährtes Verhalten aus Home, Filme und Serien wird wiederverwendet. Für TV und Meine Inhalte werden keine unnötigen parallelen Varianten derselben Grundfunktionen gebaut.

Gemeinsam zu behandeln sind insbesondere:

- Seitenrahmen, Überschriften und vertikale Abstände;
- Hero-Bereich, sofern die jeweilige Seite einen Hero besitzt;
- Posterreihen und Posterkarten;
- Fokus-, D-Pad-, Touch- und Wischverhalten;
- Einstiegspunkt nach bewusster Auswahl eines Navigationsreiters;
- Lade-, Fehler- und Leerezustände;
- Übergang zur Detailseite;
- Versorgung mit vollständigen kanonischen TMDB-Metadaten;
- Einstellungen für Sichtbarkeit und Reihenfolge der Seitenmodule.

Seitenspezifisch bleiben nur fachlich notwendige Unterschiede. Für TV sind das vor allem Sender, Ausstrahlungszeit, Zeitfenster, zeitabhängige Sortierung sowie die Zustände `BALD` und `ON AIR`.

Das Ziel ist nicht, alle Seiten optisch gleichzumachen. Das Ziel ist eine gemeinsame, getestete technische Basis mit klar definierten fachlichen Erweiterungen.

## Erfasste Punkte aus #254

| Nr. | Thema | Festgehaltener Stand | Vorläufiges Paket |
|---:|---|---|---|
| 1 | Trailer-/Teaser-Wiedergabe | Starkes Nachladen untersuchen; kontrollierten Startpuffer nur einsetzen, soweit YouTube/IFrame dies zuverlässig erlaubt. | Trailer und Teaser |
| 2 | Trailer-/Teaser-Sprache | Bevorzugte Trailer-Sprache soll später zur gewählten App-/Inhaltssprache passen; deutsche Fassung zuerst, definierter Fallback nötig. | Trailer und Teaser / #129 |
| 3 | Fokus nach Reiterauswahl | Bewusste Auswahl von Home, Filme, Serien, TV oder Meine Inhalte setzt den Fokus auf den Hero beziehungsweise das erste Inhaltselement. Kein späteres automatisches Fokus-Stehlen. | Gemeinsame Inhaltsseiten |
| 4 | TV-Hero und Einstellungen | TV erhält einen Hero und dieselbe steuerbare Modul-/Reihenlogik wie die übrigen Inhaltsseiten. | Gemeinsame Inhaltsseiten / TV |
| 5 | TV-Zeitfenster | Nicht der vollständige 14-Tage-Bestand wird gleichzeitig gerendert. Die App zeigt begrenzte, zeitbezogene Ausschnitte; vierstündige Fenster sind nur eine Arbeitsannahme. | TV-Videothek |
| 6 | TV-Detailseite und Metadaten | Karten und Details müssen bereits mit vollständigen kanonischen TMDB-Daten erscheinen; kein Qualitätsgewinn erst nach Öffnen der Detailseite. | #256 – Datenfundament |
| 7 | Gemeinsamer Seitenbaukasten | Home, Filme, Serien, TV und Meine Inhalte verwenden dieselben belastbaren Grundbausteine und Interaktionsregeln. | Gemeinsame Inhaltsseiten |
| 8 | Einstieg in laufende TV-Reihe | Beim Betreten der laufenden Reihe soll die zuletzt gestartete, noch laufende Sendung fokussiert und sinnvoll sichtbar ausgerichtet sein. Frühere laufende Titel bleiben links erreichbar. | TV-Videothek |
| 9 | Überschrift und Abstände | TV beginnt mit „Das Fernsehprogramm“. Waipu wird dort nicht als Seitentitel genannt. Der vertikale Abstand ober- und unterhalb der entsprechenden Seitenüberschriften soll ungefähr halbiert werden. | Gemeinsame Inhaltsseiten |
| 10 | TV als zeitgesteuerte Videothek | Vorgesehen sind TV-Hero, gemischte Jetzt-/Gleich-Reihe, kommende Filme, kommende Serien und eine erkennbare zeitliche Orientierung. Tagesreihen über 14 Tage entfallen als primäre Darstellung. | TV-Videothek |
| 11 | `BALD` und `ON AIR` | Status nicht mehr unter „Film/Serie“, sondern im unteren Informationsbereich der Karte. `BALD` wechselt zum Startzeitpunkt in `ON AIR`; `BALD` bleibt optisch dezenter. | TV-Videothek |
| 12 | TV-Beobachtung und Sendetermin-Erinnerung | Zwei Stufen: einen Titel bis zum Auftauchen im 14-Tage-Fenster beobachten und anschließend vor einem konkreten Sendetermin erinnern. Push zuerst; E-Mail nur optional und mit bestätigter Adresse. | Eigenes Erinnerungs-Paket, mit #118 koordiniert |
| 13 | Direkter Waipu-Live-Absprung | Der Waipu-Button soll bei einer laufenden, eindeutig bekannten Ausstrahlung nach Möglichkeit direkt den richtigen Sender in der waipu.tv-App starten. Die EPG-Linkvorarbeit aus #75 muss auf Android und Fire TV real verifiziert werden. | #259 – Waipu-Live-Deep-Link |
| 14 | Vollständiger Waipu-Senderausbau | Der 50-Sender-Bestand wird später auf alle technisch geeigneten und freigegebenen linearen Waipu-Sender erweitert. Offizielle Liste, technischer Stamm und Movie-Hub-fähige Sender werden getrennt abgeglichen. | #260 – Senderausbau |

## Vorgeschlagene Arbeitspakete

### A. Gemeinsame Inhaltsseiten-Grundlage und Fokus

Enthält die Punkte 3, 4, 7 und 9 sowie die gemeinsam nutzbaren UI-Anteile aus Punkt 8.

Ziel:

- einen gemeinsamen Inhaltsseiten-Vertrag definieren;
- bestehende stabile Bausteine aus Home, Filme und Serien wiederverwenden;
- TV und Meine Inhalte an dieselben Regeln anbinden;
- Hero-/Erstelement-Fokus bei bewusster Reiterauswahl vereinheitlichen;
- Seitenüberschrift und vertikale Abstände konsistent machen;
- TV-Module über dieselbe Einstellungslogik steuerbar machen.

### B. TV als zeitgesteuerte Videothek

Enthält die Punkte 5, 8, 10 und 11 sowie den TV-spezifischen Teil aus Punkt 4.

Ziel:

- den vollständigen 14-Tage-Bestand als Datenquelle behalten;
- der App nur begrenzte, aktuelle Ausschnitte liefern;
- „jetzt“, „gleich“, kommende Filme und kommende Serien verständlich darstellen;
- Fokus und horizontale Position in der laufenden Reihe zeitbezogen setzen;
- `BALD` und `ON AIR` eindeutig und platzsparend darstellen;
- Sendungen nicht einfach als vierzehn lange Tagesreihen ausgeben.

### C. #256 – Katalogübergreifendes Datenfundament

Enthält Punkt 6, wurde über TV hinaus katalogübergreifend erweitert und ist das nächste eigenständige Arbeitspaket nach dem abgeschlossenen #4.

Verbindliches Ziel:

- pro `Medientyp + TMDB-ID` genau einen kanonischen öffentlichen Titeldatensatz führen;
- sichtbare Anbieter-, Waipu-, Movie-Hub- und persönliche Katalogtitel vor der Veröffentlichung vollständig prüfen und anreichern;
- reine Suchindex-Titel weiterhin erst beim Öffnen vollständig laden dürfen, dann aber mit geschlossenem Ladezustand statt sichtbarem schrittweisen Seitenaufbau;
- `metadataComplete` als „alle vorgesehenen Quellen/Felder geprüft“ definieren; optionale bei TMDB fehlende Felder blockieren nicht;
- die Zustände „geprüft und vorhanden“, „geprüft und nicht vorhanden“ sowie „noch nicht geprüft/Abruf fehlgeschlagen“ technisch unterscheiden;
- TMDB-Änderungslisten als tägliche Schnellspur und einen rollierenden 30-Tage-Umlauf als Sicherheitsnetz verwenden;
- alle Quellen in einer gemeinsamen, nach `Medientyp + TMDB-ID` deduplizierten Prioritätswarteschlange zusammenführen;
- normale Code-Deployments vom planmäßigen beziehungsweise manuellen Datenlauf trennen;
- eine neue Generation erst nach vollständiger Prüfung aller zusammengehörigen Artefakte atomar veröffentlichen;
- den letzten gültigen Datenbestand bei Teilfehlern beibehalten;
- verspätete oder ausgefallene Nachtläufe und einen zu alten Datenstand sichtbar melden und den fehlenden TMDB-Changes-Zeitraum lückenlos nachholen.

Die vollständige Spezifikation, Abgrenzung und Abnahme steht verbindlich in [Issue #256](https://github.com/matthias-ennen/movie-hub/issues/256). #200 liefert die bereits umgesetzte 30-Tage-Aktualisierung reiner Suchdetails; #256 führt die katalogübergreifende Orchestrierung, Validierung und Veröffentlichung zusammen.

### D. Trailer und Teaser

Enthält die Punkte 1 und 2.

Ziel:

- tatsächliche Ursache des Ruckelns auf den Zielgeräten messen;
- prüfen, welche Puffer-/Startsteuerung der eingebettete YouTube-Player zulässt;
- einen klaren Lade-, Start- und Fehlerzustand definieren;
- Sprachpriorität und Fallback später mit #129 abstimmen.

### E. TV-Beobachtungen und Erinnerungen

Enthält Punkt 12.

Ziel:

- einen Film oder eine Serie unabhängig von einem bereits bekannten Sendetermin beobachten;
- beim ersten Auftauchen im 14-Tage-TV-Fenster einmalig informieren;
- für eine konkrete Ausstrahlung eine Erinnerung mit wählbarem Vorlauf ermöglichen;
- Doppelmeldungen verhindern;
- Beobachtungen und Erinnerungen einfach verwalten und löschen;
- Zustellung, Datenschutz, Verschlüsselung, Gerätewechsel und Kontolöschung sauber lösen.

Abgrenzung zu #118:

- #118 meldet einen Übergang zu `flatrate`, `free` oder `ads` bei aktivierten Streaminganbietern.
- Dieses Paket meldet das Auftauchen im TV-EPG beziehungsweise einen konkreten Sendetermin.
- Gemeinsame Infrastruktur für Push, Zustellhistorie und Gerätezuständigkeit soll geprüft werden.
- Die fachlichen Zustände und Auslöser bleiben getrennt.


### F. #259 – Direkter Start der laufenden Waipu-Sendung

Enthält Punkt 13 und baut auf #4 sowie der historischen Vorarbeit aus #75 auf.

Ziel:

- verifizieren, ob öffentliche Sender- und Programm-ID das offizielle `app.waipu.tv/epgdetails/...`-Ziel eindeutig bilden;
- den Link zunächst per ADB und anschließend aus Movie Hub prüfen;
- auf Android sowie realer Fire-TV-Hardware tatsächlich den richtigen laufenden Sender starten;
- kommende, abgelaufene, nicht abonnierte und nicht auflösbare Ziele sicher behandeln;
- den allgemeinen Waipu-Live-Einstieg als Fallback behalten;
- Waiputhek, Aufnahmen, Zugangsdaten, DRM und internes Streaming ausschließen.

### G. #260 – Vollständiger kontrollierter Senderausbau

Enthält Punkt 14 und baut auf dem abgenommenen 50-Sender-Stand aus #4 auf.

Ziel:

- offizielle Senderliste, technischen Senderstamm und Movie-Hub-fähige lineare Sender vollständig abgleichen;
- jeden ausgeschlossenen oder noch nicht freigegebenen Eintrag mit Grund ausweisen;
- Catch-up, VOD, Dubletten, regionale Varianten und fehlendes EPG sauber unterscheiden;
- mehrere hundert Sender checkpoint-, budget- und cache-basiert in kontrollierten Wellen aufbauen;
- auf den Geräten trotzdem nur den benötigten Zeit-/Sichtbereich laden und rendern;
- bestehende persönliche Senderausblendungen und Reihenfolgen erhalten;
- den gemeinsamen Deep-Link-Vertrag aus #259 senderunabhängig anwenden;
- Compliance #112 vor öffentlicher Verteilung beachten.

## Offene Fragenregister

Die folgenden Fragen sind bewusst **nicht heute zu entscheiden**. Sie werden beim Start des betreffenden Pakets einzeln und in überschaubaren Blöcken erneut vorgelegt.

### Paket A – gemeinsame Inhaltsseiten

- Welche Module sind auf jeder Seite zwingend, welche optional?
- Soll „Meine Inhalte“ später ebenfalls einen Hero erhalten oder nur dieselben Grundbausteine ohne Hero nutzen?
- Wie genau werden TV-Hero und TV-Reihen in den Einstellungen benannt und sortiert?
- Soll erneutes Anklicken des bereits aktiven Reiters ebenfalls an den Seitenanfang und in den Hero springen?
- Welche Fokusposition gilt, wenn ein Hero technisch vorhanden, aber vom Nutzer ausgeschaltet ist?

### Paket B – TV-Videothek

- Wie heißen die endgültigen Reihen?
- Wie groß ist der sichtbare Zeitraum für „jetzt/gleich“?
- Wie weit in die Zukunft reichen „Kommende Filme“ und „Kommende Serien“?
- Werden feste Zeitfenster verwendet oder dynamische Grenzen anhand der nächsten Sendestarts?
- Ab welchem Vorlauf erscheint `BALD`?
- Wie werden gleiche Titel mit mehreren nahen Ausstrahlungen behandelt?
- Wie lange bleibt ein ausschließlich durch TV bekannter Titel nach seiner letzten Ausstrahlung sichtbar?
- Wie genau sehen Zeitmarkierung, Jetzt-Grenze und Kartenstatus aus?
- Welche TV-Reihen lassen sich einzeln ein-/ausschalten und umsortieren?

### Paket C – #256 Datenfundament

Die fachlichen Grundentscheidungen sind in #256 dokumentiert. Vor der Programmierung bleibt nur eine kurze letzte Scope-Kontrolle:

- alle realen Titelquellen und erzeugten Artefakte gegen den aktuellen Repository-Stand inventarisieren;
- sicherstellen, dass die neue gemeinsame Orchestrierung die abgeschlossenen Mechanismen aus #200, #207 und #225 wiederverwendet statt dupliziert;
- Kapazitätsgrenzen so festlegen, dass neue und von TMDB gemeldete Änderungen vor dem normalen 30-Tage-Umlauf verarbeitet werden;
- harte Veröffentlichungsgates und die gemeinsame Generationskennung technisch konkretisieren;
- prüfen, wie Verzögerung, Ausfall und Alter des letzten gültigen Datenstands im Workflow-Bericht ausgewiesen werden.

### Paket D – Trailer und Teaser

- Welche Zielgeräte und Netzwerkbedingungen dienen als Messbasis?
- Wie lange darf vor Wiedergabestart maximal gepuffert werden?
- Soll der Nutzer währenddessen ein Vorschaubild, einen Fortschritt oder nur einen Ladezustand sehen?
- Wie lautet die Sprach-Fallback-Reihenfolge, wenn kein Trailer in der gewählten Sprache existiert?
- Dürfen Teaser als Fallback dienen, wenn kein Trailer verfügbar ist?

### Paket E – Erinnerungen

- Welche Vorlaufzeiten werden angeboten und welche ist Standard?
- Gilt eine Beobachtung für einen Filmtitel, eine Serie oder auch einzelne Staffeln/Folgen?
- Soll nach verpasster Ausstrahlung automatisch nach dem nächsten Termin gesucht werden?
- Auf welchen Geräten werden Push-Meldungen zugestellt?
- Sind E-Mails standardmäßig aus und nur ausdrücklich aktivierbar?
- Welche Ruhezeiten oder Zusammenfassungen sind nötig?
- Wie werden Mehrfachausstrahlungen, Zeitzonen und kurzfristige EPG-Änderungen behandelt?
- Liegen Beobachtungen auf Konto- oder Profilebene?
- Welche Daten müssen für den serverseitigen Abgleich minimal lesbar bleiben und welche werden verschlüsselt?


### Paket F – #259 Waipu-Live-Deep-Link

- Entspricht die öffentliche `programId` exakt der EPG-UUID im offiziellen Link?
- Welches Sendersegment erwartet Waipu auf Android und Fire TV?
- Öffnet der Link nur die EPG-Detailseite oder startet er bei laufender Sendung tatsächlich den Stream?
- Wie wird bei mehreren gleichzeitig laufenden Ausstrahlungen desselben Titels gewählt?
- Welche Fallbacks gelten bei fehlender App, Anmeldung, Tarifberechtigung oder abgelaufenem Termin?

### Paket G – #260 Senderausbau

- Welche technischen Eintragstypen zählen tatsächlich als lineare Sender?
- Welche Ausbauwellen sind fachlich und hinsichtlich Requestkosten sinnvoll?
- Welche Stabilitätsdauer und Leistungsgrenzen sind vor jeder Hochstufung verbindlich?
- Wie werden regionale Varianten, Umbenennungen, entfernte Sender und echte Dubletten behandelt?
- Welche maximale sichtbare Datenmenge darf Fire TV je Zeitfenster laden und rendern?

## Reihenfolge und Wiedereinstieg

Die bestätigte Reihenfolge lautet jetzt:

`#4 abgeschlossen → #256 Datenfundament → #259 Deep-Link-Verifikation → Triage A/B/D/E → #260 Senderausbau in Wellen → #118 → #7`

Nächster Wiedereinstieg:

1. #4 bleibt vollständig abgenommen und geschlossen;
2. #256 erhält unmittelbar vor der Umsetzung eine kurze technische Scope-Kontrolle gegen den aktuellen Repository-Stand;
3. anschließend wird #256 umgesetzt, geprüft und dokumentiert;
4. danach wird #259 mit dem vorhandenen 50-Sender-Bestand als eigenes Recherche-/Prototyp-Paket verifiziert;
5. anschließend werden die Pakete A, B, D und E sowie die skalierbare TV-Datenladung gemeinsam priorisiert;
6. #260 beginnt erst danach in kontrollierten Senderwellen;
7. jedes weitere Paket beginnt mit seinen noch offenen fachlichen Fragen und klaren Abnahmekriterien.

## Dokumentationsregel für die Fortsetzung

- #254 wird nicht weiter als große Textsammlung ausgebaut.
- #255 ist die Fortsetzung für neue Beobachtungen, Triage und Verlinkung.
- Detailentscheidungen stehen am Ende im jeweiligen Umsetzungsissue, nicht nur im Gespräch.
- Eine vorläufige Annahme wird ausdrücklich als vorläufig markiert.
- Kein Paket beginnt mit offenen Produktentscheidungen, die Matthias nicht erneut gesehen hat.
