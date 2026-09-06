# Movie Hub – lokale Entwicklung

Stand: 6. September 2026

## Voraussetzungen

- Node.js 22
- npm
- Java 21 für den lokalen Firestore Emulator
- optional Firebase CLI (`npx firebase ...` funktioniert ebenfalls)

## Ersteinrichtung

1. Repository auschecken.
2. `npm install` ausführen.
3. `npm run dev` starten.

Die Firebase-Web-Konfiguration der registrierten App `movie-hub-web` ist als normale Client-Konfiguration im Web-Code hinterlegt, damit lokale Builds, CI und Firebase Hosting ohne private Build-Secrets funktionieren. Diese Werte identifizieren das Firebase-Projekt, ersetzen aber keine Zugriffskontrolle.

Für lokale oder spätere Testumgebungen können die Werte weiterhin über `VITE_FIREBASE_*`-Umgebungsvariablen überschrieben werden. Admin-SDK-/Service-Account-Schlüssel oder sonstige echte Secrets gehören niemals in Client-Code oder Repository.

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

Der nächste reale Phase-0-Schritt ist:
1. Testnutzer in Firebase Authentication anlegen.
2. aktuelle Firestore Rules in das reale Firebase-Projekt deployen.
3. Web-App auf Firebase Hosting deployen.
4. Login, Reload-Persistenz und Firestore-Schreib-/Lesetest gegen das echte Projekt durchführen.
