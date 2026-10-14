# Einmalige Mail-Grundlage in Google Cloud (#384)

Stand 14.10.2026: Der erneute Metadaten-Prüflauf nach der Secret-Viewer-Freigabe
erkennt eine aktive Version von `RESEND_API_KEY`. Das belegt weder die Gültigkeit
des Inhalts noch die Resend-Versandberechtigung. Der Token-Schlüssel war für den
Prüfer noch nicht lesbar; die dedizierten Mailkonten fehlen.

`scripts/setup-profile-email-cloud.py` richtet die folgende begrenzte Grundlage
im festen Projekt `movie-hub-62459` (Nummer `612913221205`) ein. Es wird einmalig
durch Matthias als Projektadministrator in Google Cloud Shell ausgeführt.
Der GitHub-Deployer erhält keine zusätzlichen projektweiten Administratorrollen.

## Genaue Änderungen

| Ressource | Neu angelegte Rechte bzw. Inhalt |
| --- | --- |
| `movie-hub-email` | Benutzerdefinierte Rolle mit Firestore-Datenbanklesen, Dokumentlesen/-abfragen/-erstellen/-ändern und Firebase-Auth-Benutzerlesen |
| `movie-hub-email-build` | `roles/logging.logWriter` im Projekt; Buildspeicherrechte folgen nach gesonderter Ressourcenprüfung |
| `movie-hub-email-events` | `roles/eventarc.eventReceiver` im Projekt; Aufrufrechte folgen später auf den beiden konkreten Maildiensten |
| `movie-hub-email-scheduler` | Zunächst keine Projektrolle; später Aufrufrecht nur auf dem Mail-Retry-Dienst |
| Vier neue Dienstkonten | `roles/iam.serviceAccountUser` für den bestehenden GitHub-Deployer jeweils direkt am Konto |
| `MOVIE_HUB_EMAIL_TOKEN_KEY` | 48 kryptografisch zufällige Bytes als 64 URL-sichere Zeichen, Replikation Frankfurt; Erzeugung nur ohne vorhandene Version |
| Beide Mail-Secrets | `secretAccessor` ausschließlich für die Mail-Laufzeit; `viewer` für den GitHub-Deployer jeweils direkt am Secret |

Die Tabelle beschreibt die vom Skript erteilten Rechte, keine vollständige
Analyse aller geerbten Projekt-/Organisationsrechte. Bestehende IAM-Bindungen
werden erhalten. Eine vorhandene abweichende Mailrolle führt zum Abbruch.
Neue Bindungen und Konten werden nach dem Schreiben rückgelesen. Es gibt keine
Editor-/Owner-Vergabe und keine Änderung der TV-Konten oder Standardkonten.

Der zufällige Schlüssel wird über Standardeingabe an Secret Manager übertragen,
nicht als Kommandoargument, Datei oder Terminalausgabe. HTTP- und Datei-Logging
des Cloud SDK sind für diese Befehle ausgeschaltet. Kein Secret-Wert wird gelesen.
Ein vorhandener Schlüssel wird nicht rotiert. Wenn nur ein leerer Secret-Container
nach einer unterbrochenen Einrichtung existiert, darf dessen erste Version
angelegt werden. Eine deaktivierte neueste Version führt dagegen zum Abbruch.

## Ausführen

1. [Google Cloud Shell im MovieHub-Projekt öffnen](https://console.cloud.google.com/home/dashboard?project=movie-hub-62459&cloudshell=true).
2. Die geprüfte Skriptversion aus dem im Arbeitsschritt genannten festen
   Git-Commit herunterladen. Die vollständige, auf diesen Commit festgelegte
   Downloadzeile wird Matthias nach Prüfung der Änderung mitgeteilt.
3. `python3 setup-profile-email-cloud.py --apply` ausführen. Eine Cloud-Shell-
   Autorisierung, falls angezeigt, gilt für das eigene Google-Cloud-Konto.
4. Erfolgszeile: **EINRICHTUNG ERFOLGREICH: Mailkonten, Rollen und Secret-Metadaten rückgeprüft.**
   Bei `STOPP` nur diese Fehlerzeile zurückmelden, keine Schlüsselwerte.

Ohne `--apply` prüft das Skript ausschließlich Metadaten und zeigt den Umfang.
Bei Abbruch können bereits angelegte Teilressourcen erhalten bleiben. Derselbe
Befehl kann nach Klärung des Fehlers erneut laufen; er überspringt bestätigte
Ressourcen und Bindungen. Nicht gleichzeitig in mehreren Terminals ausführen.

## Danach noch erforderlich

Der reine Grundlagenlauf legt **keine Functions, Trigger, Indizes oder
Scheduler-Jobs** an und versendet nichts. Danach folgt eine unabhängige
GitHub-Metadatenprüfung. Der gesamte Infrastruktur-Prüflauf bleibt bis zum
späteren Index-/Function-Deploy erwartungsgemäß unvollständig.

Anschließend: vorhandenen Buildspeicher in Frankfurt gezielt prüfen und
freigeben, Mail-Index bereitstellen, isolierte Functions zunächst ausgeschaltet
ausrollen, konkrete Dienst-Aufrufrechte einrichten, Resend-Testempfänger
feststellen und erst dann den begrenzten Versandtest aktivieren. Dafür genügt
die Resend-Kontoadresse mit dem provisorischen Absender; die eigene Domain
wird später getrennt verifiziert. Keine privaten Empfängeradressen ins Repository.

## Prüfungen und Referenzen

`python3 scripts/test-profile-email-cloud.py` prüft mit simulierten Cloud-Antworten
Ersteinrichtung, Wiederholung ohne Rotation, lesenden Modus, fehlende Rechte,
abweichende Rollen, deaktivierte aktuelle Secret-Versionen, Wiederaufnahme nach
Unterbrechung, fehlgeschlagenes IAM-Rücklesen und die geschützte Schlüsselübergabe.
Der Test ersetzt keinen erfolgreichen Lauf mit dem tatsächlichen Cloud-Konto.

- [Eigene Buildidentität und erforderliche Rollen](https://docs.cloud.google.com/functions/docs/building)
- [Eventarc-Empfänger und dienstbezogene Aufrufrechte](https://docs.cloud.google.com/eventarc/docs/roles-permissions)
- [Secret-Erzeugung mit Standardeingabe](https://docs.cloud.google.com/sdk/gcloud/reference/secrets/create)
- [Secret-Manager-Rollen](https://docs.cloud.google.com/secret-manager/docs/access-control)
- [Cloud-SDK-Loggingkonfiguration](https://docs.cloud.google.com/sdk/gcloud/reference/config/set)
