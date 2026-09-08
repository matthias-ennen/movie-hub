# Movie Hub – Security-Konzept

Stand: 31. August 2026

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

Bei aktivierter Option **Zugangsdaten auf diesem Gerät speichern und automatisch verbinden** wird das Kennwort mit AES-GCM verschlüsselt; der nicht exportierbare Schlüssel liegt im Android Keystore. Im Sitzungsmodus bleiben Benutzername und Kennwort nur im Arbeitsspeicher des App-Prozesses und werden beim bewussten Schließen, Abmelden oder spätestens mit dem Prozessende verworfen. Firestore, die Web-App und das Repository erhalten diese Zugangsdaten nicht. Auf jedem neuen Gerät müssen Verbindungen erneut eingerichtet werden.

**Verbindung trennen** deaktiviert die automatische Nutzung des Netzlaufwerks, löscht jedoch keine geschützt gespeicherten Zugangsdaten. Erst **Verbinden** aktiviert die Verbindung nach einer erneuten Erreichbarkeits- und Anmeldeprüfung. Movie Hub hält keine SMB-Sitzung dauerhaft im Hintergrund offen.

Movie Hub öffnet SMB ausschließlich als ausgehende Verbindung im Heimnetz. Eine Portfreigabe der FRITZ!Box ins Internet ist weder nötig noch vorgesehen.

## Client-Konfiguration

Die normale Firebase-Web-Konfiguration einschließlich Web-API-Key ist Teil der Client-Konfiguration und ersetzt keine Security Rules. Schutz entsteht durch Authentication, Rules und serverseitige Rechte.

## Prüfungen vor Freigabe

- unauthentifizierter Zugriff auf persönliche Daten wird abgewiesen
- Benutzer A kann Daten von Benutzer B nicht lesen
- Benutzer A kann Daten von Benutzer B nicht verändern
- gültiger Benutzer kann eigenen Filmzustand lesen und schreiben
- Regeln werden versioniert und nach Änderungen erneut getestet
