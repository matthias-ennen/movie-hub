# Movie Hub – TMDB-Anbindung

Stand: 6. September 2026

## Ziel

TMDB liefert die externen Metadaten für Filme und Serien. Zugangsdaten dürfen dabei weder im Git-Repository noch im ausgelieferten Browser-Bundle landen.

## Authentifizierung

Movie Hub verwendet für Anwendungszugriffe den **TMDB API Read Access Token** als Bearer-Token im `Authorization`-Header.

Offizielle TMDB-Dokumentation:
- https://developer.themoviedb.org/docs/authentication-application
- https://developer.themoviedb.org/docs/getting-started

## Sicherheitsregel

Der Token heißt im Movie-Hub-Projekt ausschließlich:

```text
TMDB_API_READ_TOKEN
```

Er darf **nicht** als `VITE_TMDB_*` angelegt werden. Vite-Variablen mit `VITE_` werden für Browser-Code vorgesehen und können deshalb im ausgelieferten Client sichtbar werden.

Erlaubte Speicherorte:
- lokale Prozess-/Shell-Umgebung für vertrauenswürdige Node-Skripte
- GitHub Actions Repository Secret `TMDB_API_READ_TOKEN`

Nicht erlaubt:
- JavaScript/JSX-Dateien
- committed `.env`-Dateien
- Firestore-Dokumente
- Firebase Remote Config
- `VITE_`-Umgebungsvariablen

## Phase-2-Strategie

### Stufe 1 – sicherer Sync/Build-Pfad

Phase 2.1 und zunächst Phase 2.2 verwenden einen vertrauenswürdigen Node-/CI-Pfad:

1. Node-/CI-Prozess liest `TMDB_API_READ_TOKEN`.
2. Der Prozess ruft TMDB serverseitig auf.
3. Die TMDB-Antwort wird über `src/services/tmdb.js` in ein Movie-Hub-internes Modell normalisiert.
4. Spätere Sync-Skripte können daraus cachebare Katalogdaten erzeugen, die der Browser ohne TMDB-Token konsumiert.

Damit bleibt das Secret außerhalb des Frontends.

### Stufe 2 – dynamischer Live-Proxy nur bei Bedarf

Falls Movie Hub später echte serverseitige Live-Suche oder beliebige TMDB-Abfragen zur Laufzeit benötigt, braucht der Browser einen eigenen Backend-/Proxy-Endpunkt. Ein Firebase-Functions-Proxy wäre technisch passend, setzt für die produktive Bereitstellung aber den Firebase-Blaze-Tarif voraus.

Offizielle Firebase-Dokumentation:
- https://firebase.google.com/docs/functions
- https://firebase.google.com/docs/hosting/functions

Diese Infrastrukturentscheidung wird erst getroffen, wenn ein gecachter/synchronisierter Katalog für die gewünschte Funktionalität nicht mehr ausreicht.

## Smoke-Test

Der erste echte API-Test nutzt:

```bash
TMDB_API_READ_TOKEN=<token> npm run tmdb:smoke
```

Optional:

```bash
TMDB_TEST_TYPE=tv TMDB_TEST_ID=1399 TMDB_API_READ_TOKEN=<token> npm run tmdb:smoke
```

Standardmäßig wird ein Film über TMDB v3 mit Sprache `de-DE` abgerufen. Das Skript gibt anschließend ausschließlich die normalisierte Nutzlast aus; der Token wird nicht protokolliert.

## GitHub Actions

Nach dem Merge der Phase-2.1-Grundlage wird in den Repository-Einstellungen ein Actions Secret mit dem Namen `TMDB_API_READ_TOKEN` hinterlegt. Anschließend kann der Workflow **TMDB Smoke Test** manuell gestartet werden. Der Workflow darf niemals den Token ausgeben.

## Attribution

Vor der breiten sichtbaren Nutzung von TMDB-Daten in Phase 2.2 werden die jeweils aktuellen TMDB-Nutzungs- und Attribution-Anforderungen geprüft und in der Oberfläche umgesetzt.

## Automatische Katalogaktualisierung (#53)

Der öffentliche Katalog ist ein täglich neu erzeugtes Hosting-Artefakt. Der Ablauf
läuft in GitHub Actions auf dem Default-Branch:

1. TMDB liefert aktuelle Trend-, Neuheiten- und Popularitätslisten für Filme und Serien.
2. Movie Hub lädt zu den Kandidaten die deutschen Metadaten und die deutsche
   Anbieter-Verfügbarkeit.
3. In den sichtbaren Reihen bleiben nur Titel mit mindestens einem unterstützten
   Anbieter (Netflix, Prime Video, Disney+, YouTube oder waipu.tv).
4. Erst wenn alle Reihen ausreichend gefüllt sind, wird das neue `catalog.json`
   gebaut und gemeinsam mit der Web-App auf Firebase Hosting veröffentlicht.

Der Zeitplan ist täglich um **03:17 UTC**; derselbe Workflow kann bei Bedarf auch
manuell gestartet werden. Schlägt ein Abruf, die Mindestprüfung oder der Build
fehl, wird nichts veröffentlicht. Das bisherige, funktionierende Katalog-Artefakt
bleibt dann live.

Die Auswahlreihen, ihre Titel und ihre Größe liegen als Konfiguration im Generator.
Sie können später geändert oder um weitere TMDB-Quellen erweitert werden, ohne
persönliche Daten umzubauen. Für neue persönliche Zustände wird außerdem eine
kompakte öffentliche Titelkopie gespeichert. Dadurch bleiben Watchlist, Favoriten,
Bewertungen und Notizen sichtbar, auch wenn ein Titel später nicht mehr in den
tagesaktuellen Entdeckungsreihen auftaucht.
