# Movie Hub – Suchindex

Stand: 11. September 2026

## Zweck

Die Movie-Hub-Suche wird von den sichtbaren Browse-Katalogen getrennt. Home, Filme und Serien dürfen weiterhin kuratierte bzw. begrenzte vollständige Titelobjekte verwenden; die Suche erhält dagegen einen eigenen kompakten Datenbestand, der später auf zehntausende Einträge wachsen kann.

Bezug: GitHub-Issue #114.

## Phase 1 – technische Trennung

Der bestehende TMDB-Katalogjob erzeugt nach `public/catalog.json` zusätzlich `public/search-index.json`.

Der Suchindex enthält pro Titel nur die für Suche und Ergebnisdarstellung benötigten Felder:

- Movie-Hub-ID
- TMDB-ID
- Typ (`movie` / `series`)
- Titel und Originaltitel
- Jahr
- Poster-URL
- kompakte Akzentwerte für die bestehende Posterkarte
- Provider-IDs
- strukturierte Provider-Angebotsarten einschließlich `flatrate`, `free`, `ads`, `rent` und `buy`
- normalisierten Suchtext

Nicht im Suchindex liegen insbesondere Beschreibung, Cast, Videos, Backdrops, Laufzeit und sonstige vollständige Detaildaten.

## Client-Verhalten

- `/search-index.json` wird erst von der Suchansicht geladen.
- Bei leerer Suche werden keine tausenden Poster mehr gerendert.
- Suche beginnt ab mindestens zwei Zeichen.
- Maximal 60 Treffer werden gleichzeitig gerendert; die vollständige Trefferzahl bleibt bekannt.
- Öffentliche Treffer respektieren die kontoweite Provider-Auswahl aus #113.
- Persönliche TMDB-Titel bleiben unabhängig von der Provider-Auswahl suchbar.
- Ist der separate Suchindex vorübergehend nicht erreichbar, verwendet die App den bereits geladenen öffentlichen Katalog als begrenzten Fallback.

## Veröffentlichung und Fehlerschutz

`npm run tmdb:catalog` erzeugt Katalog und Suchindex gemeinsam. Bei einem fehlgeschlagenen frischen Kataloglauf auf einem Code-Deploy wird neben dem letzten gültigen `catalog.json` auch der letzte gültige `search-index.json` wiederverwendet. Existiert bei der ersten Einführung noch kein veröffentlichter Suchindex, wird er aus dem wiederhergestellten Katalog abgeleitet.

## Noch nicht Bestandteil von Phase 1

Phase 1 vergrößert den Datenbestand noch nicht auf 15.000–30.000 Titel. Der Index wird zunächst aus dem aktuellen öffentlichen Katalog abgeleitet. Damit werden Format, Client-Suche, Providerfilterung, Ergebnisbegrenzung und Deployment-Schutz eingeführt, bevor der Datenumfang stark wächst.

Die folgenden Schritte unter #114 sind anschließend:

1. Suchindex unabhängig vom Browse-Katalog mit deutlich mehr TMDB-Provider-Titeln befüllen.
2. `rent`-/`buy`-only-Titel gezielt in den großen Index aufnehmen.
3. vollständige Detaildaten für Treffer außerhalb des Browse-Katalogs erst beim Öffnen nachladen und cachen.
4. Indexaktualisierung inkrementell bzw. rollierend gestalten, statt sämtliche Detaildaten täglich neu aufzulösen.
5. Performance mit großer Testmenge auf Fire TV, Smartphone und Tablet messen.

## Architekturprinzip

Der Suchindex ist keine zweite Quelle der Wahrheit für vollständige Filmdaten. Er ist ein schlanker Finder. TMDB-ID + Medientyp bleiben die stabile Identität; vollständige Metadaten werden weiterhin separat behandelt und in einer späteren #114-Phase bei Bedarf geladen bzw. gecacht.
