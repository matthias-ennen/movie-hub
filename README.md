# Movie Hub

Movie Hub ist eine persönliche, TV-optimierte Filmzentrale für Fire TV. Die Anwendung bündelt Filme aus Netflix, Prime Video, Disney+, YouTube und waipu.tv in einer gemeinsamen Oberfläche und ordnet sie in persönliche Bestenlisten und Kategorien ein.

## Zielbild

- Streaming-artige Oberfläche mit großen Postern und Backdrops
- Persönliche Listen wie „Meine Top 100“, Science-Fiction & Technik, Thriller & Psychologie, Politik & Gesellschaft usw.
- Sichtbare Provider-Badges direkt auf den Filmkarten
- Deutsche Filmdaten, Poster, Bewertungen, Genres und Besetzung über TMDB
- Aktuelle Streaming-Verfügbarkeit für Deutschland, soweit technisch zuverlässig abrufbar
- waipu.tv-Badge, wenn ein Film aktuell im linearen Fernsehen läuft
- Fire-TV-Fernbedienungsnavigation mit Fokussteuerung
- Direkter Start eines Films in der jeweiligen Fire-TV-App per Deep Link/Android Intent, soweit vom Anbieter unterstützt
- Web-App als zentrale Oberfläche; kleine Fire-TV-APK als nativer Wrapper und Deep-Link-Brücke

## Geplante Architektur

1. **Web-App:** React + Vite, TV-first und fernbedienbar
2. **Hosting:** GitHub Pages
3. **Filmdaten:** TMDB
4. **Eigene Daten:** kuratierte Listen und persönliche Rankings als versionierte JSON-Daten
5. **Fire TV:** schlanke Android-/Fire-OS-App mit WebView und Intent-/Deep-Link-Layer
6. **Provider:** Netflix, Prime Video, Disney+, YouTube, waipu.tv

## Entwicklungsphasen

### Phase 1 – Web-Prototyp
- Grundlayout und Navigation
- erste persönliche Filmkategorien
- Provider-Badges
- Detailansicht
- Test im Fire-TV-Browser

### Phase 2 – Filmdaten
- TMDB-Anbindung
- Poster, Backdrops, Beschreibungen, Ratings, Genres, Cast
- strukturierte lokale Movie-Hub-Daten

### Phase 3 – Fire-TV-App
- APK-Wrapper
- D-Pad-/Fernbedienungsnavigation
- Deep-Link-/Intent-Tests pro Streaming-App

### Phase 4 – Dynamische Verfügbarkeit
- Streaming-Verfügbarkeit für Deutschland
- waipu.tv-/TV-Programm-Integration
- automatische Aktualisierung

## Status

Projektstart: 31. August 2026

Aktueller Stand: Repository initialisiert; Architektur und erste Arbeitspakete werden aufgebaut.
