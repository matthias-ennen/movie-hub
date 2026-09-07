# Movie Hub – lokale Entwicklung

Stand: 6. September 2026

## Voraussetzungen

- Node.js 22
- npm
- Java 21 für den lokalen Firestore Emulator
- optional Firebase CLI (`npx firebase ...` funktioniert ebenfalls)

## Ersteinrichtung lokal

1. Repository auschecken.
2. `npm install` ausführen.
3. `.env.example` nach `.env` kopieren und für die lokale Entwicklung die Firebase-Web-Konfiguration der App `movie-hub-web` als `VITE_FIREBASE_*`-Werte eintragen.
4. `npm run dev` starten.

Auf **Firebase Hosting** lädt Movie Hub die registrierte Firebase-Web-Konfiguration automatisch über den reservierten Hosting-Endpunkt `__/firebase/init.json`. Dadurch müssen die Client-Konfigurationswerte für den Live-Build nicht im Repository hinterlegt werden.

Admin-SDK-/Service-Account-Schlüssel oder andere echte Secrets gehören niemals in Client-Code oder Repository.

## Phase-0-Test

Nach Anmeldung zeigt die minimale App einen Button `Firestore schreiben + lesen`. Er schreibt ausschließlich in:

`users/{uid}/diagnostics/phase0`

und liest dasselbe Dokument anschließend wieder zurück.

Der reale Test gegen `movie-hub-62459` wurde am 6. September 2026 erfolgreich durchgeführt: Login, Firestore Write/Read und Auth-Persistenz nach Reload funktionieren.

## Security Rules lokal testen

`npm run test:rules`

Der Befehl startet den Firestore Emulator temporär und prüft mindestens:
- unauthentifizierter Zugriff wird abgelehnt
- eigene UID darf lesen/schreiben
- fremde UID wird abgelehnt
- gemeinsame Movie-Hub-Medien sind innerhalb der eigenen UID erlaubt und für fremde Konten gesperrt

## Build

`npm run build`

Der Build landet in `dist/` und ist für Firebase Hosting konfiguriert.

## Hosting

Die Hosting-Konfiguration liegt in `firebase.json`, das Firebase-Projekt in `.firebaserc`.

Der erste reale Deploy wurde am 6. September 2026 erfolgreich mit

`firebase deploy --only firestore:rules,hosting`

durchgeführt. Die Live-App ist unter `https://movie-hub-62459.web.app` erreichbar.

Offen bleibt die Automatisierung des Deployments aus `main`; dafür wird ein eigener CI/CD-Schritt eingerichtet.
