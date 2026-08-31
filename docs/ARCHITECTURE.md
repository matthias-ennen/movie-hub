# Movie Hub – Architektur

Stand: 31. August 2026

## Ziel

Movie Hub ist eine persönliche, TV-optimierte Filmzentrale für mehrere Streaming-Dienste. Die Anwendung soll auf Fire TV laufen, Filme plattformübergreifend darstellen, persönliche Bewertungen und Listen speichern und Filme nach Möglichkeit direkt in der passenden Streaming-App öffnen.

## Systemübersicht

### GitHub
- Quellcode und Versionsverwaltung
- Issues, Roadmap und Projektdokumentation
- CI/CD-Workflows
- keine geheimen Schlüssel im Repository

### Firebase Hosting
- Hosting der zentralen Movie-Hub-Web-App
- dieselbe Web-App wird im Browser und innerhalb der Fire-TV-APK verwendet
- Deployments sollen später automatisiert aus `main` erfolgen

### Firebase Authentication
- zentrale Benutzeridentität für persönliche Daten
- Start mit E-Mail/Passwort
- später optional komfortablere Geräte-Kopplung für Fire TV

### Cloud Firestore
- persönliche Bewertungen
- gesehen / ungesehen
- Favoriten
- Watchlist / später ansehen
- persönliche Notizen
- persönliche Listen und daraus abgeleitete Empfehlungen
- Zugriff ausschließlich über definierte Security Rules

### TMDB
- stabile Filmreferenz über TMDB-ID
- deutsche Titel und Beschreibungen
- Poster und Backdrops
- Laufzeit, Genres, Bewertungen und Besetzung
- Watch-Provider-Daten soweit technisch und lizenzrechtlich geeignet

### Provider-Layer
Unterstützte Zielanbieter:
- Netflix
- Prime Video
- Disney+
- YouTube
- waipu.tv / lineares Fernsehen

Auf Filmkarten werden nur kompakte Provider-Symbole eingeblendet. Gibt es mehrere Wiedergabeoptionen, öffnet Movie Hub ein Auswahlmenü.

### Fire-TV-App
- schlanke Android-/Fire-OS-APK
- lädt die zentrale Web-App
- D-Pad-/Fernbedienungsnavigation
- native Bridge für Android Intents und Deep Links
- Fallback-Kette je Anbieter: direkter Film-Link -> Anbieter-Suche/Content-Link -> App öffnen

### Automatisierung / KI
Objektive Fakten werden programmatisch ermittelt; KI erzeugt Empfehlungen, keine Verfügbarkeitsfakten.

Mögliche regelmäßige Jobs:
- Provider-Verfügbarkeit aktualisieren
- TV-/waipu-Daten aktualisieren
- neue Filme einordnen
- aus persönlichen Bewertungen neue Empfehlungen und Toplisten erzeugen

## Architekturprinzipien

1. Externe Filmdaten und persönliche Nutzerdaten strikt trennen.
2. Keine geheimen Zugangsdaten im Client oder öffentlichen Repository.
3. TV-first: Bedienbarkeit mit Fernbedienung ist Kernanforderung.
4. Web-App und APK klar trennen: Inhalte/Web-UI zentral, native Gerätefunktionen in der APK.
5. Provider-Verfügbarkeit und Deep-Link-Fähigkeit sind zwei getrennte Probleme.
6. Firestore wird von Anfang an mit Authentication und restriktiven Regeln betrieben.
7. Erst belastbare Basis, danach Automatisierung und KI.

## Aktueller Infrastrukturstand

- GitHub-Repository: `matthias-ennen/movie-hub`
- Firebase-Projekt: `movie-hub`
- Firebase Project ID: `movie-hub-62459`
- Web-App: `movie-hub-web`
- Firestore: Standard Edition, Region `europe-west3` (Frankfurt), Produktionsmodus
- Firebase Authentication: E-Mail/Passwort vorgesehen/aktiviert
- TMDB: Zugang noch einzurichten

## Noch bewusst offen

- exakte Deep-Link-Schemata je Fire-TV-App
- geeignete Quelle für deutsches Live-TV/EPG
- endgültige Darstellung und Branding der Provider-Symbole
- genaue Form der täglichen Empfehlungsautomation
- Geräte-Kopplung ohne Texteingabe auf Fire TV
