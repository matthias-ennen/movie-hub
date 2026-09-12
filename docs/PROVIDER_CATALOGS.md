# Movie Hub – Anbieterkataloge

Stand: 12. September 2026

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

## Virtueller Anbieter Movie Hub

Movie Hub steht in der kontoweiten Anbieterauswahl an erster Stelle und ist standardmäßig aktiviert. Im Unterschied zu den öffentlichen Drittanbietern entsteht sein Katalog ausschließlich aus den eigenen Links und Videos des Kontos:

```text
users/{uid}/sharedMedia/{type-tmdbId}
users/{uid}/sharedMedia/{type-tmdbId}/entries/{entryId}
```

Der übergeordnete Datensatz ist ein automatisch gepflegtes Manifest. Mindestens ein gültiger Eintrag bedeutet Katalogmitgliedschaft; das Löschen des letzten Eintrags entfernt sie. Filme und Serien werden über Medientyp + TMDB-ID dedupliziert. Die App baut daraus **Bei Movie Hub verfügbar**, **Filme bei Movie Hub** und **Serien bei Movie Hub**. Diese persönlichen Daten werden niemals in den öffentlichen Katalog geschrieben.

## Angebotsarten: Browse-Katalog und Suche sind getrennt

TMDB/JustWatch kann einen Titel je Anbieter mit unterschiedlichen Angebotsarten melden. Movie Hub behält diese strukturiert als `offerTypes` am Anbieterangebot:

- `flatrate` – im Abo enthalten
- `free` – kostenlos verfügbar
- `ads` – kostenlos/enthalten mit Werbung
- `rent` – nur leihbar
- `buy` – nur kaufbar

Für die **sichtbaren Anbieter-Kataloge und Home-Reihen** werden bewusst nur `flatrate`, `free` und `ads` berücksichtigt. Ein Film, der bei Amazon oder YouTube ausschließlich gekauft oder geliehen werden kann, soll nicht so wirken, als sei er Bestandteil eines Prime-/YouTube-Abokatalogs.

