# Movie Hub – kanonische Titel-Prioritätswarteschlange

Stand: 20. September 2026

## Aktuelle Stufe: zentraler Executor

Die erste Warteschlangenstufe wurde in Deploy Firebase #350 und #351 read-only verifiziert. Lauf #351 wies 3.193 Kandidaten, 1.212 Queue-Einträge, 0 Queue-Dubletten und 0 Einträge außerhalb der beschleunigten Kapazität aus. Damit ist die schreibende Stufe aktiviert.

Der zentrale Executor löst zunächst sämtliche ausgewählten Identitäten vollständig auf. Erst wenn jede ausgewählte Identität einen gültigen V3-Datensatz besitzt, beginnt der Fan-out an Browse-Katalog, vorhandene katalogrelevante Suchdetails, Waipu-Titel, persönliche TMDB-Kataloge und Movie-Hub-Titelreferenzen. Schlägt ein notwendiger Abruf oder die V3-Prüfung fehl, beginnt kein Fan-out und die öffentliche Generation wird nicht veröffentlicht.

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

Eine unvollständige Zielreferenz löst nicht automatisch einen neuen TMDB-Abruf aus. Existiert in einer anderen Quelle bereits eine frische vollständige V3-Kopie derselben Identität, wird sie als kanonische Basis wiederverwendet und an die unvollständigen Zielmitgliedschaften weitergegeben.

Ein neuer TMDB-Detailabruf ist nur erforderlich, wenn keine frische vollständige Kopie vorhanden ist oder keine Quellkopie die gemeldete TMDB-Änderung bereits verarbeitet hat. Persistente Änderungs-IDs werden über `lastSeen` gegen `metadataUpdatedAt` geprüft: Eine mindestens gleich neue Kopie gilt als verarbeitet und wird nicht erneut geladen. Damit bleibt die technische Obergrenze bei höchstens einem Detailabruf pro Identität und Lauf.

## Zustand und Datenschutz

`artifacts/title-candidate-state.json` speichert zwischen erfolgreichen Läufen ausschließlich die sortierten kanonischen Schlüssel und den Erzeugungszeitpunkt. Dadurch werden neue und entfallene Kandidaten erkennbar. Der Zustand enthält keine Benutzer-ID, keinen Firestore-Pfad und keinen persönlichen Listenstatus.

`artifacts/title-priority-preview.json` enthält die internen Queue-Einträge für denselben Workflow. Hochgeladen und im kompakten Laufbericht angezeigt wird nur `artifacts/title-priority-preview-summary.json` mit aggregierten Zählern.

Fehlt beim ersten Lauf der Kandidaten-Basisstand oder bei einem Code-Deploy das TMDB-Changes-Artefakt, wird das ausdrücklich als `baselineAvailable: false` beziehungsweise `changeSetAvailable: false` ausgewiesen. Fehlend wird nicht als leer interpretiert.

## Kapazität

Die Queue verwendet im Standardlauf 800 und im beschleunigten Lauf 2.000 Plätze. Sie weist ausgewählte Einträge und Rückstand getrennt aus. Nur die ausgewählten Identitäten werden vom Executor verarbeitet.

## Schreib- und Veröffentlichungsschutz

Für den schreibenden Betrieb gelten:

- null Queue-Dubletten und höchstens eine Auflösung je Identität;
- alle ausgewählten kanonischen Datensätze müssen vor dem Fan-out den V3-Vertrag erfüllen;
- Wiederverwendung und TMDB-Abrufe werden getrennt gezählt;
- persönliche Zustände wie Favorit, Watchlist und Bewertung bleiben beim Fan-out erhalten;
- Waipu-Ausstrahlungen und quellenspezifische Anbieterzuordnungen bleiben erhalten;
- öffentliche Dateien werden vor dem Produktions-Build aktualisiert und nur über den geschützten Firebase-Deploy veröffentlicht;
- der TMDB-Checkpoint wird weiterhin erst nach allen Verbraucherbestätigungen und erfolgreicher Veröffentlichung fortgeschrieben.
