# Movie Hub – TMDB-Anbindung

Stand: 13. September 2026

## Ziel

TMDB liefert die externen Metadaten für Filme und Serien sowie – nach persönlicher Anmeldung – die Favoriten und Watchlist des verbundenen TMDB-Kontos. Zugangsdaten dürfen dabei weder im Git-Repository noch im ausgelieferten Browser-Bundle landen.

## Zwei getrennte TMDB-Zugänge

### Zentraler Standardkatalog

Der öffentliche Movie-Hub-Katalog wird zentral erzeugt. Dieser technische Anwendungszugang verwendet den **TMDB API Read Access Token** aus dem GitHub Actions Repository Secret:

```text
TMDB_API_READ_TOKEN
```

Für persönliche Smart-Reihen normalisiert derselbe Katalogjob zusätzlich Credits, Keywords, Film-Collections und Jahrzehnte. Pro Titel werden nur numerische Filterfacetten veröffentlicht; Namen und optionale Personenbilder liegen dedupliziert in einem Katalogverzeichnis für die lokale Vorschlagsliste. Dadurch benötigt die Web-App auch für diese Funktion keinen direkten TMDB-Zugriff.

Der zentrale Token darf **nicht** als `VITE_TMDB_*` angelegt werden. Vite-Variablen mit `VITE_` sind für Browser-Code vorgesehen und können im ausgelieferten Client sichtbar werden.

Erlaubte Speicherorte für den zentralen Token:
- lokale Prozess-/Shell-Umgebung für vertrauenswürdige Node-Skripte
- GitHub Actions Repository Secret `TMDB_API_READ_TOKEN`

Nicht erlaubt:
- JavaScript/JSX-Dateien
- committed `.env`-Dateien
- Firestore-Dokumente
- Firebase Remote Config
- `VITE_`-Umgebungsvariablen

Offizielle TMDB-Dokumentation:
- https://developer.themoviedb.org/docs/authentication-application
- https://developer.themoviedb.org/docs/getting-started

### Persönliche TMDB-Verbindung (#87)

Zusätzlich kann auf jedem Android-/Fire-TV-Gerät eine persönliche TMDB-Verbindung eingerichtet werden:

1. persönlicher **API Read Access Token** wird nativ geprüft und verschlüsselt per Android Keystore/AES-GCM gespeichert,
2. TMDB-Benutzername und Passwort werden nur für den direkten TMDB-v3-Login verwendet,
3. aus dem Login wird eine **TMDB Session-ID** erzeugt,
4. die Session-ID wird verschlüsselt gerätelokal gespeichert,
5. das Passwort wird nach der Anmeldung verworfen und nie dauerhaft gespeichert.

Die TMDB-Verbindung ist geräteweit und wird von allen Movie-Hub-Profilen auf diesem Gerät gemeinsam genutzt. API-Token und Session-ID werden niemals an JavaScript/WebView, Firestore oder Logs ausgegeben.

## Öffentlicher Katalog als JSON-Artefakt (#53)

Der öffentliche Standardkatalog ist ein täglich neu erzeugtes Hosting-Artefakt `public/catalog.json`. Der Ablauf läuft in GitHub Actions auf dem Default-Branch:

1. TMDB liefert aktuelle Trend-, Neuheiten- und Popularitätslisten für Filme und Serien.
2. Movie Hub lädt zu den Kandidaten die deutschen Metadaten und die deutsche Anbieter-Verfügbarkeit.
3. In den sichtbaren Reihen bleiben nur Titel mit mindestens einem unterstützten Anbieter (Netflix, Prime Video, Disney+, YouTube oder waipu.tv).
4. Erst wenn alle Reihen ausreichend gefüllt sind, wird das neue `catalog.json` gebaut und gemeinsam mit der Web-App auf Firebase Hosting veröffentlicht.

Für Filme mit `belongs_to_collection` ruft derselbe vertrauenswürdige Job jede eindeutige Collection-ID zusätzlich einmal über `/collection/{id}` ab. Der daraus erzeugte kompakte Filmreihen-Index enthält sämtliche gemeldeten Teile und ermöglicht die Navigation auf der Detailseite auch dann, wenn ein Teil nicht im begrenzten Browse-Katalog vorkommt. Ein vorübergehend fehlgeschlagener Collection-Abruf verwirft nicht den gesamten Anbieterkatalog: Movie Hub gruppiert in diesem Fall mindestens die bereits bekannten Katalogmitglieder. Im Browser erfolgen keine direkten TMDB-Collection-Aufrufe.

