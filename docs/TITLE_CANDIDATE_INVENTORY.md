# Movie Hub – kanonischer Titelkandidatenbestand

Stand: 20. September 2026

## Zweck und Abgrenzung

Der erste Konsolidierungsschritt von #256 ist bewusst rein lesend. Er führt alle katalogrelevanten Titelreferenzen unter dem Schlüssel `Medientyp:TMDB-ID` zusammen und macht Überschneidungen, Dubletten, reine Suchtreffer und ungeklärte Waipu-Zuordnungen messbar.

Dieser Schritt startet noch keine TMDB-Abrufe, verändert keine Firestore-Dokumente und veröffentlicht keine neuen öffentlichen Titeldaten. Die spätere Prioritätswarteschlange wird auf diesem geprüften Bestand aufbauen.

## Quellen

| Quelle | Kandidat für Voranreicherung | Regel |
| --- | --- | --- |
| Browse-/Anbieterkatalog (`public/catalog.json`) | ja | jeder gültige Film oder jede gültige Serie |
| persönlicher TMDB-Katalog (`users/*/tmdbCatalog/*`) | ja | nur gültige Benutzerdokumente; Favorit, Watchlist und Bewertung bleiben privat und werden nicht inventarisiert |
| Movie Hub (`users/*/sharedMedia/*`) | ja | nur gültige Eltern mit `hasMedia: true`; Links und Benutzerzuordnung werden nicht ausgegeben |
| Waipu-Live-Titel (`public/waipu-live/titles.json`) | ja | nur bereits eindeutig nach TMDB aufgelöste Titel |
| großer Suchindex (`public/search-index.json`) | nein, sofern keine andere Quelle denselben Titel enthält | dient nur zur Abgrenzung von Search-only-Titeln |
| ungeklärte Waipu-Programme | nein | eigener Diagnosebestand; keine geschätzte TMDB-ID |

## Artefakte

- `artifacts/title-candidate-inventory.json` enthält die vollständige kanonische Kandidatenmenge für nachfolgende Schritte im selben geschützten Workflow. Es wird weder öffentlich ausgeliefert noch als GitHub-Artefakt hochgeladen.
- `artifacts/title-candidate-inventory-summary.json` enthält ausschließlich Zähler, Quellenstatistik und Überschneidungen. Nur dieser datensparsame Bericht wird für 30 Tage als Workflow-Artefakt aufbewahrt und in den kompakten Laufbericht aufgenommen.
- `artifacts/waipu-live/unresolved.json` enthält die im aktuellen Waipu-Lauf fachlich akzeptierten, aber nicht eindeutig TMDB-zugeordneten Programme. Sie bleiben außerhalb der Kandidatenmenge.

Das vollständige Inventar enthält keine Benutzer-ID, keinen Firestore-Pfad, keinen persönlichen TMDB-Zustand und keinen Movie-Hub-Link. Der hochgeladene Kurzbericht enthält zusätzlich keine einzelnen Titelidentitäten.

## Zählersemantik

`rawCandidateReferences` zählt alle gültigen Referenzen der vier Kandidatenquellen. `canonicalCandidates` ist deren Vereinigungsmenge. Die Differenz ist `deduplicatedReferences`. `overlappingCandidates` zählt Titel, die in mehr als einer Quelle vorkommen.

`searchOnlyTitles` zählt gültige Suchindex-Titel, deren kanonische Identität in keiner Kandidatenquelle vorkommt. Sie werden weiterhin erst beim Öffnen vollständig geladen. `unresolvedWaipu.programs` zählt aktuelle Waipu-Programme ohne belastbare TMDB-Zuordnung; dieser Wert ist kein Titelbestand und wird ausdrücklich getrennt ausgewiesen.

## Nächster Schritt

Nach einem erfolgreichen realen Inventarlauf werden die beobachteten Größen und Überschneidungen geprüft. Erst danach wird aus derselben kanonischen Menge eine deduplizierte Prioritätswarteschlange aufgebaut: unvollständig/fehlgeschlagen, neu katalogrelevant, durch TMDB geändert, strukturelle Lücke und altersbedingt fällig. Pro Titel und Lauf darf dabei höchstens ein TMDB-Detailabruf entstehen.
