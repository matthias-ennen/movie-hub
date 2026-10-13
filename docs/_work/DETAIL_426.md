# #426 – Detailseite aufräumen und verbessern

Stand: 13.10.2026 · Abgenommen und abgeschlossen, 19:05 Uhr (Europe/Berlin).

## Paketabnahme und Abschluss

Matthias gibt den aktuellen Stand ausdrücklich zum Abschluss frei:
„Das hier kannst du jetzt abschließen.“ Damit ist #426 einschließlich der letzten
Nachbesserung abgeschlossen. Die Paketabnahme ersetzt die weiter unten historisch
dokumentierten offenen Abnahmepunkte. Zusätzliche einzelne Geräteprüfungen werden
daraus nicht abgeleitet. Spätere Schönheitskorrekturen bleiben separate Nacharbeiten.

### Abgenommener Lieferstand

- Gemeinsame Detaildialoge für Filme, Serien und Episoden mit einheitlichem Fokus,
  transparenten Kopfaktionen und passenden Kacheln; bestehende Folgenübersicht erhalten.
- Stift für Links/Videos, Notiz und Gesehen-Datum; Glocke für persönliche Erinnerungen;
  einheitlicher Schließen-Button auch in Folgen- und Filmreihenübersichten.
- Staffel-/Folgenkachel nur bei nutzbarem Episodenbestand. Unklare Folgen bleiben
  ungewählt; manuelle Navigation bleibt erreichbar. Keine erklärenden Hinweise.
- Keine redundante Episodenzeile unter dem Titel oder beim TV-Termin.
  „Wo anschauen?“ zeigt nur Datum, Uhrzeit und Sender; Staffel/Folge stehen in der Kachel.
- Gemeinsamer Import-/Nachtlauf mit sicherer Episodenzuordnung, verifizierten
  englischen TMDB-Aliasnamen, erhaltener Joyn-/Waipu-Quellinformation und Konflikten.
  Kompakte Staffelverfügbarkeit und bedarfsweise Episodenlisten ohne Anbieterabfragen im Client.

### Veröffentlichung und vorhandene Nachweise