Vollständige Titelabfragen laden außerdem bis zu drei geeignete Poster und drei Querformatbilder. Poster werden bevorzugt sprachneutral gewählt; deutsche und englische Bilder dienen als geordnete Rückfallebene. Der Generator prüft Bildformat und TMDB-Bewertung, speichert jedoch nur TMDB-Pfade beziehungsweise abgeleitete Bild-URLs. Die profilbezogene tägliche, wöchentliche oder deaktivierte Rotation wird anschließend deterministisch im Client berechnet und erzeugt keine zusätzlichen API-Aufrufe.

Der Zeitplan ist täglich um **03:17 UTC**; derselbe Workflow kann bei Bedarf auch manuell gestartet werden. Schlägt ein Abruf, die Mindestprüfung oder der Build fehl, wird nichts veröffentlicht. Das bisherige funktionierende Katalog-Artefakt bleibt dann live.

Normale Code- und Dokumentations-Pushes erzeugen keinen neuen TMDB-Datenbestand. Sie laden den zuletzt veröffentlichten, validierten Hauptkatalog und Suchindex sowie die vollständigen Suchdetail- und Serienstaffel-Shards zurück und bauen die Anwendung gegen genau diesen Datenstand. Ist eines dieser Live-Artefakte nicht erreichbar oder ungültig, wird das Deployment abgebrochen; es wird weder der Platzhalter aus dem Repository noch ein unvollständiger Ersatzbestand veröffentlicht. Neue TMDB-Daten entstehen ausschließlich im planmäßigen Nachtlauf, im manuellen Datenlauf oder über einen ausdrücklich mit `[waipu-refresh]` markierten Notfall-Refresh.

Die Auswahlreihen, ihre Titel und ihre Größe liegen als Konfiguration im Generator. Sie können später geändert oder um weitere öffentliche TMDB-Quellen erweitert werden, ohne persönliche Daten umzubauen.

## Persönlicher TMDB-Katalog in Firestore (#90)

Der persönliche TMDB-Katalog ist **kein zweites `catalog.json`**. Er verändert sich je Firebase-Konto und wird deshalb als strukturierte, nicht geheime Firestore-Daten gespeichert:

```text
users/{uid}/tmdbCatalog/{mediaType:tmdbId}
users/{uid}/tmdbSync/state
```

Die vorhandene native TMDB-Session liest:
- Favoriten · Filme
- Favoriten · Serien
- Watchlist · Filme
- Watchlist · Serien

Alle Seiten werden geladen und Titel über `TMDB-ID + Medientyp` dedupliziert. Ein Dokument kann gleichzeitig `favorite: true` und `watchlist: true` tragen. Entfernt TMDB bei einer späteren Synchronisierung eine Zuordnung, wird nur diese Katalogzuordnung aktualisiert; profilbezogene Movie-Hub-Zustände werden nicht gelöscht.

Der native Android-Teil darf an die Web-App ausschließlich bereinigte Katalogfelder übergeben, beispielsweise TMDB-ID, Typ, Titel, Beschreibung, Posterpfad, Genre, öffentliche Provider-IDs und Favorit-/Watchlist-Zuordnung. Firestore Security Rules begrenzen den persönlichen Katalog zusätzlich auf eine feste Feldliste, sodass dort keine TMDB-Secrets gespeichert werden dürfen.

Bei jeder persönlichen Synchronisierung werden vollständige Titeldetails einschließlich Bildkandidaten und geprüftem Sammlungsstatus geladen. Gehört ein Film zu einer Reihe, wird deren Teileliste je eindeutiger Collection-ID nur einmal pro Lauf abgerufen und kompakt am Titel referenziert. Damit funktionieren Filmreihen auch für Titel, die ausschließlich durch TMDB-Favoriten oder Watchlist in Movie Hub gelangt sind.

Die Web-App liest diese Firestore-Dokumente und erzeugt daraus zur Laufzeit die Reihen **TMDB Favoriten** und **TMDB Watchlist**. Existiert derselbe Titel bereits im öffentlichen `catalog.json`, wird er anhand von TMDB-ID und Typ zusammengeführt statt als zweite Filmkopie behandelt.

