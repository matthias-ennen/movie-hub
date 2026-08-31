# Movie Hub – Firebase Setup

Stand: 31. August 2026

## Bereits eingerichtet

- Firebase-Projekt: `movie-hub`
- Project ID: `movie-hub-62459`
- Web-App: `movie-hub-web`
- Cloud Firestore: Standard Edition
- Firestore-Region: `europe-west3` (Frankfurt)
- Firestore-Modus: Produktion / standardmäßig gesperrt
- Firebase Authentication: E-Mail/Passwort als erste Anmeldemethode
- Google Analytics: aktiviert

## Noch einzurichten

### Firestore Security Rules
Ziel: angemeldete Nutzer dürfen ausschließlich ihre eigenen Dokumente unter `users/{uid}` lesen und schreiben. Regeln werden versioniert im Repository abgelegt und vor Freigabe getestet.

### Firebase Hosting
- Hosting-Site für Movie Hub aktivieren
- React/Vite-Build veröffentlichen
- später automatisches Deployment aus `main`

### Auth-Test
- ersten Testnutzer anlegen
- Login/Logout in Web-App testen
- Auth-Status nach Reload prüfen

### Firestore-End-to-End-Test
- Testdokument unter `users/{uid}/movies/{tmdbId}` schreiben
- Dokument erneut lesen
- Zugriff mit falscher/fehlender Identität muss abgewiesen werden

### Projektkonfiguration im Code
Die Firebase-Web-Konfiguration darf als Client-Konfiguration verwendet werden. Geheimnisse wie Admin-/Service-Account-Schlüssel gehören niemals ins öffentliche Repository.

## Später

- App Check prüfen
- komfortable Fire-TV-Geräte-Kopplung
- Backup-/Export-Strategie für persönliche Daten
- Monitoring/Kostenwarnungen, falls das Projekt über den kostenlosen Rahmen hinauswächst