Abgenommener Funktionsstand: **`ddd0dbd`**, veröffentlicht über
[PR #434](https://github.com/matthias-ennen/movie-hub/pull/434).
1.029 Anwendungstests, Produktionsbuild und Diff-Prüfung erfolgreich.
[CI](https://github.com/matthias-ennen/movie-hub/actions/runs/38426346459),
[Android](https://github.com/matthias-ennen/movie-hub/actions/runs/38426346113) und
[Hosting](https://github.com/matthias-ennen/movie-hub/actions/runs/38426346073)
sind erfolgreich abgeschlossen.

Der veröffentlichte Datenstand wurde direkt zurückgelesen: 500 Staffeln ergänzt,
100 englische Sprachabgleiche, keine Abruffehler, 600/600 Budgeteinheiten.
19.919 von 29.908 Staffeln sind vorhanden. SVU S16E3 (`Minderjährig` / verifizierter
Alias `Producer's Backend`) ist eindeutig zugeordnet; MONSTER ermöglicht die manuelle
Auswahl seiner 74 Folgen ohne geratene TV-Folge. Bei Richter Alexander Hold fehlt
nutzbarer Folgenbestand, daher entfällt die Kachel. New Tricks hat alle zwölf
Staffeln; ein nicht eindeutig passender TV-Titel bleibt ohne Vorauswahl.

Die erneute automatisierte Browser-Sichtprüfung der letzten Nachbesserung war
technisch blockiert (kein Browser, Download nicht verfügbar); diese Einschränkung
bleibt im Prüfprotokoll erhalten. Die heutige ausdrückliche Paketabnahme schließt
den Lieferumfang ab, ohne zusätzliche Browser- oder Einzelgeräteprüfungen zu behaupten.

### Fortsetzung

**#384 – Auch per E-Mail je Profil** ist das nächste vorgesehene offene Paket.
Die Analyse liegt vor; Umsetzung, Versanddienst-/Absenderwahl und Empfängerregel
sind noch offen. #314 bleibt Master für #384/#385. Dieser Abschluss ändert nur
Dokumentation und Issue-Status; kein App-/Backend-Deploy und kein Beginn von #384.

## Historischer Planungs- und Prüfverlauf

Die folgenden Abschnitte halten die damaligen Zwischenstände fest. Angaben zu
offener Abnahme, zurückgestelltem #384 oder noch folgenden Nachweisen sind durch
den oben dokumentierten Abschluss überholt. Erstfreigabe: 13.10.2026, 11:24 Uhr.

## Umfang

- Gemeinsame Dialoghülle, Kopfaktionen und Fokusregeln für Titel, Episoden
  und Nebenansichten. Neue Details starten auf Schließen; Rückwege erhalten
  Auslöser und Scrollposition. Die Folgenübersicht fokussiert die Auswahl.
- Stift, Glocke und Schließen in einer bleibend erreichbaren Kopfzeile.
  Aktive Glocke: vorhandene Kontur, blauer Akzent und kleines Häkchen.
- Notiz und Gesehen-Datum im Bearbeitungsmenü, daneben eigene Medien.
  Profilwerte und kontoweit gemeinsame Links/Videos bleiben getrennt.
- Eine Staffel-/Folgenkachel mit zwei vollbreiten Auswahlfeldern. Kein
  Zusatzbutton für Folgendetails. Bestehende bebilderte Übersicht erhalten.
- Den konkreten Episodenkontext vom Einstieg bis zur Auswahl erhalten;
  keine Folge aus einem anderen TV-Termin ableiten. Fehlende Daten zeigen.
- Gemeinsamen Stil, Inhalte, Providerregeln, Caches und bedarfsweises Laden
  bewahren. Keine neuen Episodenwerte, Erinnerungstypen oder E-Mails.

## Umsetzungsschritte

1. Kleine gemeinsame Dialog-/Aktionsbausteine sowie einen expliziten,
   normalisierten Episodenkontext einführen.
2. Seriennavigation und Episodenansicht aus dem Hauptbaustein lösen.
3. Bearbeitung und Erinnerungen in eigene Dialoge verschieben, Hauptinhalt
   straffen und Fokus-/Zurückpfade vereinheitlichen.
4. Regressionsprüfungen zu Kontext, asynchronem Laden, Profilwerten,
   aktivem Glockenzustand, Auswahl und Navigation; Browserprüfung mit
   isolierten Datengrenzen in Smartphone- und TV-Breite.
5. CI, Veröffentlichung und Dokumentation. Danach Sicht-/Geräteabnahme
   durch Matthias; diese wird nicht durch Browserprüfungen ersetzt.

## Gelieferter Stand

Gemeinsame Dialoghülle und Kopfaktionen, eigene Bausteine für Bearbeitung,
Erinnerungen, Seriennavigation, Filmreihenauswahl und persönliche Aktionen.
Die große Detailkomponente wurde entsprechend verkleinert; das Feature bleibt
lazy geladen. Veraltete absolute Schließen-Positionierung und der CSS-Ersatztext
des Medien-Speicherbuttons wurden entfernt. Bestehende Speicherpfade,
Verschlüsselung, Daten-Caches und Anbieterstarts bleiben erhalten.

## Technische Prüfungen (13.10.2026)

- `npm run test:unit`: **975 Tests in 158 Dateien bestanden**.
- `npm run build`: erfolgreich; Detailfeature rund 39,18 kB / 12,32 kB gzip,
  Hauptchunk rund 228,55 kB / 68,88 kB gzip. Keine zusätzliche Bibliothek.
- `git diff --check`: ohne Befund.
- Isolierte Chromium-Prüfung mit echten React-Komponenten, Styles und
  D-Pad-Hook; Authentifizierung, Profil-/Medienspeicher und Folgendaten durch
  Testdaten ersetzt. Keine Änderung echter Benutzerdaten.
- TV-Breite 1280 × 720 und Smartphone 390 × 844: konkrete, allgemeine,
  unvollständige, fehlende und leere Staffel-/Folgenkontexte; Vorwahl/Scrollen,
  Ebenen-Zurück und Fokusrückkehr; 45 Tab-Schritte ohne Austritt aus dem Dialog;
  Lade-/Fehleransicht; aktive Glocke; Notiz-/Datums-/Medienspeicherung;
  Entwurf weiterbearbeiten/verwerfen. Keine Browserfehler/Überbreite.
- Staffelwechsel und wiederholtes Öffnen verwenden denselben Shard-Cache:
  im Prüflauf nur eine Episodenabfrage. Kopfzeile auch mit fokussiertem
  Schließen geprüft; keine aus dem Layout springende Taste.

CI-/Android-Build und Hosting-Veröffentlichung werden am PR und in #426
nachgetragen. **Die manuelle Sicht-/Geräteabnahme durch Matthias bleibt offen.**
Kein nativer Code geändert; für diese Oberfläche genügt ein vollständiger
App-Neustart. E-Mail-Paket #384 bleibt zurückgestellt.

## Nachbesserung – Freigabe 13.10.2026, 12:45 Uhr

Matthias: „Bitte alles umsetzen und Feedback“. Der erste Stand ist noch nicht
abgenommen. Verbindliche Korrekturen aus der anschließenden Sammlung:

1. Inhaltsreihenfolge: Titel/Kerndaten, Beschreibung, Besetzung, Staffeln/Folgen
   bzw. Filmreihe, Videos, Wo anschauen, Datenquelle, Meine Einstellungen.
2. Serien- und Filmreihenkachel am selben Platz, beide im gemeinsamen Stil
   von Meine Einstellungen: Rahmen, Fläche, Rundungen, Überschrift, Abstände.
3. Bearbeiten: zwei Kacheln, eigene Links/Videos oben, persönliche Notiz unten;
   Gesehen-Datum bleibt im Menü, Profil-/Kontogrenzen bleiben erhalten.
4. Episodendetails: kompakte Abbildung und gemeinsam scrollender Inhalt im
   Hochformat; Bild links und lesbarer Inhalt rechts im Querformat/auf TV.
5. Transparente Kopfaktionen ohne Hintergrundband/Trennlinie; Inhalt läuft
   dahinter, Überschrift höher und beim Einstieg vollständig sichtbar.
6. Ladeansicht zeigt Stift/Glocke/Schließen an denselben festen Positionen;
   Bearbeiten/Erinnerungen bis zur Bereitschaft deaktiviert, Schließen aktiv
   und fokussiert. Kein Versatz beim Übergang zum fertigen Inhalt.

Umsetzung mit gemeinsamen Layout-/Kachelbausteinen und vorhandener Dialoglogik.
Gezielte Browserprüfung zusätzlich in niedrigen Smartphone-Querformaten,
mit langen Titeln und gescrolltem Inhalt. Keine neuen Datenabfragen/Dienste.
Prüfergebnisse und Veröffentlichung werden nach Umsetzung ergänzt; manuelle
Abnahme bleibt offen.

### Ergebnis der Nachbesserung

- Gemeinsame `DetailLayout`-Geometrie für Laden, Fehler, Film/Serie und Episode;
  transparente Aktionen außerhalb des Scrollbereichs. Auch bei nicht unterstützter
  Glocke behalten die übrigen Aktionen ihre Plätze. Lange Titel nutzen den Platz
  neben und unter den Aktionen. Schließen verdeckt den Titel nicht mit einem Tooltip.
- Gemeinsame `DetailCard` für Meine Einstellungen, Staffeln/Folgen, Filmreihe
  sowie beide Editorbereiche. Frühere Inhaltsreihenfolge wiederhergestellt.
- Veraltete Sonderlayouts und Kachelrahmen ersetzt. Keine neue Abhängigkeit,
  keine Änderung von Speicher-/Anbieterregeln oder Episodendaten.
- `npm run test:unit`: erneut **975 Tests in 158 Dateien bestanden**.
- Produktionsbuild erfolgreich; Detailchunk rund 39,01 kB / 12,38 kB gzip,
  Hauptchunk rund 228,99 kB / 69,03 kB gzip.
- Bestehende isolierte Interaktionsprüfung erneut erfolgreich: Auswahl, Rückwege,
  Fokus, Erinnerungen, Notiz-/Datums-/Medienspeicherung, Entwurfsbehandlung.
- Zusätzliche Layoutprüfung bei 1280 × 720, 844 × 390, 667 × 375 und 390 × 844:
  Inhaltsreihenfolge, identische Kachelflächen, zwei Editor-Kacheln in der richtigen
  Reihenfolge, Filmreihenübersicht, sichtbarer Episodentext, D-Pad-Scrollen und
  unverdeckte lange Titel. Buttonpositionen in Lade-/Fehler-/Titelansicht identisch.
  Transparenz und beim Scrollen unveränderte Buttonpositionen ebenfalls geprüft.
- Screenshots aller vier Größen geprüft; keine Überbreite oder Browserfehler.
  Die Prüfung verwendet Testdaten und ersetzt keine echte Geräteabnahme.

PR, CI und Hosting-Nachweise folgen im Issue #426. Das Issue bleibt bis zur
Abnahme geöffnet. Für diese Nachbesserung ist keine neue APK nötig.

## Episodenkontext – Freigabe 13.10.2026, 13:56 Uhr

Matthias: „Okay umsetzen und Feedback“. Gesammelter Umfang:

- Joyn-Episodenauflösung auch für lokal oder aus dem Match-Cache erkannte Serien,
  mit bestehendem Antwortcache und begrenztem Importbudget; keine App-Abfragen.
- Episodenangaben beim zentralen Zusammenführen derselben Ausstrahlung ergänzen,
  unabhängig von der Anbieterreihenfolge; Nummernkonflikte nicht erraten.
- Konkreten Öffnungskontext ausschließlich mit derselben Ausstrahlung ergänzen;
  Staffel/Folge vorauswählen und vorhandene Folgenübersicht dort öffnen.
- Zusätzliche Episodenzeile unter dem Serientitel entfernen. Handlung bleibt
  unverändert; Angaben zur TV-Ausstrahlung und Auswahl bleiben unten erhalten.
- Schließen in der Folgenübersicht wie auf der Detailseite: gemeinsamer runder
  Button, identische Randabstände, beim Scrollen sichtbar.

Nachgewiesener Fehler: Die veröffentlichten TV-Daten zu „Die Waltons / Das
Vollblut“ enthalten nach Joyn/waipu-Merge nur den Titel. waipu liefert für
dieselbe SAT.1-GOLD-Ausstrahlung am 13.10.2026, 12:45–13:35 Uhr Staffel 3/Folge 3;
der bisherige Merge übernimmt unverändert das erste Episodenobjekt. Der
Joyn-Import überspringt außerdem Episodenauflösung bei bereits erkannten Titeln.

Prüfplan: echte Waltons-Daten, beide Quellreihenfolgen, unvollständige und
widersprüchliche Angaben, allgemeiner Serienaufruf/andere Ausstrahlung,
Joyn-Cache/Budget und Folgenübersicht auf Mobil/TV. Anschließend CI, Deploy und
TV-Datenerneuerung prüfen. Manuelle Abnahme bleibt offen.

### Technische Prüfung der Episodenkorrektur

- 990 Anwendungstests in 160 Dateien erfolgreich; Produktionsbuild und
  `git diff --check` erfolgreich. Keine zusätzliche Abhängigkeit.
- Neuer Importbaustein nach der Titelzuordnung: lokale und gecachte Serien,
  positive/negative Antwortcaches, Budgetende, Wiederholungen, uneindeutige Treffer,
  direkte EPG-Nummern und temporäre Fehler geprüft.
- Echte gespeicherte TV-Indexdaten vom 13.10. erneut durch den Runtime-Aufbau
  verarbeitet: 14 Tage, 7.700 Ausstrahlungen, 2 Nummernkonflikte bleiben unbekannt.
  Waltons/Das Vollblut erreicht unabhängig von der Anbieterreihenfolge S3E3.
- Isolierte Browserprüfung mit echten Komponenten bei 1280×720, 844×390,
  667×375 und 390×844: Waltons-Vorwahl, fokussierte Folge, fehlende Zusatzzeile,
  weiterhin vollständige TV-Zeile, identischer Schließen-Stil und Randabstand,
  feste Buttonposition beim Scrollen und Rückfokus erfolgreich.
- Bestehender Browser-Interaktionslauf erneut erfolgreich: konkrete/allgemeine/
  unvollständige/fehlende Serienkontexte, Zurück/Fokus, TV/Mobil, Erinnerung,
  Notiz/Datum/Medien, Entwürfe, Tab-Begrenzung und Lade-/Fehleransicht.
- Kein nativer Code geändert. Veröffentlichung und einmalige Joyn-Aktualisierung
  werden im Issue nachgewiesen; Geräteabnahme durch Matthias bleibt offen.

## Einheitliche Vorauswahl – Freigabe 13.10.2026, 14:40 Uhr

Matthias: „Umsetzen und Feedback“. Zwei gesammelte Korrekturen:

- Verfügbare Staffel-/Folgenangaben auf allen Einstiegsseiten nutzen. Eine
  ausdrücklich gewählte Folge bleibt vorrangig; ohne konkreten Einstieg wird
  die laufende/nächste Ausstrahlung über denselben Resolver wie die TV-Zeile
  verwendet. Auswahl einmal vor dem Anzeigen vorbereiten, manuelle Änderungen
  erhalten, Konflikte und fehlende Nummern nicht erraten. Keine Zusatzabfragen.
- Filmreihenübersicht: gemeinsamer runder Schließen-Button wie Detailseite und
  Folgenübersicht, gleiche Randabstände und feste Position außerhalb des
  scrollenden Inhalts. Auswahlfokus und Rückweg bleiben erhalten.

Reproduktion: Bei Law & Order: SVU enthält der öffentliche TV-Datensatz für
13.10., 14:10 Uhr, 13th Street korrekt S16E1 „Verschwundene Mädchen“. Allgemeiner
Serienaufruf erzeugt bislang dennoch eine leere Vorauswahl. Konkreter TV-Einstieg
funktioniert. Geprüft werden beide Wege, fehlende/partielle/widersprüchliche und
abgelaufene Angaben sowie manuelle Auswahl, Rückfokus und Filmreihen-X in vier
Bildschirmgrößen. Keine Änderung an Import, Nachtlauf oder persönlichen Daten.

### Technisches Ergebnis

- Gemeinsame Detailvorbereitung nutzt für allgemeine Serienaufrufe denselben
  TV-Resolver wie die Terminzeile. Konkrete Einstiege und manuelle Auswahl bleiben
  erhalten; kein zusätzlicher Netzabruf und keine neue Abhängigkeit.
- Filmreihen- und Folgenübersicht teilen `DetailActions` und dieselben
  CSS-Randabstände; der Schließen-Button liegt außerhalb der scrollenden Liste.
- **999 Anwendungstests in 160 Dateien erfolgreich**, Produktionsbuild und
  Diff-Prüfung erfolgreich. Regressionen umfassen allgemeine/konkrete Einstiege,
  veralteten Metadaten-Cache, abgelaufene/partielle/widersprüchliche Angaben.
- Browserprüfung mit echten Komponenten bei 1280×720, 844×390, 667×375 und 390×844:
  SVU S16E1 über beide Einstiege, fokussierte Folge, manuelle Folgen-/Staffelwahl,
  identische Schließen-Geometrie und -Gestaltung, feste Position beim Scrollen,
  Fokusrückkehr und keine Überbreite/Browserfehler. Screenshots kontrolliert.
- Bestehende Detail-/Editor-/Erinnerungsprüfung auf TV-Breite und Mobil erneut
  erfolgreich. Keine echten Benutzerdaten geändert; physische Geräteabnahme offen.
- CI/Android/Veröffentlichung werden in #426 nachgewiesen. App-Neustart genügt,
  keine neue APK und kein Datenimport für diese Korrektur erforderlich.

## Gemeinsamer Sendungsbezug und Episodenzuordnung – 13.10.2026, 15:33 Uhr

Freigabe: Matthias „Okay. Umsetzen und auf dem laufenden halten“.
Ausgangspunkt main 217d579; vorherige Geräteprüfung zeigt verbleibende Fehler.

- See No Evil/Ladykracher: gewählte Folge und unabhängig ermittelter frühester
  TV-Termin gehören zu unterschiedlichen Ausstrahlungen.
- Hubert/Richter: regionale bzw. andere Einstiegssender ohne Episodendaten;
  keine Übernahme einer fremden Ausstrahlung allein aufgrund der Serien-ID.
- Yu-Gi-Oh!: TV S4E21 entspricht dem vorhandenen TMDB S1E165; Anbieterzählung
  muss als Herkunft erhalten bleiben, Episodennavigation kanonisch zugeordnet.
- New Tricks/Richter: Staffelgenerator muss zusätzlich die TV-Serien aus den
  Quellen berücksichtigen. Fehlende Staffeln vor normaler Altersauffrischung.

Zielstruktur: kompakte geprüfte Episodenzuordnung im veröffentlichten TV-Vertrag,
Originalangaben erhalten; ein Resolver für angeklickte/laufende/nächste Sendung,
Vorauswahl und manuelle Episoden-/Staffelauswahl. Mehrdeutige Zuordnungen bleiben
sichtbar offen. Kein Titel-Hardcoding, keine Anbieterabfragen in der App.
Datenlauf: vorhandenen Staffelgenerator nach Quellenimport ausführen, TV-Serien
aufnehmen, vorhandene Shards erhalten, Budget/Fehler/fehlende Daten berichten.

Prüfpunkte: alle Screenshot-Fälle, abweichende Zählweisen, gleiche Folgentitel,
Anbieterreihenfolge, fehlende Kataloge, Sendungsablauf, manuelle Auswahl,
Lazy-Folgenübersicht/Fokus und Rückwege; Veröffentlichung mit Datenaufbereitung.
Technische Prüfung und manuelle Abnahme getrennt; Issue bleibt geöffnet.

### Umsetzung und Prüfung der gemeinsamen Episodenzuordnung

- Eine konkrete Ausstrahlung steuert Auswahl, TV-Zeile und Anbieterwege. Ein
  allgemeiner Einstieg folgt laufendem/nächstem Termin. Manuelle Auswahl bleibt
  erhalten und zeigt nur zugehörige bekannte TV-Termine; kein fremder Rückfall.
- Gemeinsame Katalogzuordnung vor Veröffentlichung beider TV-Datenformen.
  Exakte Nummern/Titel oder eindeutiger Titel bei vollständigem Staffelbestand;
  kein unscharfer Titelabgleich, keine titelbezogenen Sonderregeln. Originale
  Anbieterzählung bleibt neben der geprüften TMDB-Episodenreferenz erhalten.
- Vorhandene Staffelverarbeitung nach Import verlegt, TV-Serien ergänzt und
  fehlende TV-Staffeln priorisiert. Standardbudget 600, kein zweiter Staffeljob
  im Nachtlauf. `[episode-refresh]` ermöglicht die gezielte Erstergänzung.
- Nachtlaufbericht enthält offene TV-Staffeln und pro Anbieter vollständige
  Zuordnungszahlen sowie Kataloglücken, fehlende Angaben, Konflikte und Mehrdeutigkeiten.
- Neue Regressionen verwenden die Screenshot-Konstellationen einschließlich
  See No Evil, Ladykracher, Hubert, Yu-Gi-Oh!, Waltons und New Tricks; außerdem
  Pipeline-Transport, Konflikterhalt, Zeitwechsel und manuelle Auswahl.
- Echte veröffentlichte Datenauszüge im isolierten Browser bei 1280×720,
  844×390, 667×375 und 390×844 geprüft: Ladykracher S5E9, Yu-Gi-Oh! S1E165,
  Hubert S10E7 mit richtiger Übersicht und Fokus; See No Evil Folge 8 mit
  23-Uhr-Termin; New Tricks mit ehrlicher Kataloglücke vor Datenaufbau.
  Automatischer Zeitwechsel und manuelle Auswahl erhalten konsistenten Zustand.
  Drei bedarfsweise Episodenabfragen pro Seitenladung, keine Vorabladung.
- Bestehende Browserprüfung für Details, Erinnerungen, Notiz/Datum/Medien,
  Lade-/Fehlerfokus und Rückwege erneut erfolgreich. Keine echten Nutzerdaten geändert.

CI, gezielte Datenvervollständigung und Veröffentlichung werden anschließend in
#426 dokumentiert. Eine physische Geräteabnahme wird nicht behauptet.

Abschließende lokale Prüfung: **1.011 Tests in 161 Dateien erfolgreich**,
Produktionsbuild erfolgreich, `git diff --check` ohne Befund. Detailfeature
35,69 kB / 11,41 kB gzip, Hauptchunk 236,08 kB / 71,02 kB gzip.

### Produktionsprüfung und gezielte Ergänzung

PR #432 / Build 2a07dd9 veröffentlicht; CI, Android und Hosting-Prüfung grün.
600 Staffeln ergänzt, 0 Abruffehler. New Tricks ist mit 12 Staffeln vorhanden;
TMDB liefert dort aber nur generische Folgentitel, sodass ein alleiniger
EPG-Titel ohne Nummer nicht zuverlässig zugeordnet werden kann.

Zwei aus der Produktionsprüfung abgeleitete Korrekturen vor Abschluss:
- Generische Katalogtitel wie „Folge 8“ sind kein Widerspruch zu einem
  vorhandenen TV-Titel bei passenden Staffel-/Folgennummern. Die Navigation
  behält den aussagekräftigen TV-Titel und die geprüfte Episoden-ID.
- Innerhalb fehlender TV-Staffeln aktuelle/nächste Ausstrahlungen priorisieren,
  statt lediglich nach Serien-ID aufzufüllen. Unbekannte/abweichende Staffel
  benötigt den gesamten Staffelbestand; Budget und Cache bleiben erhalten.

Prüfung: generische Titel versus echte Titelkonflikte, abgelaufene Sendungen,
Staffelpriorität bei knappen Budgets und erneute Veröffentlichung/Live-Prüfung.

Ergänzungen umgesetzt: **1.014 Anwendungstests bestanden**, gezielte Prüfung
nach der Prioritätspräzisierung ebenfalls grün; Produktionsbuild erfolgreich.
Browserprüfung in allen vier Größen wiederholt, nun einschließlich Auswahl
und Fokus der tatsächlich veröffentlichten See-No-Evil-Folge 8. New Tricks zeigt
den offenen Titelabgleich zutreffend; Zeitwechsel und manuelle Auswahl bestehen.

## Ruhige Oberfläche und Sprachabgleich – Freigabe 13.10.2026, 17:29 Uhr

Matthias beauftragt die abschließende Nachbesserung mit laufenden Rückmeldungen.
Keine Zuordnungs-/Leerhinweise in der Staffel-/Folgenkachel oder Folgenübersicht.
Ohne nutzbare Daten entfällt die gesamte Kachel. Vorhandene Folgen bleiben manuell
wählbar; nur zuverlässig erkannte Episoden werden vorgewählt. Eine einzelne Staffel
wird nicht als konkrete TV-Folgenzuordnung interpretiert.

Zusatz 17:31 Uhr: Die TV-Zeile unter „Wo anschauen?“ endet nach dem Sender.
Staffel, Folge und Folgentitel stehen ausschließlich in der Auswahlkachel.

Umsetzung:
- Kleine verfügbare Staffelübersicht aus den tatsächlich veröffentlichten Episoden
  im vorhandenen Manifest; einmal je Sitzung zwischengespeichert. Episodenlisten
  bleiben bedarfsweise geladen, keine Anbieterabfragen im Client.
- Gemeinsamer Abgleich mit verifizierten englischen Titeln je TMDB-Episoden-ID
  sowie rein formalen Teilbezeichnungen. Bedarfsbezogene englische Staffelabrufe
  im vorhandenen 600er-Budget, gecacht; keine titelbezogenen Sonderregeln.
- Joyn-/Waipu-Feldtransport und Zusammenführung prüfen; keine fremden Ausstrahlungen
  als Ersatz und keine Nummern aus dem bloßen Serientitel ableiten.
- Hinweise und redundante TV-Episodenzeile entfernen, Auswahlzustände/Fokus und
  Rückwege in vier Bildschirmgrößen prüfen; danach CI, Veröffentlichung, Nachweise.

Andere Einstellungs-/Hilfeseiten bleiben ein eigener Sammelpunkt. Manuelle
Sicht-/Geräteabnahme bleibt offen; keine neue APK erforderlich.

### Umsetzung und Prüfung

- Staffelverfügbarkeit aus nichtleeren veröffentlichten Episodenlisten im Manifest.
  Ein geteilter Abruf pro Sitzung, parallel zu den Titeldetails; nach drei Sekunden
  oder Fehlern Rückfall auf vorhandene Metadaten und erneuter Versuch möglich.
- Keine Zuordnungs-, Leer- oder Ersatzbeschreibungshinweise mehr in der
  Staffel-/Folgennavigation. Fehlender Bestand blendet die gesamte Kachel aus;
  unklare Episoden bleiben ungewählt, nutzbare Staffeln bleiben erreichbar.
- Die TV-Zeile endet nach dem Sender. Kein zweiter Episodentitel unter dem
  Haupttitel oder in der Ausstrahlungszeile.
- Englische TMDB-Titel werden anhand identischer Episoden-ID und Nummern als
  Aliase erhalten. Formale Endungen „Teil 1“/„Part 1“/„(1)“ werden vereinheitlicht;
  verschiedene Teile bleiben verschieden. Kein Fuzzy-Matching.
- Bis zu 100 benötigte englische Staffelabrufe innerhalb des bestehenden
  600er-Budgets; geprüfte Staffeln bleiben 30 Tage gecacht. Sprachabgleiche
  werden im Workflowbericht dokumentiert, nicht in der Benutzeroberfläche.
- Joyn und Waipu liefern vorhandene Felder weiter. Ein im Joyn-Abgleich
  erkannter Nummernkonflikt bleibt jetzt auch im neutralen Broadcastvertrag
  erhalten, statt beim Übergang verloren zu gehen. Keine zusätzlichen
  Anbieterabfragen durch den Client.

Prüfung: 1.026 Anwendungstests in 164 Dateien sowie drei zusätzliche
Renderprüfungen der tatsächlichen Detailseite erfolgreich (insgesamt 1.029).
Produktionsbuild und `git diff --check` erfolgreich. Geprüft sind insbesondere
Sprach-ID-Abgleich, Teilnummern, Mehrdeutigkeit, Cache, fehlender Staffelbestand,
TV-Text ohne Redundanz und das gemeinsame Abrufbudget.

Einschränkung: Die erneute visuelle Vier-Größen-Prüfung war in dieser Umgebung
nicht möglich: kein installierter Browser; der offizielle Browserdownload
lieferte eine „Site Unavailable“-HTML-Antwort statt des Browserarchivs. Deshalb
wird weder eine neue Browser-Sichtprüfung noch eine Geräteabnahme behauptet.
Fokus-/Layout-Komponenten wurden nicht verändert. CI-/Veröffentlichungsnachweise
und Prüfung des veröffentlichten Datenbestands folgen im Issue #426.
