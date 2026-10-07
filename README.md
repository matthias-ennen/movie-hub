# Movie Hub

Movie Hub ist eine persönliche, TV-optimierte Filmzentrale für Fire TV, Android-Smartphones und Tablets. Die Anwendung bündelt Filme und Serien aus Streaming-Diensten sowie linearem Fernsehen über Waipu und Joyn in einer gemeinsamen Oberfläche und verbindet Streaming-Verfügbarkeit mit persönlichen Bewertungen, Listen, eigenen Medien und TMDB-Daten.

## Zielbild

- Streaming-artige Oberfläche mit großen Postern und Backdrops
- Persönliche Listen und ein eigenes Filmgedächtnis
- Kompakte Provider-Symbole direkt auf den Filmkarten
- Automatische Anbieterbuttons mit bestmöglichem App-/Suchstart
- Deutsche Filmdaten, Poster, Bewertungen, Genres und Besetzung über TMDB
- Persönlicher TMDB-Katalog aus Favoriten und Watchlist
- Eigene Links sowie HTTP(S)- und SMB-/FRITZ!NAS-Videos
- Fire-TV-Fernbedienungsnavigation mit Fokussteuerung
- Web-App als zentrale Oberfläche; Android-/Fire-TV-APK als nativer Wrapper und Gerätebrücke

## Zielarchitektur

1. **Web-App:** React + Vite, TV-first und fernbedienbar
2. **Hosting:** Firebase Hosting
3. **Backend:** Cloud Firestore + Firebase Authentication
4. **Filmdaten:** TMDB
5. **Automatisierung:** CI/CD und regelmäßige Datenjobs
6. **Android / Fire TV:** schlanke native App mit WebView, sicherer Geräteablage, Player und Intent-/Deep-Link-Layer
7. **Provider:** automatische Drittanbieter sowie Movie Hub als virtueller Anbieter für persönliche Links und Videos

Details:
- [Architektur](docs/ARCHITECTURE.md)
- [Datenmodell](docs/DATA_MODEL.md)
- [Roadmap](docs/ROADMAP.md)
- [Abnahme 09.09.2026](docs/ACCEPTANCE_2026-09-09.md)

## Entwicklungsphasen

- **Phase 0:** Firebase-, Security-, Hosting- und Projektfundament
- **Phase 1:** TV-optimierte Streaming-Oberfläche
- **Phase 2:** TMDB-Filmdaten und persönliches Filmgedächtnis
- **Phase 3:** Android-/Fire-TV-APK
- **Phase 4:** Deep Links und Provider-Auswahl
- **Phase 5:** Dynamische Verfügbarkeit, persönliche Kataloge und eigene Medien
- **Phase 6:** Personalisierung, Toplisten und Automatisierung/KI

## Infrastrukturstand

- GitHub: `matthias-ennen/movie-hub`
- Firebase-Projekt: `movie-hub`
- Firebase Project ID: `movie-hub-62459`
- Firebase Web-App: `movie-hub-web`
- Firestore: Standard Edition, `europe-west3` (Frankfurt)
- Firebase Authentication: E-Mail/Passwort
- Firebase Hosting: `https://movie-hub-62459.web.app`
- Android-/Fire-TV-App: signierte, R8-minifizierte GitHub-Actions-APK mit fortlaufendem `versionCode`
- aktueller Release-Build: rund **2,51 MiB**
- Web-Bundle: stabile Vendor-Chunks für React, Firebase und TanStack; TV und sekundäre Ansichten werden bedarfsgerecht lazy geladen

## Status

Projektstart: 31. August 2026

Stand: **7. Oktober 2026**

Die kanonische Titelbasis aus #256 sowie die Waipu-Pakete #4, #259 und #260 sind technisch umgesetzt und auf den vorgesehenen Geräten abgenommen. TMDB bleibt die kanonische Quelle für öffentliche Film- und Serienmetadaten; externe Quellen ergänzen Verfügbarkeiten, Senderereignisse und Wiedergabeziele.

