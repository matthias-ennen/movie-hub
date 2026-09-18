# FreeEPG-Import und Qualitätsprüfung

Stand: 18. September 2026

## Zweck

Diese Komponente ist die isolierte Umsetzungsstufe **#4A**. Sie prüft, ob der
deutsche FreeEPG-Feed technisch und zeitlich als Grundlage für einen späteren
Waipu-Live-Katalog geeignet ist.

Der Job schreibt bewusst weder nach Firestore noch in `public/catalog.json`.
Ein fehlerhafter, veralteter oder leerer Feed kann dadurch keine sichtbaren
Movie-Hub-Daten verändern.

## Aufruf

Live-Feed:

```bash
npm run epg:quality
```

Lokale XML- oder GZIP-Datei:

```bash
npm run epg:quality -- --input /pfad/zu/de.xml
```

Optionale Parameter:

```text
--url URL
--output DATEI
--now ISO-ZEITPUNKT
--minimum-future-hours STUNDEN
--target-coverage-days TAGE
```

Die entsprechenden Umgebungsvariablen heißen `FREE_EPG_URL`,
`FREE_EPG_INPUT_PATH`, `FREE_EPG_REPORT_PATH`,
`FREE_EPG_MINIMUM_FUTURE_HOURS` und `FREE_EPG_TARGET_COVERAGE_DAYS`.

## Verarbeitung

1. Der komprimierte Feed wird mit Größenbegrenzung in eine temporäre Datei
   geladen und per SHA-256 identifiziert.
2. GZIP wird anhand der tatsächlichen Dateisignatur erkannt.
3. XMLTV wird als Stream verarbeitet. Die vollständige XML-Datei und die
   vollständige Programmliste werden nicht im Arbeitsspeicher aufgebaut.
4. Sender, normalisierte Sendernamen, Programm-Dubletten, Kategorien,
   Beschreibungen und Film-/Serienkandidaten werden gezählt.
5. Der früheste und späteste Sendetermin werden gegen den Prüfzeitpunkt
   ausgewertet.
6. Ein maschinenlesbarer JSON-Bericht wird erzeugt.

Der Parser begrenzt Downloads auf 200 MiB und entpackte XML-Daten auf 500 MiB.
Zeitangaben ohne Zeitzone und ungültige Start-/Endkombinationen werden im
Bericht separat gezählt.

## Qualitäts-Gate

Der technische Prototyp gilt nur dann als verwendbar, wenn:

- mindestens ein Sender vorhanden ist;
- mindestens ein Programmeintrag vorhanden ist;
- mindestens ein aktuell laufender oder zukünftiger Programmeintrag vorhanden ist;
- der Datenbestand mindestens die nächsten 24 Stunden abdeckt.

Die gewünschte 14-Tage-Abdeckung wird zusätzlich gemessen, ist aber in #4A
noch kein Grund, einen ansonsten aktuellen technischen Testfeed abzulehnen.

Bei einem Qualitätsfehler wird der Bericht trotzdem geschrieben und der Prozess
endet mit Exitcode 2. Dadurch kann GitHub Actions den Lauf sichtbar als
fehlgeschlagen markieren und gleichzeitig den Diagnosebericht als Artefakt
bereitstellen.

## Automatisierung

`.github/workflows/free-epg-quality.yml` führt täglich einen zentralen Abruf
aus und kann zusätzlich manuell gestartet werden. Jeder Lauf veröffentlicht
seinen Bericht für 30 Tage als Workflow-Artefakt. Der Workflow besitzt nur
Leserechte am Repository und keine Firebase-Zugangsdaten.

Eine häufigere produktive Aktualisierung ist Teil von #4E und wird erst
aktiviert, wenn Quelle, Senderabdeckung und Nutzungsrechte tragfähig sind.

## Erster reproduzierter Messstand

Die am 18. September 2026 bereitgestellte `de.xml` wurde erfolgreich vollständig
gestreamt und kontrolliert als **nicht aktuell** abgelehnt:

- 1.262 Sender-Elemente und 1.262 eindeutige IDs;
- 1.242 normalisierte Sendernamen;
- 18 mehrfach vergebenen normalisierte Sendernamen mit 20 zusätzlichen ID-Zuordnungen;
- 178.243 Programmeinträge;
- 113.819 Programme mit Beschreibung;
- 661 explizit kategorisierte Filmkandidaten;
- 3.585 explizit kategorisierte Serienkandidaten;
- Programmzeitraum 7. Oktober 2025 bis 30. Juli 2026;
- keine aktuell laufende oder zukünftige Sendung am Prüfzeitpunkt 18. September 2026.

Der Live-Endpunkt wurde am selben Tag zusätzlich direkt mit dem neuen Job
abgerufen. Er lieferte exakt dieselbe Datei mit der SHA-256-Prüfsumme
`81f858360e1e6553ed49b62dcc6db497a35939e2a67b1c9558d15fc947fea9d7`.
Damit bestätigt der erste Live-Test sowohl den veralteten FreeEPG-Datenstand als
auch das gewünschte Fail-Closed-Verhalten des Imports.
