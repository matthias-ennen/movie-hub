# Movie Hub – lokale Entwicklung

Stand: 31. August 2026

## Voraussetzungen

- Node.js 22
- npm
- Java 21 für den lokalen Firestore Emulator
- optional Firebase CLI (`npx firebase ...` funktioniert ebenfalls)

## Ersteinrichtung

1. Repository auschecken.
2. `npm install` ausführen.
3. `.env.example` nach `.env` kopieren.
4. Die Firebase-Web-Konfiguration aus Firebase Console > Projekteinstellungen > `movie-hub-web` in `.env` eintragen.
5. `npm run dev` starten.

Die normale Firebase-Web-Konfiguration ist Client-Konfiguration. Admin-SDK-/Service-Account-Schlüssel oder sonstige Secrets gehören weder in `.env.example` noch ins Repository.

## Phase-0-Test

Nach Anmeldung zeigt die minimale App einen Button `Firestore schreiben + lesen`. Er schreibt ausschließlich in:

`users/{uid}/diagnostics/phase0`

und liest dasselbe Dokument anschließend wieder zurück.

## Security Rules lokal testen

`npm run test:rules`

Der Befehl startet den Firestore Emulator temporär und prüft mindestens:
- unauthentifizierter Zugriff wird abgelehnt
- eigene UID darf lesen/schreiben
- fremde UID wird abgelehnt

## Build

`npm run build`

Der Build landet in `dist/` und ist für Firebase Hosting konfiguriert.

## Hosting

Die Hosting-Konfiguration liegt in `firebase.json`, das Firebase-Projekt in `.firebaserc`.

Ein reales Deployment wird erst durchgeführt, nachdem Firebase Hosting im Projekt aktiviert und der Build sowie die Security-Tests erfolgreich geprüft wurden.
