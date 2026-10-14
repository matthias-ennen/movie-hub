# Einmalige Mail-Grundlage in Google Cloud (#384)

Stand 14.10.2026, Rückmeldung 11:34 Uhr: Der Cloud-Shell-Lauf meldet
**EINRICHTUNG ERFOLGREICH**. Vier Mailkonten, Rollen und Secret-Metadaten wurden
vom Einrichtungsskript rückgeprüft. Die zusätzliche GitHub-Prüfung scheiterte
anschließend an einem Fehler im Prüfer: `json(disabled)` kann bei einem aktiven
Konto ohne explizites `disabled=false` JSON `null` liefern. Der Prüfer fordert
jetzt zusätzlich die exakte Konto-E-Mail an und verarbeitet leere bzw.
unerwartete Metadaten ohne Abbruch des übrigen Berichts. Die erneute unabhängige
Prüfung und ihr exakter Laufnachweis werden in #384 dokumentiert.

Nachtrag 11:52 Uhr: Der korrigierte GitHub-Preflight bestätigt die Grundlage
(vier Konten, beide aktiven Secret-Versionen, exakte Laufzeitrolle/Zuweisung).
Matthias' lesende Bucket-Liste bestätigt beide Bestandsziele in Frankfurt.
Der tatsächliche Upload-Bucket verwendet zwischen Projektnummer und Region
einen **Punkt**. Der zuvor im Code verwendete Bindestrich adressierte einen
anderen, nicht existierenden Namen. Setup und Preflight wurden entsprechend
korrigiert; es ist kein neuer Speicher erforderlich. Der Cloud-Test verwendet
nun die beobachteten Namen unabhängig von den Konstanten des Setup-Skripts.
GitHubs fehlende Leserechte für Speicher-IAM bleiben davon getrennt; der
Cloud-Shell-Schritt prüft Projektzuordnung, Region und jede Bindung selbst.

Nachtrag 12:00 Uhr: Matthias' Screenshot bestätigt **BUILDRECHTE ERFOLGREICH**.
Die beiden Bucket-Bindungen und die Registry-Bindung für das Mail-Buildkonto sind
damit durch das Skript eingerichtet und rückgeprüft. Versand weiterhin aus.
Nächster vorbereiteter Schritt: [Private Mailfunktionen bereitstellen](EMAIL_DEPLOYMENT.md).

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

### Korrektur nach dem ersten Cloud-Shell-Lauf

Google dokumentiert, dass neu angelegte Dienstkonten erst nach 60 Sekunden oder
mehr sichtbar sein können. Der bisherige Code las sofort einmal zurück und
brach bei einem Fehler ab. Das passt zum beobachteten Fortschritt über mehrere
Läufe; der ursprüngliche SDK-Fehler wurde jedoch verkürzt und ist nicht als
konkreter Statuscode belegt.

Die korrigierte Version prüft frisch angelegte Konten mit begrenzten lesenden
Wiederholungen (2/4/8/16/30/30 Sekunden Wartezeit, zusätzlich Befehlslaufzeit).
Ein Existenzkonflikt beim Anlegen wird nur dann akzeptiert, wenn anschließend
die exakte Kontoidentität und ihr aktiver Zustand rückgelesen werden können.
Anlegebefehle werden nicht automatisch wiederholt. Vorher bestätigte Konten
werden weiterverwendet. Nicht lesbare oder deaktivierte Konten verhindern alle
nachfolgenden Rollen-/Secret-Schritte. Ein 403 wird ausschließlich bei dieser
begrenzten Rückprüfung eines gerade angelegten bzw. bereits existierenden Kontos
erneut gelesen, niemals als fehlendes Konto interpretiert.

Fehlerausgaben unterscheiden jetzt Anlage und Rückprüfung und nennen einen
festen Fehlercode samt Exit-Code. SDK-Antworten, Schlüsselwerte und persönliche
Daten bleiben ausgeblendet. Rechteumfang und Secret-Rotation bleiben unverändert.

## Abgeschlossener Schritt: begrenzte Buildspeicherrechte

Der separate Modus `--build-access` liest ausschließlich die vorhandene
Buildidentität und die drei festgelegten Speicherziele. `--build-access --apply`
ergänzt nur die folgenden direkten Bindungen für `movie-hub-email-build`:

| Bestandsressource | Rolle |
| --- | --- |
| `gcf-v2-sources-612913221205-europe-west3` | `roles/storage.objectViewer` |
| `gcf-v2-uploads-612913221205.europe-west3.cloudfunctions.appspot.com` | `roles/storage.objectViewer` |
| `projects/movie-hub-62459/locations/europe-west3/repositories/gcf-artifacts` | `roles/artifactregistry.writer` |

