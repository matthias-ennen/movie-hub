# Movie Hub – Roadmap

Stand: 31. August 2026

## Arbeitsprinzip

Movie Hub wird schrittweise über klar abgegrenzte GitHub-Issues entwickelt. Ein Arbeitspaket gilt erst als abgeschlossen, wenn technische Prüfpunkte durchgeführt wurden; Fire-TV-bezogene Punkte benötigen zusätzlich eine manuelle Geräteabnahme.

## Phase 0 – Fundament

Ziel: belastbare technische Grundlage schaffen, bevor UI und Integrationen wachsen.

- Architektur dokumentieren
- Firebase-Projekt konfigurieren
- Firestore-Datenmodell festlegen
- Firebase Authentication aktivieren
- Firestore Security Rules implementieren und testen
- Firebase Hosting einrichten
- React/Vite-Grundgerüst anlegen
- Deployment-Pipeline vorbereiten
- TMDB-Zugang einrichten und Secret-Strategie festlegen

Abschlusskriterium: Eine minimale Web-App wird sicher über Firebase Hosting ausgeliefert; Anmeldung funktioniert; ein angemeldeter Nutzer kann ausschließlich seinen eigenen Testzustand in Firestore lesen/schreiben.

## Phase 1 – TV-optimierte Oberfläche

- Streaming-artige Startseite
- Hero-Bereich
- horizontale Filmreihen
- Poster-Karten
- Provider-Symbole als Overlay
- D-Pad-/Tastaturnavigation
- sichtbarer Fokuszustand
- Film-Detailansicht
- Provider-Auswahlmenü bei mehreren Diensten

Abschlusskriterium: Oberfläche ist im Desktop-Browser und in 1280×720 sowie 1920×1080 sinnvoll bedienbar.

## Phase 2 – Echte Filmdaten und persönliches Filmgedächtnis

- TMDB-ID als Referenz
- deutsche Metadaten, Poster, Backdrops, Cast, Laufzeit, Genres
- Bewertung 1–10
- gesehen / ungesehen
- Favorit
- später ansehen
- Datum gesehen
- persönliche Notiz
- persönliche/systemische Listen

Abschlusskriterium: Filmzustände bleiben nach Neustart erhalten und sind für denselben Benutzer geräteübergreifend abrufbar.

## Phase 3 – Fire-TV-App

- Android-/Fire-OS-Projekt
- schlanke APK mit WebView/native Bridge
- D-Pad, OK und Zurück
- App-Lifecycle und Fokuswiederherstellung
- Sideloading auf mindestens einem Fire TV Stick HD
- Test auf weiteren verfügbaren Fire-TV-Geräten

Abschlusskriterium: Movie Hub startet als APK zuverlässig und ist vollständig mit der Fire-TV-Fernbedienung bedienbar.

## Phase 4 – Deep Links und Provider-Auswahl

Für Netflix, Prime Video, Disney+, YouTube und waipu.tv jeweils testen:
1. direkter Deep Link zum konkreten Film
2. interner Content-/Suchlink
3. App-Start als Fallback

Abschlusskriterium: dokumentierte Testmatrix und stabile Fallback-Logik je Anbieter.

## Phase 5 – Dynamische Verfügbarkeit

- Streaming-Verfügbarkeit Deutschland
- mehrere Anbieter pro Film
- Provider-Overlays dynamisch aktualisieren
- lineares TV/waipu.tv getrennt modellieren
- „heute im Fernsehen“ / Zeitangaben
- Datenquelle und Attribution dokumentieren

Abschlusskriterium: Verfügbarkeit ist nachvollziehbar aktualisiert und UI behandelt fehlende/mehrdeutige Daten sauber.

### Laufendes Paket #53 – Automatische TMDB-Katalogaktualisierung

- täglicher GitHub-Actions-Job für den öffentlichen Katalog
- aktuelle Trend-, Neuheiten- und Popularitätsreihen für Filme und Serien
- deutsche Anbieter-Verfügbarkeit als Auswahlkriterium
- atomare Veröffentlichung: bei Fehler bleibt der letzte Live-Katalog bestehen
- persönliche Listen bleiben unabhängig von wechselnden Entdeckungsreihen sichtbar

## Phase 6 – Personalisierung und Automatisierung

- persönliche Top 100 aus Bewertungen und Präferenzen
- „Heute für dich“
- ähnliche Filme
- noch nicht gesehen
- neue verfügbare Filme
- täglicher/regelmäßiger Empfehlungsjob
- strukturierte JSON-/Firestore-Ausgabe der Empfehlungen
- KI nur für Empfehlung/Einordnung, nicht für objektive Verfügbarkeitsfakten

Abschlusskriterium: Empfehlungen werden reproduzierbar aus aktuellen Filmdaten und persönlichen Signalen erzeugt und automatisch in Movie Hub sichtbar.

## Später / optional

- komfortable Geräte-Kopplung per Code/QR statt Texteingabe am TV
- mehrere Profile
- Smartphone-optimierte Verwaltungsansicht
- Bewertungsverlauf
- Trailer
- Suche und Filter
- eigene Sammlungen
- Import/Export persönlicher Filmdaten