Der breite Suchkatalog entsteht weiterhin aus kostengünstigen Discover-Antworten. Da diese Antworten keine verlässliche Sammlungszugehörigkeit und keine vollständige Bildauswahl enthalten, reichert der Nachtlauf inkrementell standardmäßig bis zu 800 Suchdetails an. Bereits angereicherte Detail-Shards werden vor der Neuerzeugung wiederhergestellt. Fehlende oder unvollständige Datensätze werden zuerst verarbeitet. Danach folgen vollständige Details, die mindestens 30 Tage alt sind. Bei diesen fälligen Datensätzen haben fehlende Collection- oder Staffelinformationen Vorrang, anschließend gilt der älteste Stand zuerst. Frisch geprüfte optionale Lücken werden nicht täglich erneut geladen. `TMDB_SEARCH_DETAIL_ENRICH_LIMIT` und `TMDB_SEARCH_DETAIL_MAX_AGE_DAYS` steuern Kapazität und Fälligkeit, ohne sämtliche Suchtreffer täglich neu abzurufen.

Für #256 ist die TMDB-Änderungswarteschlange in den nächtlichen und manuellen Datenlauf eingebunden. Sie liest die offiziellen Film- und Serien-Änderungslisten vollständig über alle Ergebnisseiten, zerlegt längere Nachholzeiträume in zulässige Fenster von höchstens 14 Tagen und führt neue IDs mit den Änderungen der letzten 30 Tage zusammen. Suchdetails, Serienstaffeln, Waipu-Metadaten, Movie-Hub-Titel und persönliche TMDB-Katalogtitel priorisieren diese IDs vor dem normalen 30-Tage-Umlauf.

Der letzte erfolgreiche Changes-Checkpoint wird über einen versionierten Workflow-Cache in den nächsten Datenlauf übernommen. Jeder Lauf erzeugt zunächst nur `state.next.json`. TMDB-Katalog, Waipu-Katalog, Movie-Hub-Metadaten, persönliche TMDB-Metadaten und die abschließende Firebase-Veröffentlichung müssen ihren erfolgreichen Anteil separat bestätigen. Erst wenn alle fünf Bestätigungen vorliegen, wird der vorbereitete Stand als `state.json` festgeschrieben. Bei Abruf-, Anreicherungs-, Build- oder Veröffentlichungsfehlern bleibt der vorige Checkpoint unverändert; der nächste erfolgreiche Lauf holt den Zeitraum erneut mit Überlappung nach. Normale Code-Pushes lesen oder verändern diese Warteschlange nicht.

## Staffel- und Folgenkatalog (#178)

Vollständige TV-Titeldetails liefern kompakte Staffelzusammenfassungen mit Staffelnummer, Titel, Episodenzahl, Beschreibung, Ausstrahlungsdatum und Posterpfad. Diese kleinen Daten bleiben direkt am Serienobjekt und werden auch in den lazy Search-Details erhalten. Specials mit Staffelnummer 0 werden in der ersten Navigationsstufe nicht angezeigt.

Episodenobjekte werden bewusst nicht in `catalog.json` oder den breiten Suchindex aufgenommen. Der vertrauenswürdige Katalogjob erzeugt stattdessen unter `public/series-details/` 256 deterministische Shards. Jede Serie liegt anhand ihrer TMDB-ID in genau einem Shard; die Web-App lädt ihn erst beim Öffnen der Folgenauswahl und hält ihn anschließend im Arbeitsspeicher. Vor einem Lauf wird der letzte gültige Live-Stand wiederhergestellt. Standardmäßig werden höchstens 600 fehlende oder ältere Staffeln pro Lauf über `/tv/{series_id}/season/{season_number}` aktualisiert; `TMDB_SERIES_SEASON_ENRICH_LIMIT` und `TMDB_SERIES_SEASON_MAX_AGE_DAYS` steuern Grenze und Alter.

Alle Abrufe erfolgen mit dem zentralen TMDB-Token ausschließlich in GitHub Actions. Der Browser erhält nur öffentliche, cachebare JSON-Daten und enthält weder den zentralen noch einen persönlichen TMDB-Schlüssel. Alte Kataloge ohne `seasons` bleiben kompatibel; die Seriennavigation wird dann nicht eingeblendet.

## Movie-Hub-Anbieterkatalog (#181)

