# MovieHub YouTube – gemeinsamer Titelbestand und interner Kandidaten-Checkpoint

Stand: 24. Oktober 2026. Gilt für den bereits existierenden YouTube-Adapter,
den Nightly-/Firebase-Deploy und sämtliche MovieHub-Benutzerkonten.

## Architektur und Zuständigkeiten

**Gemeinsame MovieHub-Titel:** Filme und Serien werden systemweit über den
kanonischen Schlüssel `movie:<tmdbId>` bzw. `series:<tmdbId>`
identifiziert. TMDB-Filmdaten, der YouTube-Quellenadapter, die FREE- und
Rent-&-Buy-Playlists sowie bestätigte gemeinsame Provider-Verfügbarkeiten
gehören zur **globalen** Datenverarbeitung – nicht zu einem bestimmten Profil.
Auch zusätzlich über YouTube entdeckte Filme werden ausschließlich anhand
derselben kanonischen TMDB-Filmidentität in diesen gemeinsamen Datenfluss
übernommen; keine zweite Titel-Datenbank wird eingeführt.

**Konten und Profile:** Persönliche Favoriten, Watchlist, Gesehen-Status,
Sammlungen und Benachrichtigungseinstellungen sind pro Benutzer/Profil
gespeicherte Beziehungen zu diesen globalen Film-/Serienidentitäten. Eine
solche Nutzerzuordnung darf durch einen Quellenadapter niemals zum
allgemein sichtbaren Titelbestand oder gemeinsamen Anbieter-Link werden.

**Interner Video-Kandidaten-Checkpoint:** Der private GCS-Pfad
`youtube-g2/private-known-candidates/v1` ist ein **technisch
zugriffsgeschützter, aber projektweit geteilter** Zwischenspeicher, kein
privater Benutzer-/Profil-Speicher und kein paralleler MovieHub-Filmkatalog.
Er enthält nur `tmdbId`, bislang gefundene YouTube-Video-IDs und
Quellenprovenienz. „Privat“ bedeutet hier nur: keine öffentliche Auslieferung
ungeprüfter Matcher-Hypothesen und keine persönlichen Daten im Snapshot.

Der Kandidaten-Checkpoint darf im Nightly/research-Prozess von **allen
kanonischen** YouTube-badge-Filmen für erneute `videos.list`-/
Matcher-Prüfung verwendet werden. Daraus resultieren nicht automatisch
FREE-/Rent-&-Buy-Angebote oder freigegebene Deep-Links: Für eine bestätigte
Anbieter-Verfügbarkeit gelten die vorhandenen eigenständigen Quellvertrags-
und DE-Angebots-/Filmfassungs-Prüfungen.

## Beispiel: vorhandene Quellen wiederverwenden

1. Ursprünglicher realer 25-Film-TMDB-first-Test: 24 Filmidentitäten,
   210 historisch gefundene unbestätigte Video-Kandidateneinträge
   (207 verschiedene Video-IDs), dauerhaft global zwischengespeichert.
2. Aktueller erfolgreicher globaler Firebase-Deploy #40108251915:
   87 YouTube-Playlist-Videos, davon **32 bereits vorhandene redaktionelle
   Film-Video-Zuordnungen** und 55 Review-Fälle.
3. Die 32 redaktionellen Zuordnungen werden zusätzlich als **globale
   Matcher-Kandidaten** importiert. Sie sind von den ursprünglichen
   24 Filmidentitäten verschieden; erwartet werden 56 Filmidentitäten
   und 242 gespeicherte Video-Kandidateneinträge, aber weiterhin
   **0 dadurch genehmigte DE-Angebote**.
4. Zukünftige TMDB-first-Batches fragen für Filme mit bereits bekannten
   Kandidaten zuerst `videos.list` ab und sparen so `search.list`.
   Für neue Filme bleibt die begrenzte YouTube-Suche erforderlich.

Ein auf diesem Weg gefundenes zusätzliches gemeinsames Filmangebot kann
anschließend **allen Konten** zugutekommen. Favoriten und Watchlist eines
einzelnen Kontos bleiben davon unberührt.

## Berichtsbegriffe

- `sharedCanonicalMovieIds`: globale Filmidentitäten, keine Nutzer-IDs
- `durableUnapprovedCandidateMovieIds`: globale Filme mit internen
  Video-ID-Hypothesen, keine produktiven Anbieter-Routen
- `editorialPlaylistLinks`: veröffentlichte Playlist-Hinweise,
  **keine** unabhängige DE-Angebotsbestätigung
- `verifiedDEOfferRoutes`: erst nach separater Freigabe verwendbare,
  echte Anbieter-/Wiedergabewege
- `profileWatchlistEntries`/`profileFavorites`: ausschließlich
  benutzerspezifische Beziehungen zu gemeinsamen Titeln

Nicht „privater Titelspeicher“ für den allgemeinen YouTube-Adapter sagen;
der richtige Begriff ist **interner, projektweit gemeinsamer
Kandidaten-Checkpoint**.
