# Phase 0 – Checkliste

## Firebase
- [x] Firebase-Projekt angelegt
- [x] Web-App registriert
- [x] Firestore Standard Edition angelegt
- [x] Region `europe-west3` gewählt
- [x] Firestore im Produktionsmodus gestartet
- [x] Authentication mit E-Mail/Passwort aktiviert
- [x] erster Firebase-Nutzer angelegt
- [x] Security Rules im Repository angelegt
- [x] automatisierte Security-Rule-Tests im Repository angelegt
- [x] Security Rules im Firestore Emulator erfolgreich getestet
- [x] klassisches Firebase Hosting im Firebase-Projekt eingerichtet

## Web-App
- [x] React/Vite-Projektgrundgerüst angelegt
- [x] Firebase SDK integriert
- [x] lokale Firebase-Konfiguration über Umgebungsvariablen gekapselt
- [x] Live-Konfiguration über `__/firebase/init.json` vorbereitet
- [x] Login/Logout implementiert
- [x] lokale Auth-Persistenz im Code vorgesehen
- [x] Testzugriff auf Firestore implementiert
- [x] minimale Phase-0-Startseite bereitgestellt
- [x] Login/Logout real gegen Firebase getestet
- [x] Auth-Status nach Reload real geprüft
- [x] Firestore-Schreib-/Lesetest real durchgeführt

## Deployment
- [x] Firebase-Hosting-Konfiguration versioniert
- [x] CI-Workflow für Build und Security-Tests angelegt
- [x] CI: Installation, Vite-Build und Firestore-Rules-Tests erfolgreich
- [x] erste Version real auf Firebase Hosting deployt
- [x] Firestore Rules ins reale Projekt deployt
- [ ] Deployment aus `main` automatisieren

## TMDB
- [x] vorhandenen TMDB-Account wieder aktiviert
- [x] Developer-/Personal-Use-Zugang vorbereitet/beantragt
- [ ] API-Zugangsdaten sicher hinterlegen
- [ ] Secret-Strategie für automatisierte TMDB-Jobs finalisieren
- [ ] ersten TMDB-Testabruf durchführen

## Abschluss
- [x] angemeldeter Nutzer kann eigenen Testzustand im realen Firebase-Projekt speichern und lesen
- [x] unauthentifizierter Zugriff wird in den versionierten Rules-Tests abgelehnt
- [x] fremder Benutzerzugriff wird in den versionierten Rules-Tests abgelehnt
- [x] minimale Web-App ist öffentlich über Firebase Hosting erreichbar
- [x] Auth-Persistenz nach Reload verifiziert
- [ ] Deployment aus `main` automatisiert
- [ ] GitHub Secret-Scanning-Hinweis zum früher eingecheckten Firebase-Web-Key fachlich aufgelöst

## Verifizierter Realstand

Am 6. September 2026 wurden auf dem Tablet Login, Browser-Reload-Persistenz und der reale Firestore Write/Read-Test erfolgreich durchgeführt. Die App ist unter `https://movie-hub-62459.web.app` erreichbar.
