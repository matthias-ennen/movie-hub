# Movie Hub – kanonische Titel-Prioritätswarteschlange

Stand: 20. September 2026

## Aktuelle Stufe: read-only Vorschau

Die erste Warteschlangenstufe berechnet ausschließlich, welche kanonischen Titel warum bearbeitet würden. Sie ruft TMDB nicht auf, verändert keine Firestore-Dokumente und veröffentlicht keine Metadaten. Erst die Auswertung eines realen Laufs entscheidet über die spätere Aktivierung der schreibenden Verarbeitung.

Eingang ist die in [Kanonischer Titelkandidatenbestand](TITLE_CANDIDATE_INVENTORY.md) definierte, über `Medientyp + TMDB-ID` deduplizierte Menge. Search-only-Titel und ungeklärte Waipu-Programme bleiben ausgeschlossen.

## Prioritäten

| Rang | Klasse | Bedeutung |
| ---: | --- | --- |
| 1 | `incomplete-or-failed` | mindestens eine katalogrelevante Zielreferenz erfüllt V3 nicht oder enthält einen fehlgeschlagenen Prüfzustand |
| 2 | `new-catalog-relevant` | Identität war im letzten erfolgreichen Kandidatenzustand noch nicht vorhanden |
| 3 | `tmdb-changed` | Identität liegt in der persistenten TMDB-Änderungsmenge |
| 4 | `structural-gap` | Filmreihe beziehungsweise Serienstruktur ist nicht vollständig geprüft |
| 5 | `stale` | vorhandene vollständige Metadaten sind nach dem 30-Tage-Umlauf fällig |

Ein Titel erhält genau einen Queue-Eintrag mit der höchsten zutreffenden Priorität. Alle zutreffenden Gründe bleiben am Eintrag erhalten. Die Vorschau weist `duplicateQueueEntries` aus; dieser Wert muss null bleiben.

## TMDB-Abruf oder Wiederverwendung

Eine unvollständige Zielreferenz löst nicht automatisch einen neuen TMDB-Abruf aus. Existiert in einer anderen Quelle bereits eine frische vollständige V3-Kopie derselben Identität, wird sie als kanonische Basis wiederverwendet und später nur an die unvollständigen Zielmitgliedschaften weitergegeben.

Ein neuer TMDB-Detailabruf ist in der Vorschau nur erforderlich, wenn keine frische vollständige Kopie vorhanden ist oder TMDB die Identität als geändert gemeldet hat. Damit bleibt die technische Obergrenze bei höchstens einem Detailabruf pro Identität und Lauf.

## Zustand und Datenschutz

`artifacts/title-candidate-state.json` speichert zwischen erfolgreichen Läufen ausschließlich die sortierten kanonischen Schlüssel und den Erzeugungszeitpunkt. Dadurch werden neue und entfallene Kandidaten erkennbar. Der Zustand enthält keine Benutzer-ID, keinen Firestore-Pfad und keinen persönlichen Listenstatus.

`artifacts/title-priority-preview.json` enthält die internen Queue-Einträge für denselben Workflow. Hochgeladen und im kompakten Laufbericht angezeigt wird nur `artifacts/title-priority-preview-summary.json` mit aggregierten Zählern.

Fehlt beim ersten Lauf der Kandidaten-Basisstand oder bei einem Code-Deploy das TMDB-Changes-Artefakt, wird das ausdrücklich als `baselineAvailable: false` beziehungsweise `changeSetAvailable: false` ausgewiesen. Fehlend wird nicht als leer interpretiert.

## Kapazität

Die Vorschau verwendet im Standardlauf 800 und im beschleunigten Lauf 2.000 Plätze. Sie weist ausgewählte Einträge und Rückstand getrennt aus. Diese Grenze steuert in der aktuellen Stufe noch keine Schnittstellenaufrufe.

## Nächste Aktivierungsbedingung

Vor dem schreibenden Betrieb müssen mindestens folgende Punkte belegt sein:

- null Queue-Dubletten;
- nachvollziehbare Größen je Priorität;
- belastbare Trennung zwischen notwendigem TMDB-Abruf und Wiederverwendung;
- sichtbarer Rückstand bei überschrittener Kapazität;
- vollständiger Kandidaten-Basisstand aus einem vorherigen erfolgreichen Lauf;
- vorhandenes TMDB-Changes-Artefakt im planmäßigen Datenlauf.
