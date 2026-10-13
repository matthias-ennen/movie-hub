# #426 – Detailseite aufräumen und verbessern

Stand: 13.10.2026 · Umsetzung durch Matthias um 11:24 Uhr freigegeben.

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