Eigene Links und Videos definieren eine kontoweite, benutzerspezifische Anbieterzugehörigkeit. Nach dem Laden des persönlichen Movie-Hub-Katalogs ergänzt die Web-App unvollständige Titel in kleinen Paketen aus den veröffentlichten Detail-Shards und schreibt sie mit den normalen Rechten des angemeldeten Kontos in die kompakte Firestore-Titelreferenz zurück. Ist ein veröffentlichter Detaildatensatz selbst noch unvollständig, kann die Android-/Fire-TV-App den einzelnen Titel nativ mit dem verschlüsselt gerätelokal gespeicherten TMDB-Token laden. Token und Session verlassen den nativen Prozess nicht; an die WebView gelangen nur bereinigte Titel-, Bild-, Anbieter- und Collection-Metadaten. Beim Öffnen eines Titels wird dieselbe Hydrierung nochmals unmittelbar versucht. Die Zuordnung erfolgt robust über Medientyp und TMDB-ID, auch wenn ein älterer Eintrag noch eine abweichende interne ID besitzt.

Als optionale zweite Schutzschicht durchsucht der vertrauenswürdige Datenlauf ausschließlich die übergeordneten `sharedMedia`-Manifestdokumente nach fehlenden, veralteten oder unvollständigen Metadaten. Ein normaler Code-Push führt diesen Backfill nicht aus. Der Datenlauf ruft vollständige TMDB-Titeldetails und bei Filmen einmal je Collection die Teileliste ab. Links, Videoadressen und darunter liegende `entries` werden weder gelesen noch verändert. Standardmäßig werden höchstens 250 Kandidaten pro Lauf verarbeitet und vollständige Daten nach 30 Tagen erneut geprüft; beide Grenzen sind über `MOVIE_HUB_METADATA_BACKFILL_LIMIT` und `MOVIE_HUB_METADATA_MAX_AGE_DAYS` konfigurierbar. Für die Ausführung benötigt das Deployment-Dienstkonto zusätzlich eine Firestore-Datenrolle; fehlt sie, bleibt die profilgebundene Selbstheilung der funktionale Hauptweg und das Hosting-Deployment wird nicht blockiert.

Der Job verwendet die bereits für Firebase Deployment konfigurierte Workload Identity und den CI-seitigen TMDB-Token. Es entsteht kein TMDB-Schlüssel im Browser und keine dauerhafte Schlüsseldatei im Repository.

Damit bedeutet **Katalog** in Movie Hub fachlich eine Sammlung beziehungsweise Katalogzugehörigkeit – nicht zwingend eine einzelne Datei. Der öffentliche Katalog ist wegen seines gemeinsamen Snapshot-Charakters eine JSON-Datei; der persönliche Katalog ist wegen seiner nutzerbezogenen Veränderlichkeit eine Firestore-Collection. Spätere Anbieterkataloge können abhängig von Quelle und Aktualisierungsart ebenfalls als generierte Snapshots oder strukturierte Datenhaltung umgesetzt werden, solange sie in dasselbe Movie-Hub-Titelmodell normalisiert werden.

## Phase-2-Strategie

### Stufe 1 – sicherer Sync/Build-Pfad

Der zentrale Katalog verwendet einen vertrauenswürdigen Node-/CI-Pfad:

1. Node-/CI-Prozess liest `TMDB_API_READ_TOKEN`.
2. Der Prozess ruft TMDB serverseitig auf.
3. Die TMDB-Antwort wird über `src/services/tmdb.js` in ein Movie-Hub-internes Modell normalisiert.
4. Sync-Skripte erzeugen daraus cachebare Katalogdaten, die der Browser ohne TMDB-Token konsumiert.

### Stufe 2 – dynamischer Live-Proxy nur bei Bedarf

Falls Movie Hub später beliebige serverseitige Live-Suche oder andere nicht gerätelokal abdeckbare TMDB-Abfragen benötigt, braucht der Browser einen Backend-/Proxy-Endpunkt. Ein Firebase-Functions-Proxy wäre technisch passend, setzt für die produktive Bereitstellung aber den Firebase-Blaze-Tarif voraus. Diese Infrastrukturentscheidung wird erst getroffen, wenn gecachte beziehungsweise synchronisierte Kataloge nicht mehr ausreichen.

## Smoke-Test

Der zentrale API-Test nutzt:

```bash
TMDB_API_READ_TOKEN=<token> npm run tmdb:smoke
```

Optional:

```bash
TMDB_TEST_TYPE=tv TMDB_TEST_ID=1399 TMDB_API_READ_TOKEN=<token> npm run tmdb:smoke
```

Das Skript gibt ausschließlich die normalisierte Nutzlast aus; der Token wird nicht protokolliert.

## Attribution

Vor der breiten sichtbaren Nutzung von TMDB-Daten werden die jeweils aktuellen TMDB-Nutzungs- und Attribution-Anforderungen geprüft und in der Oberfläche umgesetzt.
