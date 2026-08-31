# Phase 0 – Checkliste

## Firebase
- [x] Firebase-Projekt angelegt
- [x] Web-App registriert
- [x] Firestore Standard Edition angelegt
- [x] Region `europe-west3` gewählt
- [x] Firestore im Produktionsmodus gestartet
- [x] Authentication mit E-Mail/Passwort vorbereitet/aktiviert
- [x] Security Rules im Repository angelegt
- [x] automatisierte Security-Rule-Tests im Repository angelegt
- [x] Security Rules im Firestore Emulator erfolgreich getestet
- [ ] Firebase Hosting im Firebase-Projekt aktivieren

## Web-App
- [x] React/Vite-Projektgrundgerüst angelegt
- [x] Firebase SDK integriert
- [x] Firebase-Konfiguration über Umgebungsvariablen gekapselt
- [x] Login/Logout implementiert
- [x] lokale Auth-Persistenz im Code vorgesehen
- [x] Testzugriff auf Firestore implementiert
- [x] minimale Phase-0-Startseite bereitgestellt
- [ ] Login/Logout real gegen Firebase testen
- [ ] Auth-Status nach Reload real prüfen
- [ ] Firestore-Schreib-/Lesetest real durchführen

## Deployment
- [x] Firebase-Hosting-Konfiguration versioniert
- [x] CI-Workflow für Build und Security-Tests angelegt
- [x] CI: Installation, Vite-Build und Firestore-Rules-Tests erfolgreich
- [ ] erste Version deployen
- [ ] Deployment aus `main` automatisieren

## TMDB
- [x] vorhandenen TMDB-Account wieder aktiviert
- [x] Developer-/Personal-Use-Zugang vorbereitet/beantragt
- [ ] API-Zugangsdaten sicher hinterlegen
- [ ] Secret-Strategie für automatisierte TMDB-Jobs finalisieren
- [ ] ersten TMDB-Testabruf durchführen

## Abschluss
- [ ] angemeldeter Nutzer kann eigenen Testzustand im realen Firebase-Projekt speichern und lesen
- [x] unauthentifizierter Zugriff wird in den versionierten Rules-Tests abgelehnt
- [x] fremder Benutzerzugriff wird in den versionierten Rules-Tests abgelehnt
- [ ] minimale Web-App ist öffentlich über Firebase Hosting erreichbar

## Hinweis
Checkboxen zu realen Firebase-/Gerätetests werden erst nach tatsächlich durchgeführter Prüfung abgehakt. Die Security-Regeln wurden automatisiert gegen den lokalen Firestore Emulator geprüft; der reale End-to-End-Test gegen `movie-hub-62459` steht noch aus.
