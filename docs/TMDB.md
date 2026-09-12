# Movie Hub – TMDB-Anbindung

Stand: 12. September 2026

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

Der Zeitplan ist täglich um **03:17 UTC**; derselbe Workflow kann bei Bedarf auch manuell gestartet werden. Schlägt ein Abruf, die Mindestprüfung oder der Build fehl, wird nichts veröffentlicht. Das bisherige funktionierende Katalog-Artefakt bleibt dann live.

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

Die Web-App liest diese Firestore-Dokumente und erzeugt daraus zur Laufzeit die Reihen **TMDB Favoriten** und **TMDB Watchlist**. Existiert derselbe Titel bereits im öffentlichen `catalog.json`, wird er anhand von TMDB-ID und Typ zusammengeführt statt als zweite Filmkopie behandelt.

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