Vor dem ersten Schreibvorgang müssen das aktive Projekt, die aktive
Buildidentität, beide Bucket-Namen, deren Eigentümerprojekt und Frankfurt als
Region sowie die exakte Docker-Registry bestätigt sein. Alle drei IAM-Policies
müssen lesbar sein. Fehlende Ressourcen, andere Regionen/Projekte oder fehlende
Leserechte führen zum Abbruch; es wird kein Ersatzspeicher angelegt. Vorhandene
Bindungen werden erhalten. Jede neue Bindung wird rückgelesen. Bei späterem
Abbruch bleiben bestätigte Teiländerungen erhalten; ein erneuter Lauf überspringt sie.

Ausführung durch Matthias mit der im Chat mitgeteilten, auf einen geprüften
Git-Commit festgelegten Downloadzeile; anschließend:
`python3 setup-profile-email-cloud.py --build-access --apply`.

Erfolgszeile: **BUILDRECHTE ERFOLGREICH: Zwei Quell-Buckets und eine Docker-Registry rückgeprüft.**
Dieser Modus liest keine Secrets, legt keine Funktionen oder Zeitpläne an und
schaltet den Versand nicht ein. Die zuvor abgeschlossene Grundlagen-Einrichtung
wird dabei nicht erneut ausgeführt. Ohne `--apply` bleibt auch dieser Modus lesend.

Der GitHub-Preflight prüft nun zusätzlich diese drei Speicherziele und deren
direkte Builder-Bindungen. Nicht lesbare Policies sind kein Beleg für fehlende
Bindungen. Der Prüfbericht bleibt unvollständig, solange Index und Mail-Functions
noch nicht bereitgestellt sind.

## Danach noch erforderlich

Der reine Grundlagenlauf legt **keine Functions, Trigger, Indizes oder
Scheduler-Jobs** an und versendet nichts. Danach folgt eine unabhängige
GitHub-Metadatenprüfung. Der gesamte Infrastruktur-Prüflauf bleibt bis zum
späteren Index-/Function-Deploy erwartungsgemäß unvollständig.

Anschließend: isolierte Functions zunächst ausgeschaltet ausrollen,
Mail-Index bereitstellen, konkrete Dienst-Aufrufrechte einrichten, Resend-Testempfänger
feststellen und erst dann den begrenzten Versandtest aktivieren. Dafür genügt
die Resend-Kontoadresse mit dem provisorischen Absender; die eigene Domain
wird später getrennt verifiziert. Keine privaten Empfängeradressen ins Repository.

## Prüfungen und Referenzen

`python3 scripts/test-profile-email-cloud.py` prüft mit simulierten Cloud-Antworten
Ersteinrichtung, Wiederholung ohne Rotation, lesenden Modus, fehlende Rechte,
abweichende Rollen, deaktivierte aktuelle Secret-Versionen, Wiederaufnahme nach
Unterbrechung, fehlgeschlagenes IAM-Rücklesen und die geschützte Schlüsselübergabe.
Insgesamt 20 Tests einschließlich verzögerter Kontosichtbarkeit, Existenzkonflikt
mit anschließender Identitätsprüfung, dauerhaft verweigertem Lesen, deaktiviertem
Bestandskonto, sofortigem Abbruch bei initialem Berechtigungs-/Anlegefehler und
bereinigter SDK-Fehlerkategorie. Fünf weitere Tests prüfen den Buildmodus:
ausschließlich drei direkte Bindungen, unveränderte Fremdbindungen,
wiederholbarer/lesender Lauf, vollständige Zielprüfung vor dem ersten Schreiben,
Abbruch bei fehlenden/unlesbaren Zielen und fehlgeschlagener IAM-Rückprüfung.
Vier Regressionstests des Preflights decken weggelassene Statusfelder, leere oder
fehlerhafte Metadaten, falsche/deaktivierte Identitäten sowie getrennte
Berechtigungs-/Nichtgefunden-Fehler ohne rohe Provider-Ausgaben ab.
Der Test ersetzt keinen erfolgreichen Lauf mit dem tatsächlichen Cloud-Konto.

- [Eigene Buildidentität und erforderliche Rollen](https://docs.cloud.google.com/functions/docs/building)
- [Verzögerte Sichtbarkeit neuer Dienstkonten](https://docs.cloud.google.com/iam/docs/service-accounts-create)
- [Eventarc-Empfänger und dienstbezogene Aufrufrechte](https://docs.cloud.google.com/eventarc/docs/roles-permissions)
- [Secret-Erzeugung mit Standardeingabe](https://docs.cloud.google.com/sdk/gcloud/reference/secrets/create)
- [Secret-Manager-Rollen](https://docs.cloud.google.com/secret-manager/docs/access-control)
- [Cloud-SDK-Loggingkonfiguration](https://docs.cloud.google.com/sdk/gcloud/reference/config/set)