`rent` und `buy` werden deshalb nicht verworfen. Sie bleiben als Verfügbarkeitsattribute relevant und werden im geplanten großen Suchindex (#114) ausdrücklich mit berücksichtigt. Ein Rent-/Buy-only-Titel soll später über die Movie-Hub-Suche auffindbar sein und den Providerbutton erhalten. Movie Hub zeigt zunächst keine redundanten Preise oder Kauf-/Leih-Zwischenabfrage; der Providerbutton öffnet direkt den Anbieter, der dort die aktuellen Konditionen anzeigt.

## Öffentliche Katalogstruktur

Der generierte Katalog enthält zusätzlich `providerCatalogs`:

```json
{
  "providerCatalogs": {
    "netflix": {
      "id": "netflix",
      "label": "Netflix",
      "browseOfferTypes": ["flatrate", "free", "ads"],
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

Anschließend werden je Anbieter und Medientyp populäre verfügbare Titel über TMDB Discover ermittelt. Die Browse-Abfrage setzt explizit `with_watch_monetization_types=flatrate|free|ads`. Es werden maximal 100 Filme und 100 Serien aufgenommen. Die Kandidaten werden über TMDB-ID + Typ dedupliziert und anschließend mit Metadaten, Cast, Videos und den verfügbaren Providerinformationen aufgelöst.

Wenn derselbe Titel über mehrere Anbieter gefunden wird, werden die Provider-Mitgliedschaften zusammengeführt. Die detaillierten Providerangebote eines Titels dürfen weiterhin zusätzlich `rent`/`buy` enthalten; diese Attribute bestimmen aber nicht die Aufnahme in eine Browse-Reihe.

Der bestehende Deploy-Schutz bleibt erhalten: Schlägt die Katalogerzeugung transient fehl, soll der zuletzt erfolgreich veröffentlichte Katalog live bleiben, statt einen unvollständigen Stand zu publizieren.

### Kein Demo-Fallback mehr

Die App enthält keine fest eingebauten Beispiel-Filme oder Beispiel-Serien mehr. Der lokale Client-Fallback ist absichtlich leer. Öffentliche Inhalte kommen ausschließlich aus dem automatisch erzeugten `/catalog.json`; persönliche TMDB- und Movie-Hub-Daten werden unabhängig davon zur Laufzeit ergänzt.

Kann der öffentliche Katalog vorübergehend nicht geladen werden, werden deshalb keine veralteten Demo-Kacheln eingeblendet. Der letzte erfolgreich veröffentlichte Live-Katalog bleibt serverseitig durch den Deploy-Schutz erhalten.

## Benutzeroberfläche

### Home

Reihenfolge:

1. Movie-Hub-Anbieterreihe, sofern eigene Inhalte vorhanden und der Anbieter aktiv ist
2. öffentliche Anbieterreihen
3. allgemeine Entdeckungsreihen
4. persönliche Movie-Hub-Reihen
5. persönlicher TMDB-Katalog

Die öffentlichen Anbieterreihen kuratieren je bis zu 20 Filme und Serien aus ihrem vollständigen verfügbaren Kandidatenpool und verwenden kurze redaktionelle Titel, beispielsweise:

- Beliebt auf Netflix
- Highlights bei Prime Video
- Entdecken auf Disney+
- Gefragt auf YouTube
- Aus der waiputhek

### Filme

Der Hauptreiter **Filme** zeigt getrennte Anbieterreihen, beispielsweise „Filme auf Netflix“ oder „Filme bei Prime Video“. Je Anbieter können dabei bis zu 100 Filme enthalten sein.

### Serien

Der Hauptreiter **Serien** funktioniert entsprechend mit getrennten Serienreihen. Filme und Serien werden dort ausdrücklich nicht gemischt.

Titel mit eigenen Links oder Videos erscheinen zuerst in **Filme bei Movie Hub** beziehungsweise **Serien bei Movie Hub**. Ausschließlich persönliche TMDB-Titel bleiben unabhängig davon in ihren persönlichen Reihen erreichbar.

### Suche und Details

Die heutige Suche arbeitet noch über den zusammengeführten geladenen Titelbestand. Die spätere nahezu vollständige Suche wird in #114 als eigener skalierbarer Index umgesetzt. Dort sollen neben `flatrate/free/ads` auch `rent/buy` berücksichtigt und vollständige Detaildaten erst bei Bedarf geladen/gecached werden.

Die Detailansicht bleibt fachlich unabhängig von der Katalogzugehörigkeit. Die automatischen Drittanbieterbuttons werden weiterhin aus den Verfügbarkeitsdaten des Titels bestimmt; eigene Links und Videos bleiben ausschließlich unter dem Movie-Hub-Button. Ist Movie Hub deaktiviert, wird dieser Wiedergabebutton ausgeblendet, während die Verwaltung der Einträge erhalten bleibt.

## Provider-Auswahl

Die kontoweite Auswahl der sichtbaren Streaminganbieter stammt aus #113 und umfasst mit #170 zusätzlich Movie Hub. Der zentrale öffentliche Gesamtkatalog wird dafür nicht pro Nutzer neu erzeugt; die Nutzerwahl filtert den gemeinsamen Datenbestand und die private Movie-Hub-Katalogsicht.

## Profilbezogene Kuratierung

#171 trennt Kandidatenmenge und sichtbares Reihenlimit. Flexible Anbieter-, Kategorie-, Entdeckungs- und Smart-Reihen werden je Profil ausgewogen, nach Beliebtheit, Aktualität, belastbarer Bewertung oder stärkerer Entdeckungsvariation sortiert. Optional wechselt die Logik täglich oder wöchentlich. Die Berechnung ist innerhalb der Periode stabil und funktioniert ohne strukturelle Änderung weiter, wenn spätere Pakete den öffentlichen Datenbestand vergrößern.

## Firestore

Für die öffentlichen Anbieter-Kataloge werden in diesem Paket **keine neuen Firestore-Collections** angelegt.

Firestore bleibt für persönliche bzw. kontobezogene Daten zuständig. Dadurch entstehen keine fünffachen Kopien derselben öffentlichen Katalogdaten pro Nutzer und keine unnötigen Firestore-Lese-/Schreibkosten.

Eine spätere schnell aktualisierte Datenquelle, beispielsweise für echtes waipu.tv-Live-TV/EPG, kann unabhängig davon als eigener öffentlicher Feed oder Cache ergänzt werden.

## Datenquelle und Attribution

Film- und Seriendaten sowie Watch-Provider-Daten werden über TMDB bezogen. Die Watch-Provider-Daten basieren auf der TMDB-Partnerschaft mit JustWatch. Movie Hub weist deshalb sowohl auf TMDB als auch auf JustWatch hin. Die vollständige rechtliche/Compliance-Prüfung vor öffentlicher Verteilung wird in #112 geführt.

## Abnahme #78

Für die technische Abnahme sind insbesondere zu prüfen:

- CI und Android-Build grün
- Kataloggenerator erzeugt die Anbieterbestände erfolgreich
- Browse-Katalogabfragen berücksichtigen nur `flatrate`, `free`, `ads`
- `rent`/`buy` bleiben als strukturierte Providerattribute erhalten, führen aber nicht allein zur Browse-Katalogmitgliedschaft
- keine fest eingebauten Demo-Titel oder Demo-Reihen mehr im Client
- Home zeigt die Anbieterreihen nach den persönlichen Reihen
- Home-Reihen enthalten maximal 20 gemischte Titel
- „Filme“ und „Serien“ zeigen getrennte Anbieterreihen
- Suche findet Titel aus den derzeit geladenen erweiterten Katalogen
- Detailansicht und Providerbuttons bleiben funktionsfähig
- D-Pad-Navigation auf Fire TV bleibt stabil
- Smartphone- und Tablet-Darstellung bleibt nutzbar

Issue #78 wird erst nach der manuellen Geräteabnahme geschlossen.

Folgepakete: #113 Provider-Auswahl, #114 großer Suchindex, #112 Compliance/Veröffentlichung.
