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
