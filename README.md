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

Stand: **20. September 2026**

Das aktuelle Arbeitspaket ist
[#4 – öffentlicher Waipu-Live-Katalog](https://github.com/matthias-ennen/movie-hub/issues/4).
Der zentrale Datenlauf verarbeitet für die freigegebenen ersten 50 Sender einen
rollierenden 14-Tage-EPG-Bestand, ordnet Filme und Serien reproduzierbar über
Medientyp plus TMDB-ID zu und veröffentlicht fertige Movie-Hub-Katalogartefakte.
Der vollständige Lauf vom 19.09.2026 lieferte 1.040 Titel, 7.903 Ausstrahlungen
und 1.040/1.040 vollständige TMDB-Metadatensätze.

Die technischen Stufen bis #4I sind umgesetzt. Dazu gehören TV-Reiter,
kontoweite Senderauswahl und -sortierung, Waipu-Badges und Sendetermine,
einheitliche TV-Posterkarten, zeitgenauer statischer `ON AIR`-Status sowie die
vollständige „Gesehen“-Markierung bei Anbieter-Aufrufen. Langzeitbeobachtung
und gemeinsame Geräteabnahme auf Fire TV, Smartphone und Tablet bleiben offen.

Der aktuelle Produkt-Referenzstand ist **APK 0.1.473**. Beobachtungen dazu sind
in [#254](https://github.com/matthias-ennen/movie-hub/issues/254) gesammelt und
in der [Bestandsaufnahme ab APK 0.1.473](docs/APP_REVIEW_0.1.473.md)
strukturiert. Die Fortsetzung, Paketbildung und offenen Entscheidungen werden
in [#255](https://github.com/matthias-ennen/movie-hub/issues/255) geführt.

Für **Home, Filme, Serien, TV und Meine Inhalte** gilt als gemeinsames Ziel eine
einheitliche, stabile technische Inhaltsseiten-Grundlage. Bewährte Hero-,
Posterreihen-, Fokus-, Lade- und Detailseitenlogik wird wiederverwendet;
seitenspezifisch bleiben nur fachlich notwendige Unterschiede.

Die bestätigte Hauptreihenfolge bleibt zunächst:

`#4 → Triage #254/#255 → #118 → #7`

Vor jedem Umsetzungspaket werden offene Produktfragen mit Matthias einzeln
geklärt und anschließend im betreffenden Issue verbindlich dokumentiert.
