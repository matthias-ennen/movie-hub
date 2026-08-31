# Movie Hub

Movie Hub ist eine persönliche, TV-optimierte Filmzentrale für Fire TV. Die Anwendung bündelt Filme aus Netflix, Prime Video, Disney+, YouTube und waipu.tv in einer gemeinsamen Oberfläche und verbindet Streaming-Verfügbarkeit mit persönlichen Bewertungen, Listen und Empfehlungen.

## Zielbild

- Streaming-artige Oberfläche mit großen Postern und Backdrops
- Persönliche Listen wie „Meine Top 100“, Science-Fiction & Technik, Thriller & Psychologie, Politik & Gesellschaft usw.
- Kompakte Provider-Symbole direkt auf den Filmkarten
- Auswahlmenü, wenn ein Film auf mehreren Plattformen verfügbar ist
- Deutsche Filmdaten, Poster, Bewertungen, Genres und Besetzung über TMDB
- Aktuelle Streaming-Verfügbarkeit für Deutschland, soweit technisch zuverlässig abrufbar
- waipu.tv-Badge, wenn ein Film aktuell oder zeitnah im linearen Fernsehen läuft
- Persönliches Filmgedächtnis: Bewertung 1–10, gesehen, Favorit, später ansehen, Datum gesehen und Notiz
- Fire-TV-Fernbedienungsnavigation mit Fokussteuerung
- Direkter Start eines Films in der jeweiligen Fire-TV-App per Deep Link/Android Intent, soweit vom Anbieter unterstützt
- Web-App als zentrale Oberfläche; kleine Fire-TV-APK als nativer Wrapper und Deep-Link-Brücke

## Zielarchitektur

1. **Web-App:** React + Vite, TV-first und fernbedienbar
2. **Hosting:** Firebase Hosting
3. **Backend:** Cloud Firestore + Firebase Authentication
4. **Filmdaten:** TMDB
5. **Automatisierung:** CI/CD und regelmäßige Daten-/Empfehlungsjobs
6. **Fire TV:** schlanke Android-/Fire-OS-App mit WebView und Intent-/Deep-Link-Layer
7. **Provider:** Netflix, Prime Video, Disney+, YouTube, waipu.tv

Details:
- [Architektur](docs/ARCHITECTURE.md)
- [Datenmodell](docs/DATA_MODEL.md)
- [Roadmap](docs/ROADMAP.md)

## Entwicklungsphasen

- **Phase 0:** Firebase-, Security-, Hosting- und Projektfundament
- **Phase 1:** TV-optimierte Streaming-Oberfläche
- **Phase 2:** TMDB-Filmdaten und persönliches Filmgedächtnis
- **Phase 3:** Fire-TV-APK
- **Phase 4:** Deep Links und Provider-Auswahl
- **Phase 5:** Dynamische Streaming-/waipu.tv-Verfügbarkeit
- **Phase 6:** Personalisierung, Toplisten und Automatisierung/KI

## Infrastrukturstand

- GitHub: `matthias-ennen/movie-hub`
- Firebase-Projekt: `movie-hub`
- Firebase Project ID: `movie-hub-62459`
- Firebase Web-App: `movie-hub-web`
- Firestore: Standard Edition, `europe-west3` (Frankfurt), Produktionsmodus
- Firebase Authentication: E-Mail/Passwort als erste Anmeldemethode
- TMDB: Developer-/Personal-Use-Zugang vorbereitet

## Status

Projektstart: 31. August 2026

Aktueller Stand: Architektur, Roadmap und Datenmodell sind dokumentiert. Phase 0 wird auf `phase-0-foundation` umgesetzt und über Draft-PR #9 geprüft. Das Ideen-Sammel-Issue ist #8.
