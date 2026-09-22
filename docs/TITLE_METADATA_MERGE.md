# Movie Hub – verlustfreie Titelmetadaten

Stand: 20. September 2026

## Kanonischer Zustand

Der veröffentlichte `catalog.json`-Titel ist der kanonische öffentliche Ist-Zustand. Laufzeitquellen dürfen ihn ergänzen, aber vorhandene sinnvolle Werte nicht durch fehlende, leere oder schwächere Werte ersetzen.

Die zentrale Merge-Semantik liegt in `src/catalog/titleMetadata.js` (`mergeEnrichedTitle`). UI-Komponenten enthalten keine eigenen Reparaturregeln.

Die vorgelagerte, rein lesende Zusammenführung der katalogrelevanten Identitäten ist in [Kanonischer Titelkandidatenbestand](TITLE_CANDIDATE_INVENTORY.md) beschrieben. Der Suchindex klassifiziert dabei Search-only-Titel, erweitert aber allein nicht die nächtliche Voranreicherung.

## Inventarisierte Quellen und Wege

| Quelle/Weg | Rolle | Erwartete Vollständigkeit | Merge-Regel |
| --- | --- | --- | --- |
| `catalog.json` | kanonischer öffentlicher Titelbestand | vollständig für veröffentlichte Katalogtitel | Ausgangszustand bleibt erhalten |
| Search-Details / Lazy Search Details | Vorprüfung für Suchtreffer | `discover` und ältere V2-Shards gelten nicht als vollständig belegt | Search-only-Titel werden vor dem Öffnen vollständig geladen; Provider-/Scope-Zuordnung bleibt erhalten |
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

## Verbindlicher Vollständigkeitsvertrag (Version 3)

`metadataComplete: true` ist ab `metadataVersion: 3` nur gültig, wenn `metadataChecks` für alle vorgesehenen Gruppen einen abgeschlossenen Zustand enthält. Zulässige Zustände sind:

| Zustand | Bedeutung | vollständig |
| --- | --- | --- |
| `present` | geprüft und mindestens ein fachlicher Wert vorhanden | ja |
| `absent` | geprüft, TMDB liefert fachlich keinen Wert | ja |
| `unchecked` | noch nicht geprüft | nein |
| `failed` | Prüfung beziehungsweise abhängiger Abruf fehlgeschlagen | nein |

Gemeinsam erforderlich sind `details`, `artwork`, `ageRating`, `credits`, `keywords`, `videos` und `providers`. Filme benötigen zusätzlich `collection`, Serien zusätzlich `seasons`. Eine vorhandene Filmreihen-ID ohne erfolgreich geladene `collectionDetails` bleibt unvollständig.

V2-Datensätze bleiben während der Migration lesbar, erfüllen den strikten Vertrag jedoch nicht. Der nächtliche Datenlauf priorisiert sie zur Nachmigration. Reine Search-only-Titel dürfen aus einem solchen Datensatz keine Detailseite öffnen: Die App öffnet den gemeinsamen Detail-Layer, zeigt darin ausschließlich „Details werden geladen …“, lädt über den gerätelokal verschlüsselten TMDB API Read Access Token nach und wechselt erst nach erfolgreicher V3-Prüfung innerhalb desselben Layers zur vollständigen Detailseite. Auch Fehler und Wiederholen bleiben im Detail-Layer; die Suchseite wird nicht durch einen eigenen ganzseitigen Lade- oder Fehlerzustand ersetzt. Die TMDB-Benutzersitzung ist davon getrennt und wird nur für persönliche Listen, Favoriten und Bewertungen verwendet.

Für Waipu gilt dieselbe Migrationsgrenze: Ein normaler Code-Deploy darf die letzte bereits veröffentlichte und nach dem bisherigen Vertrag vollständige V2-Generation unverändert wiederherstellen. Jede neu erzeugte Waipu-Generation muss dagegen den strikten V3-Vertrag erfüllen, bevor sie veröffentlicht wird. Die Ausnahme ist ausschließlich eine Lesebrücke und erzeugt keine neuen Legacy-Daten.

## Explizites Leeren

Ein fehlender Wert, `null`, leerer Text oder ein leeres Array ist bei einer Ergänzungsquelle grundsätzlich **kein Löschsignal**. Die derzeit definierte Ausnahme ist die Film-Collection:

- `collectionChecked: true` und `collectionId: null` bedeutet fachlich geprüft: Der Film gehört keiner Collection an.
- Ohne `collectionChecked: true` bleiben vorhandene Collection-Daten erhalten.

Weitere Löschsemantiken benötigen künftig ein eigenes geprüftes Statusfeld; implizites Leeren bleibt unzulässig.
