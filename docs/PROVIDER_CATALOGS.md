# Movie Hub – Anbieterkataloge

Stand: 10. September 2026

## Ziel

Movie Hub trennt künftig drei Dinge konsequent voneinander:

1. **Katalogzugehörigkeit** – warum ein Titel in Movie Hub sichtbar ist.
2. **Metadaten** – Titel, Poster, Beschreibung, Cast usw. aus TMDB.
3. **Wiedergabeverfügbarkeit** – welche automatischen Anbieterbuttons bei einem Titel aktuell verfügbar sind.

Ein Titel kann gleichzeitig in mehreren Katalogen vorkommen, wird intern aber weiterhin nur über TMDB-ID + Medientyp identifiziert.

## Persönlicher TMDB-Katalog

Der persönliche TMDB-Katalog bleibt kontobezogen in Firestore:

```text
users/{uid}/tmdbCatalog/{movie-123|tv-456}
users/{uid}/tmdbSync/state
```

Er wird aus den persönlichen TMDB-Favoriten und Watchlists synchronisiert. Diese Daten sind nutzerspezifisch und deshalb bewusst nicht Teil des öffentlichen Anbieter-Katalogs.

## Öffentliche Anbieterkataloge

Netflix, Prime Video, Disney+, YouTube und waipu.tv werden als öffentliche, zentral erzeugte Kataloge geführt.

Produktentscheidung:

- bis zu **100 Filme je Anbieter**
- bis zu **100 Serien je Anbieter**
- auf Home pro Anbieter **20 gemischte Titel**
- Film- und Serienkataloge bleiben intern getrennt
- waipu.tv bedeutet in diesem Paket ausschließlich **Waiputhek / VOD**
- Live-TV / EPG ist ausdrücklich nicht Bestandteil dieses Pakets

Die Anbieterkataloge werden nicht unter `users/{uid}` in Firestore dupliziert. Sie werden vom bestehenden vertrauenswürdigen CI-/TMDB-Job erzeugt und zusammen mit dem öffentlichen Movie-Hub-Katalog ausgeliefert.

## Öffentliche Katalogstruktur

Der generierte Katalog enthält zusätzlich `providerCatalogs`:

```json
{
  "providerCatalogs": {
    "netflix": {
      "id": "netflix",
      "label": "Netflix",
      "homeTitle": "Beliebt auf Netflix",
      "movieTitle": "Filme auf Netflix",
      "seriesTitle": "Serien auf Netflix",
      "movieIds": ["tmdb-movie-..."],
      "seriesIds": ["tmdb-series-..."],
      "homeIds": ["tmdb-series-...", "tmdb-movie-..."],
      "movieCount": 100,
      "seriesCount": 100
    }
  }
}
```

Die IDs referenzieren dieselben Titelobjekte im zentralen `titles`-Bestand. Ein Film, der gleichzeitig bei Netflix und Prime auftaucht, wird nicht zweimal als eigener Film gespeichert; nur seine Katalogmitgliedschaften werden mehrfach referenziert.

## Automatische Erzeugung

Der Job ermittelt für Deutschland zunächst die aktuellen TMDB-Watch-Provider-IDs. Dadurch hängt Movie Hub nicht unnötig von fest eingetragenen Provider-Nummern ab.

Anschließend werden je Anbieter und Medientyp populäre verfügbare Titel über TMDB Discover ermittelt. Es werden maximal 100 Filme und 100 Serien aufgenommen. Die Kandidaten werden über TMDB-ID + Typ dedupliziert und anschließend mit Metadaten, Cast, Videos und den verfügbaren Providerinformationen aufgelöst.

Wenn derselbe Titel über mehrere Anbieter gefunden wird, werden die Provider-Mitgliedschaften zusammengeführt.

Der bestehende Deploy-Schutz bleibt erhalten: Schlägt die Katalogerzeugung transient fehl, soll der zuletzt erfolgreich veröffentlichte Katalog live bleiben, statt einen unvollständigen Stand zu publizieren.

### Kein Demo-Fallback mehr

