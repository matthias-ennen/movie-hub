# Movie Hub

Movie Hub ist eine persönliche, TV-optimierte Filmzentrale für Fire TV, Android-Smartphones und Tablets. Die Anwendung bündelt Filme und Serien aus Netflix, Prime Video, Disney+, YouTube und waipu.tv in einer gemeinsamen Oberfläche und verbindet Streaming-Verfügbarkeit mit persönlichen Bewertungen, Listen, eigenen Medien und TMDB-Daten.

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
- Android-/Fire-TV-App: signierte GitHub-Actions-APK mit fortlaufendem `versionCode`

## Status

Projektstart: 31. August 2026

Stand: **12. September 2026**

Der aktuelle Funktionsstand ist von Matthias auf **Smartphone, Tablet und Fire TV bis hierhin abgenommen**. Dazu gehören insbesondere die native Android-/Fire-TV-Hülle, D-Pad-/Zurück-Navigation, Profile und persönliche Zustände, SMB-/FRITZ!NAS-Wiedergabe, persönliche TMDB-Verbindung und -Synchronisation, automatische Providerbuttons für Netflix, Prime Video, Disney+, YouTube und waipu.tv sowie das Movie-Hub-Startintro mit Jingle und CRT-Abschaltung.

Die Seiten **Filme** und **Serien** besitzen seit #156 eigene profilbezogene Kategorieauswahlen. Das anschließende Paket #163 ergänzt davon getrennte, selbst konfigurierte Smart-Reihen ausschließlich unter **Meine Inhalte**.

Für Provider gilt bewusst Best Effort: Titelsuche ist optimal, die Suchseite ist akzeptiert und das zuverlässige Öffnen der richtigen Anbieter-App ist die Mindestanforderung. Das Fire-TV-Sideloading kann Launcher-Grafiken anders darstellen als Smartphone/Tablet; die APK enthält trotzdem ein normales Android-Icon und ein separates TV-Banner.

Die zu diesem Abnahmestand gehörenden Detail-Issues werden abgeschlossen. Neue Auffälligkeiten werden als neue, klar abgegrenzte Issues erfasst.

**Aktuelle Arbeitspakete:** #170 integriert Movie Hub als virtuellen Anbieter-Katalog; #171 ergänzt profilbezogene, dynamische Heroes und Posterreihen. Die technische Hero-first-Grundlage aus #166/#169 bleibt dabei erhalten.