[#280 – Joyn-Adapter](https://github.com/matthias-ennen/movie-hub/issues/280) ist abgeschlossen. Joyn und Waipu liefern ihre Ausstrahlungen in denselben neutralen Quellen-/TV-Vertrag. Derselbe kanonische Titel kann dadurch mehrere getrennte Providerwege tragen, ohne als doppelter Movie-Hub-Titel zu erscheinen. Wiedergabeziele bleiben providerbezogen als PlaybackRoutes erhalten.

Der gezielt vorgezogene Betriebsnachtrag vom 07.10.2026 unter #271 erweitert
Joyn auf den geprüften 14-Tage-Import, dauerhafte Checkpoints, Quellenfehlerschutz
und den gemeinsamen Nachtlaufbericht. Er wurde ohne neues eigenes Issue als
Ergänzung zu #280/#315 bearbeitet. Aufbau, Code-Deploy und öffentliche Rückprüfung
sind erfolgreich; die tägliche Fortschreibung mit normalen Budgets muss der
reguläre Lauf am 08.10.2026 (Sollstart 00:17 Uhr Europe/Berlin) noch bestätigen.
Nachweise und offener Betriebspunkt: [Nachtlauf-Dokumentation](docs/DATA_WORKFLOW_RELIABILITY.md).
Die Produkt-Hauptstrecke bleibt #314; Movie Hub Admin wird separat behandelt.

Der interaktive TV-Pfad liest vorbereitete Runtime-Artefakte statt vollständige Providerkataloge in die Oberfläche zu ziehen. Der TV-Hero kommt aus einem kleinen 14-Tage-Snapshot; Tagesdaten werden erst nach Hero-Bereitschaft geladen. Veraltete Tagesrequests werden abgebrochen und der Tagescache ist begrenzt. Seit #346 liegt die komplette TV-Runtime zusätzlich in einem lazy geladenen Feature und wird beim TV-Intent nur vorgewärmt.

[#346 – Fundamenthärtung und Performance](https://github.com/matthias-ennen/movie-hub/issues/346) ist abgeschlossen und von Matthias auf Smartphone und Fire TV abgenommen. Umgesetzt sind zentrale Produktverträge, Page-/Row-Logik, atomare Detailbeladung, TV Hero-first, progressive Poster-/Bildlogik, React-/State-Härtung, native Android-/Fire-TV-Härtung, Dependency-/CI-Bereinigung sowie Hosting-/Cache-/Bundle-Optimierung.

Der Vite-Hauptchunk wurde im Verlauf von #346 auf **210,46 kB minifiziert / 63,72 kB gzip** reduziert. Der signierte R8-Release liegt bei rund **2,51 MiB**. Das verbleibende leichte Fire-TV-Ruckeln ist kein Blocker des abgeschlossenen Pakets und kann später als eigenes Performance-Folgepaket untersucht werden. [#315 – Nachtlauf/Betriebszuverlässigkeit](https://github.com/matthias-ennen/movie-hub/issues/315) ist ebenfalls abgeschlossen; der reguläre Datenlauf nutzt geprüfte private Cloud-Checkpoints und ein unabhängiger Meldeweg überwacht Datenfrische und ausgebliebene Zeittrigger.

Für Home, Filme, Serien, TV und Meine Inhalte gelten gemeinsame Seiten-, Hero-, Fokus-, Row- und Ladeverträge. Top 10 wird relativ zu den tatsächlich sichtbaren Reihen eingesetzt, „Als gesehen markiert“ behält sein Fachlimit von bis zu 100 Titeln, Prime Time ist zentral auf 20:15 Uhr Europe/Berlin festgelegt und Anbieter werden zentral in der Reihenfolge Movie Hub → Waipu → Joyn → übrige Provider präsentiert.

Die aktuelle Hauptreihenfolge lautet:

`#314 Mitteilungen/Benachrichtigungen → #271/#336 Quellenplattform und weitere belastbare Quellen → Verfügbarkeitsdarstellung und Produkt-Finish → #112 Release-Gate → 1.0`

Das aktuell aktive große Arbeitspaket ist [#314 – Mitteilungen](https://github.com/matthias-ennen/movie-hub/issues/314). Es führt die noch offenen Punkte aus #312 und #118 zusammen: Ende-zu-Ende-Verhalten, persönliche Auslöser „Wenn inklusive“/„Wenn im TV“, Darstellung, Häufigkeit, Gültigkeit, Deduplizierung und Profilregeln. Der in Deploy #939 beobachtete serverseitige Firestore/IAM-Fehler des TV-Prüflaufs gehört ausdrücklich in dieses Paket. #329 bleibt als Wartungspaket offen. Für eine öffentliche Verteilung gilt weiterhin das Compliance-Gate #112.

Vor jedem Umsetzungspaket werden offene Produktfragen mit Matthias einzeln geklärt und anschließend im betreffenden Issue verbindlich dokumentiert.