Die App enthält keine fest eingebauten Beispiel-Filme oder Beispiel-Serien mehr. Der lokale Client-Fallback ist absichtlich leer. Öffentliche Inhalte kommen ausschließlich aus dem automatisch erzeugten `/catalog.json`; persönliche TMDB- und Movie-Hub-Daten werden unabhängig davon zur Laufzeit ergänzt.

Kann der öffentliche Katalog vorübergehend nicht geladen werden, werden deshalb keine veralteten Demo-Kacheln eingeblendet. Der letzte erfolgreich veröffentlichte Live-Katalog bleibt serverseitig durch den Deploy-Schutz erhalten.

## Benutzeroberfläche

### Home

Reihenfolge:

1. persönliche Movie-Hub-Reihen
2. persönlicher TMDB-Katalog
3. Anbieterreihen
4. allgemeine Entdeckungsreihen

Die Anbieterreihen enthalten je bis zu 20 Filme und Serien gemischt und verwenden kurze redaktionelle Titel, beispielsweise:

- Beliebt auf Netflix
- Highlights bei Prime Video
- Entdecken auf Disney+
- Gefragt auf YouTube
- Aus der waiputhek

### Filme

Der Hauptreiter **Filme** zeigt getrennte Anbieterreihen, beispielsweise „Filme auf Netflix“ oder „Filme bei Prime Video“. Je Anbieter können dabei bis zu 100 Filme enthalten sein.

### Serien

Der Hauptreiter **Serien** funktioniert entsprechend mit getrennten Serienreihen. Filme und Serien werden dort ausdrücklich nicht gemischt.

Titel, die keinem der öffentlichen Anbieter-Kataloge zugeordnet sind – beispielsweise ausschließlich persönliche TMDB-Titel – bleiben über eine zusätzliche Movie-Hub-Reihe erreichbar.

### Suche und Details

Die Suche arbeitet über den zusammengeführten Titelbestand und findet dadurch auch Titel aus den großen Anbieter-Katalogen.

Die Detailansicht bleibt fachlich unabhängig von der Katalogzugehörigkeit. Die automatischen Anbieterbuttons werden weiterhin aus den Verfügbarkeitsdaten des Titels bestimmt; eigene Links und Videos bleiben ausschließlich unter dem Movie-Hub-Button.

## Firestore

Für die öffentlichen Anbieter-Kataloge werden in diesem Paket **keine neuen Firestore-Collections** angelegt.

Firestore bleibt für persönliche bzw. kontobezogene Daten zuständig. Dadurch entstehen keine fünffachen Kopien derselben öffentlichen Katalogdaten pro Nutzer und keine unnötigen Firestore-Lese-/Schreibkosten.

Eine spätere schnell aktualisierte Datenquelle, beispielsweise für echtes waipu.tv-Live-TV/EPG, kann unabhängig davon als eigener öffentlicher Feed oder Cache ergänzt werden.

## Datenquelle und Attribution

Film- und Seriendaten sowie Watch-Provider-Daten werden über TMDB bezogen. Die Watch-Provider-Daten basieren auf der TMDB-Partnerschaft mit JustWatch. Movie Hub weist deshalb sowohl auf TMDB als auch auf JustWatch hin.

## Abnahme #78

Für die technische Abnahme sind insbesondere zu prüfen:

- CI und Android-Build grün
- Kataloggenerator erzeugt die Anbieterbestände erfolgreich
- keine fest eingebauten Demo-Titel oder Demo-Reihen mehr im Client
- Home zeigt die Anbieterreihen nach den persönlichen Reihen
- Home-Reihen enthalten maximal 20 gemischte Titel
- „Filme“ und „Serien“ zeigen getrennte Anbieterreihen
- Suche findet Titel aus den erweiterten Katalogen
- Detailansicht und Providerbuttons bleiben funktionsfähig
- D-Pad-Navigation auf Fire TV bleibt stabil
- Smartphone- und Tablet-Darstellung bleibt nutzbar

Issue #78 wird erst nach der manuellen Geräteabnahme geschlossen.
