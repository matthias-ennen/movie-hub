# Movie Hub – Security-Konzept

Stand: 18. September 2026

## Ziele

- persönliche Filmdaten sind standardmäßig privat
- keine Secrets im öffentlichen Repository oder Client-Code
- Firestore-Zugriffe sind an Firebase Authentication gebunden
- jeder Benutzer darf ausschließlich seine eigenen Daten lesen und schreiben
- administrative Jobs erhalten nur die Rechte, die sie tatsächlich benötigen

## Geplante Firestore-Regeln

Persönliche Daten liegen ausschließlich unter `users/{uid}`. Zugriff ist nur erlaubt, wenn `request.auth.uid` der Ziel-UID entspricht.

Öffentliche Katalogdaten werden getrennt modelliert und erhalten eigene Leseregeln.

## Secrets

Nicht ins Repository gehören insbesondere:
- TMDB-Server-/API-Secrets, soweit geheim zu behandeln
- Firebase Admin Service Account Credentials
- CI/CD-Service-Account-Schlüssel
- sonstige private Provider-Zugangsdaten

Solche Werte werden über GitHub Secrets, Firebase/Google Secret-Verwaltung oder vergleichbare sichere Mechanismen bereitgestellt.

## Lokale SMB-Zugangsdaten

Gemeinsame Movie-Hub-Medieneinträge dürfen einen `smb://`-Pfad, aber niemals Benutzername oder Kennwort enthalten. Netzlaufwerksdefinitionen sowie deren Status werden ausschließlich gerätelokal verwaltet. Die gehostete Weboberfläche darf nur die nicht exportierte native Einstellungsseite öffnen und erhält zu keinem Zeitpunkt SMB-Zugangsdaten.

Das aus diesen Einträgen abgeleitete Shared-Media-Manifest bleibt ebenfalls unter `users/{uid}`. Es enthält ausschließlich eine kompakte Titelreferenz und den Katalogstatus, niemals die Medienadresse oder Zugangsdaten. Zugriff bleibt durch dieselbe UID-Grenze geschützt.

Bei aktivierter Option **Zugangsdaten auf diesem Gerät speichern und automatisch verbinden** wird das Kennwort mit AES-GCM verschlüsselt; der nicht exportierbare Schlüssel liegt im Android Keystore. Im Sitzungsmodus bleiben Benutzername und Kennwort nur im Arbeitsspeicher des App-Prozesses und werden beim bewussten Schließen, Abmelden oder spätestens mit dem Prozessende verworfen. Firestore, die Web-App und das Repository erhalten diese Zugangsdaten nicht. Auf jedem neuen Gerät müssen Verbindungen erneut eingerichtet werden.

**Verbindung trennen** deaktiviert die automatische Nutzung des Netzlaufwerks, löscht jedoch keine geschützt gespeicherten Zugangsdaten. Erst **Verbinden** aktiviert die Verbindung nach einer erneuten Erreichbarkeits- und Anmeldeprüfung. Movie Hub hält keine SMB-Sitzung dauerhaft im Hintergrund offen.

Movie Hub öffnet SMB ausschließlich als ausgehende Verbindung im Heimnetz. Eine Portfreigabe der FRITZ!Box ins Internet ist weder nötig noch vorgesehen.

## Client-Konfiguration

Die normale Firebase-Web-Konfiguration einschließlich Web-API-Key ist Teil der Client-Konfiguration und ersetzt keine Security Rules. Schutz entsteht durch Authentication, Rules und serverseitige Rechte.

## Waipu-Konto-Prototyp

Der Machbarkeitsnachweis #4B ist ein lokaler, rein lesender Diagnose-Runner. Er
verlangt kein Waipu-Passwort, speichert weder Access- noch Refresh-Token und
schreibt keine EPG- oder Kontodaten nach Firestore. Die für den Gerätefluss
erforderliche OAuth-Client-Authentifizierung wird ausschließlich zur Laufzeit
über `WAIPU_OAUTH_CLIENT_AUTH_B64` bereitgestellt und darf weder im Repository
noch in Workflow-Dateien, Berichten oder Logs abgelegt werden.

Der Diagnosebericht enthält ausschließlich Zähler, HTTP-Statusklassen,
Antwortgrößen, Feldnamen und den gemessenen EPG-Horizont. Senderkennungen,
Programmtitel, Program IDs, Gerätecodes, Geräte-ID und vollständige
API-Antworten werden nicht persistiert. Produktive, Keystore-verschlüsselte
Tokenablage ist ausdrücklich erst Gegenstand von #4C.

## Prüfungen vor Freigabe

- unauthentifizierter Zugriff auf persönliche Daten wird abgewiesen
- Benutzer A kann Daten von Benutzer B nicht lesen
- Benutzer A kann Daten von Benutzer B nicht verändern
- gültiger Benutzer kann eigenen Filmzustand lesen und schreiben
- Regeln werden versioniert und nach Änderungen erneut getestet

## Dependency-Hygiene

JavaScript-Abhängigkeiten werden über ein versioniertes `package-lock.json` reproduzierbar installiert. CI, Firebase-Deployment und TMDB-Smoke-Test verwenden `npm ci`. Die zentrale CI schlägt bei neuen High- oder Critical-Funden aus `npm audit` fehl.

Die aktuelle Bewertung einschließlich begründeter moderater Restbefunde ist im [Dependency-Audit](DEPENDENCY_AUDIT.md) dokumentiert. Sie ist Teil der technischen Vorarbeit für das Release-/Compliance-Gate #112.
