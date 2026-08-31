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

## Im Repository vorbereitet

- React/Vite-Grundgerüst
- Firebase SDK
- Firebase-Web-Konfiguration über lokale `.env`-Datei
- Login/Logout-Oberfläche
- lokaler Auth-Persistenzmodus
- Firestore-Schreib-/Lesetest für `users/{uid}/diagnostics/phase0`
- versionierte Firestore Security Rules
- automatisierte Rules-Tests über den Firestore Emulator
- Firebase-Hosting-Konfiguration
- CI-Workflow für Build und Rules-Tests

Die Umsetzung befindet sich bis zur Abnahme auf `phase-0-foundation` / Draft-PR #9.

## Noch einzurichten bzw. real zu prüfen

### Firebase-Web-Konfiguration
Die Werte aus Firebase Console > Projekteinstellungen > `movie-hub-web` werden lokal in `.env` eingetragen. `.env` ist vom Git-Tracking ausgeschlossen.

### Firestore Security Rules
Ziel: angemeldete Nutzer dürfen ausschließlich ihre eigenen Dokumente unter `users/{uid}` lesen und schreiben. Die Regeln liegen im Repository, müssen aber vor Freigabe tatsächlich über die Emulator-Tests und anschließend gegen das reale Projekt geprüft werden.

### Firebase Hosting
- Hosting-Site für Movie Hub im Firebase-Projekt aktivieren
- React/Vite-Build veröffentlichen
- später automatisches Deployment aus `main`

### Auth-Test
- ersten Testnutzer anlegen
- Login/Logout in Web-App testen
- Auth-Status nach Reload prüfen

### Firestore-End-to-End-Test
- Testdokument unter `users/{uid}/diagnostics/phase0` schreiben
- Dokument erneut lesen
- Zugriff mit falscher/fehlender Identität muss abgewiesen werden

## Sicherheit
Die normale Firebase-Web-Konfiguration darf als Client-Konfiguration verwendet werden. Geheimnisse wie Admin-/Service-Account-Schlüssel gehören niemals ins öffentliche Repository.

## Später

- App Check prüfen
- komfortable Fire-TV-Geräte-Kopplung
- Backup-/Export-Strategie für persönliche Daten
- Monitoring/Kostenwarnungen, falls das Projekt über den kostenlosen Rahmen hinauswächst
