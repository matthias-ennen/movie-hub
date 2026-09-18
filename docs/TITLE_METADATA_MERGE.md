# Movie Hub – verlustfreie Titelmetadaten

Stand: 18. September 2026

## Kanonischer Zustand

Der veröffentlichte `catalog.json`-Titel ist der kanonische öffentliche Ist-Zustand. Laufzeitquellen dürfen ihn ergänzen, aber vorhandene sinnvolle Werte nicht durch fehlende, leere oder schwächere Werte ersetzen.

Die zentrale Merge-Semantik liegt in `src/catalog/titleMetadata.js` (`mergeEnrichedTitle`). UI-Komponenten enthalten keine eigenen Reparaturregeln.

## Inventarisierte Quellen und Wege

| Quelle/Weg | Rolle | Erwartete Vollständigkeit | Merge-Regel |
| --- | --- | --- | --- |
| `catalog.json` | kanonischer öffentlicher Titelbestand | vollständig für veröffentlichte Katalogtitel | Ausgangszustand bleibt erhalten |
| Search-Details / Lazy Search Details | progressive Detailergänzung für Suchtreffer | je nach Shard `discover` oder `enriched`; Felder können fehlen oder leer sein | über `mergeEnrichedTitle`, Provider-/Scope-Zuordnung des Suchtreffers bleibt erhalten |
| persönliche TMDB-Snapshots | Favorit, Watchlist, Bewertung und Fallback-Metadaten | öffentliche Detailfelder können leer sein | öffentliche Titelbasis zentral mergen, persönliche Zustände danach gezielt übernehmen |
| native TMDB-Anreicherung | vollständigerer Geräte-Fallback | nur bei erfolgreicher vollständiger Antwort autoritativ | über `mergeEnrichedTitle`; ergänzt fehlende Daten und Arrays |
| Movie-Hub-/Shared-Media-Metadaten | lokale Verfügbarkeit plus kompakter Titel-Fallback | Titelkopie kann altern | öffentliche Metadaten bleiben autoritativ; Movie-Hub-Verfügbarkeit wird additiv gesetzt |
| `mergeEnrichedTitle` | zentrale öffentliche Metadaten-Anreicherung | quellunabhängig | monotone, feldspezifische Zusammenführung |
| `mergePublicAndPersonalCatalog` | öffentlicher + persönlicher Katalog | gemischte Zuständigkeiten | nutzt zentralen Merge und setzt nur persönliche Zustände separat |
| `mergeSearchDetail` | Suchindex + Detail-Shard | Detail-Shard kann partiell sein | nutzt zentralen Merge statt eigener Datenregeln |
| `mergeSearchIndexEntries` | öffentlicher + persönlicher Kompaktindex | enthält nur Such-/Providerfelder | öffentliche Suchfelder bleiben kanonisch; persönlicher Scope und Providerzuordnung werden additiv übernommen |
| persönliche Zustands-Snapshots | Fallback für Titel außerhalb des aktuellen Katalogs | bewusst kompakt | werden nur ergänzt, wenn kein kanonischer Katalogtitel derselben Identität existiert |
| Film-Collection-Teile | Collection-Snapshot + vollständiger Katalogtitel | Collection-Teil kann verkürzt sein | vollständiger Katalogtitel gewinnt; kein Laufzeit-Enrichment des kanonischen Titels |

## Feldmatrix

| Felder | Semantik |
| --- | --- |
| Titel / Originaltitel | echter vorhandener Titel bleibt; Platzhalter darf durch echten Titel ersetzt werden |
| Beschreibung | leer löscht nie; längere aussagekräftige Beschreibung darf ergänzen/ersetzen |
| `videos`, `cast`, Genres | stabil dedupliziert zusammenführen; leeres Array löscht nie |
| Poster, Backdrop, `artwork.*Paths` | vorhandene Pfade zuerst behalten, neue Pfade dedupliziert ergänzen |
| Provider-IDs und Angebote | vereinigen; Angebotstypen pro Provider ergänzen; leere Quelle löscht nie |
| Collection | nur `collectionChecked: true` ist autoritativ; damit darf Zugehörigkeit ausdrücklich auf leer gesetzt werden |
| Staffeln / Serienzahlen | Staffeln dedupliziert ergänzen; bekannte positive Gesamtzahlen nicht verringern |
| Altersfreigabe, Sprache, Datum, Laufzeit | vorhandenen gültigen Wert behalten, sonst aus Anreicherung ergänzen |
| Bewertung / Stimmenzahl | Datenstand mit mindestens gleich hoher Stimmenzahl verwenden; Stimmenzahl nicht verringern |
| Metadatenversion / Aktualitätszeit | höchste Version und jüngsten gültigen Zeitstempel behalten |
| Smart-Facets | Cast, Kreative und Keywords dedupliziert ergänzen |
| persönliche Zustände | Favorit, Watchlist, persönliche Bewertung und Reihenfolge nicht aus öffentlichen Metadaten ableiten; separat übernehmen |

## Explizites Leeren

Ein fehlender Wert, `null`, leerer Text oder ein leeres Array ist bei einer Ergänzungsquelle grundsätzlich **kein Löschsignal**. Die derzeit definierte Ausnahme ist die Film-Collection:

- `collectionChecked: true` und `collectionId: null` bedeutet fachlich geprüft: Der Film gehört keiner Collection an.
- Ohne `collectionChecked: true` bleiben vorhandene Collection-Daten erhalten.

Weitere Löschsemantiken benötigen künftig ein eigenes geprüftes Statusfeld; implizites Leeren bleibt unzulässig.
