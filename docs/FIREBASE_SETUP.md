# Movie Hub – Firebase Setup

Stand: 6. September 2026

## Bereits eingerichtet

- Firebase-Projekt: `movie-hub`
- Project ID: `movie-hub-62459`
- Web-App: `movie-hub-web`
- Cloud Firestore: Standard Edition
- Firestore-Region: `europe-west3` (Frankfurt)
- Firestore-Modus: Produktion / standardmäßig gesperrt
- Firebase Authentication: E-Mail/Passwort
- erster Firebase-Nutzer angelegt
- klassisches Firebase Hosting eingerichtet
- Live-URL: `https://movie-hub-62459.web.app`
- Google Analytics: aktiviert

## Im Repository umgesetzt

- React/Vite-Grundgerüst
- Firebase SDK
- Firebase-Konfiguration für lokale Entwicklung über `VITE_FIREBASE_*`
- automatische Live-Konfiguration auf Firebase Hosting über `__/firebase/init.json`
- Login/Logout-Oberfläche
- Browser-Persistenz für Authentication
- Firestore-Schreib-/Lesetest für `users/{uid}/diagnostics/phase0`
- versionierte Firestore Security Rules
- automatisierte Rules-Tests über den Firestore Emulator
- Firebase-Hosting-Konfiguration
- CI-Workflow für Build und Rules-Tests

## Real geprüft am 6. September 2026

- React/Vite-Build erfolgreich
- Firestore Rules erfolgreich ins reale Firebase-Projekt deployt
- Web-App erfolgreich auf Firebase Hosting deployt
- Login gegen Firebase Authentication erfolgreich
- Auth-Status bleibt nach Browser-Reload erhalten
- eigener Firestore-Testzustand kann geschrieben und wieder gelesen werden
- Live-App ist über `https://movie-hub-62459.web.app` erreichbar

## Sicherheit

Persönliche Daten liegen unter `users/{uid}`. Die aktuellen Security Rules erlauben einem angemeldeten Benutzer ausschließlich Zugriffe auf den eigenen UID-Bereich. Unauthentifizierter Zugriff und Zugriffe auf eine fremde UID werden durch automatisierte Emulator-Tests abgelehnt.

Die normale Firebase-Web-Konfiguration ist Client-Konfiguration. Für den Live-Betrieb wird sie nicht im Repository gespeichert, sondern von Firebase Hosting zur Laufzeit geliefert. Admin-/Service-Account-Schlüssel und andere echte Secrets gehören niemals in Client-Code oder Repository.

## Noch offen in Phase 0

- Deployment aus `main` automatisieren
- GitHub Secret-Scanning-Hinweis für den früher eingecheckten Firebase-Web-Key fachlich auflösen
- TMDB-Zugangsdaten sicher für spätere automatisierte Jobs hinterlegen und ersten Testabruf durchführen

## Später

- App Check prüfen
- komfortable Fire-TV-Geräte-Kopplung
- Backup-/Export-Strategie für persönliche Daten
- Monitoring/Kostenwarnungen, falls das Projekt über den kostenlosen Rahmen hinauswächst
