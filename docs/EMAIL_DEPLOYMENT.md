# Private Mailfunktionen bereitstellen (#384)

## Bestätigter Stand am 14.10.2026, 13:24 Uhr

Der neue [Prepare-Lauf #2](https://github.com/matthias-ennen/movie-hub/actions/runs/38554131325)
auf Main `e3447d28b74eae724d9941466f12b19322dc31d0` ist erfolgreich.
Alle vier Funktionen wurden als ACTIVE, privat und ausgeschaltet geprüft.
Matthias' Screenshot um 13:23 Uhr bestätigt außerdem die drei unabhängig
rückgelesenen `roles/run.invoker`-Bindungen: Ereigniskonto auf
`profileemailpreferences` und `profileemailnotification`, Schedulerkonto auf
`profileemailretry`. Alle drei Richtlinien enthalten keinen öffentlichen Zugriff.

Als nächstes ergänzt `scripts/setup-profile-email-index.py --apply` ausschließlich
den Collection-Group-Index `emailDeliveries.queueAt` in aufsteigender Reihenfolge.
Ohne `--apply` wird nur gelesen. Vor der Änderung prüft das Skript Projekt,
Datenbankregion, Feldziel und vorhandene Indexdefinitionen. Der einzelne REST-Patch
mit `updateMask=indexConfig` übernimmt alle gelesenen Feldindizes und fügt nur den
benötigten Index hinzu. TTL-Einstellungen und andere Felder werden nicht geschrieben.
Geerbte Indexdefinitionen werden dabei als ausdrückliche Feldkonfiguration erhalten;
spätere Änderungen an übergeordneten Standardindizes werden für dieses Feld nicht
mehr automatisch übernommen. Unbekannte Indexoptionen führen zum Abbruch.

Unmittelbar vor dem Patch wird das Feld erneut gelesen und auf Änderungen geprüft.
Die Field-API bietet keine ETag-Vorbedingung; während der Einrichtung soll deshalb
keine parallele Bearbeitung dieses Feldindex stattfinden. Anschließend wird bis zu
fünf Minuten auf `READY` geprüft. Ein laufender Aufbau wird bei Wiederholung nur
weiter geprüft. `INDEX NOCH IM AUFBAU` ist kein Erfolg; später erneut prüfen.
Der Helfer liest keine Dokumente/Secrets, vergibt keine Rechte und richtet keinen
Zeitplan ein. Der Versand bleibt ausgeschaltet. Der private Minutenjob folgt erst
nach dem bereiten Index; Aktionsseite und kontrollierter Versandtest bleiben offen.

Referenzen: [gezielter Field-Patch](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.collectionGroups.fields/patch),
[Feldkonfiguration und Vererbung](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.collectionGroups.fields).

## Verlauf der Bereitstellung

Stand 14.10.2026: Matthias' Screenshot um 12:00 Uhr bestätigt
**BUILDRECHTE ERFOLGREICH**. Das Setup hat die beiden Frankfurt-Buckets und die
Docker-Registry geprüft, die drei direkten Rechte für das Mail-Buildkonto ergänzt
und rückgelesen. Grundlage: [EMAIL_CLOUD_SETUP.md](EMAIL_CLOUD_SETUP.md).
Erster manueller Lauf am 14.10.2026, 12:27 Uhr:
[38549712845](https://github.com/matthias-ennen/movie-hub/actions/runs/38549712845)
auf Main `93d9cf7` hat `profileEmailAction` und `profileEmailRetry` erstellt und
vollständig rückgeprüft. Bei `profileEmailPreferences` stoppte der Cloud-Befehl
um 12:30 Uhr mit `permission-or-authentication`; `profileEmailNotification`
wurde danach nicht mehr angefasst. Der genaue Grund wird lesend diagnostiziert.
Versand bleibt aus; kein Retry-Zeitplan oder Index wurde eingerichtet.

Der Besitzer-Auditbefund um 12:51 bestätigt `cloudfunctions.functions.create`
als erlaubt; die ursprüngliche Ablehnung betrifft den Google-Eventarc-Service-Agent
(Status 9) und nennt anfängliche Rechteausbreitung als mögliche Ursache. Dessen passende Projektrolle
ist inzwischen im Preflight nachgewiesen. Ein begründeter zweiter Versuch desselben
Laufs stoppte am 14.10. um 12:54 beim Update von `profileEmailAction`:
`run.services.setIamPolicy` wurde verweigert. Ursache ist das erneut übergebene
`--no-allow-unauthenticated`, das auch bei bereits privaten Diensten IAM schreibt.
Bei geprüften Bestandsfunktionen wird dieses Flag deshalb weggelassen; ihre private
IAM-Konfiguration wird davor und danach weiterhin zwingend geprüft. Neue HTTP-
Funktionen werden weiter explizit privat angelegt. Keine neue IAM-Rolle erforderlich.
Ein neuer manueller Lauf auf dem korrigierten Main ist erforderlich; **Re-run jobs**
des alten Laufs verwendet weiterhin dessen alten Commit und enthält die Korrektur nicht.
Die bekannte Eventarc-Meldung wird künftig direkt als feste Diagnosekennung
`eventarc-service-agent-propagation-or-role` protokolliert, ohne rohe Fehlermeldung.

Die vorhandene Preflight-Ausführung liest zusätzlich die Zustände der vier festen
Mail-Functions, ausgewählte projektweite Dienstkonto-Rollen und bis zu fünf Seiten
Cloud-Functions-Vorgangsmetadaten. Nur die jeweils drei neuesten Vorgänge der exakt
passenden Mailziele werden ausgewertet. Aus Fehlern erscheinen ausschließlich
erkannte Berechtigungsnamen, fest erlaubte Rollen, Konto-Aliase und Fehlerkategorien.
Keine rohen Fehlermeldungen, Umgebungswerte, Secret-Inhalte oder Dokumentdaten.
Das kurzlebige Cloud-Zugriffstoken bleibt im Prozess und wird nur an den festen
Google-Metadatenendpunkt übertragen; Weiterleitungen sind gesperrt.
Der Diagnose-Workflow kann keine Rechte vergeben oder Bereitstellung wiederholen.
Ein unlesbarer oder begrenzter Bericht wird ausdrücklich als solcher gekennzeichnet.
Weil eine abgewiesene Erstellung noch keinen Cloud-Vorgang erzeugt haben muss,
werden ergänzend höchstens 30 fehlgeschlagene Functions-/Eventarc-Auditereignisse
des letzten Tages für den GitHub-Deployer und die beiden zugehörigen Dienst-Agents
gelesen. Auch daraus erscheinen nur Fehlercodes und erkannte Diagnosekennungen,
keine Audit-Nutzdaten oder rohen Fehlermeldungen.

## Manueller Start nach geprüftem Merge

1. GitHub Actions: [Profile email server prepare (sending disabled)](https://github.com/matthias-ennen/movie-hub/actions/workflows/profile-email-prepare.yml).
2. **Run workflow**, Branch **main**, nochmals **Run workflow**.
3. Den Lauf auswerten; nach erfolgreichem Abschluss steht in der Zusammenfassung
   die Liste der vier geprüften privaten Dienste. Ein grüner Lauf ist kein
   Versand- oder Zustellnachweis.

Es gibt keinen Push-/Zeitplan-Auslöser und keinen Eingabeschalter zum Einschalten
des Versands. Die vorhandene Hosting-Veröffentlichung startet diesen Workflow
nicht. Der GitHub-Connector kann Logs lesen und fehlgeschlagene Jobs wiederholen,
aber keinen ersten manuellen Workflow-Lauf starten; diesen Klick übernimmt Matthias.

## Festgelegter Umfang

`scripts/prepare-profile-email-deploy.mjs --apply` stellt ausschließlich vier
Gen2-Funktionen in `movie-hub-62459`, `europe-west3` bereit:

| Funktion | Einstieg und Zweck |
| --- | --- |
| `profileEmailAction` | Privater HTTP-Einstieg; später tokengebundene Bestätigungs-/Abmeldeseite |
| `profileEmailRetry` | Privater HTTP-Einstieg, nur POST; später für den dedizierten Minutenjob |
| `profileEmailPreferences` | Firestore-Writes auf `users/{uid}/profiles/{profileId}/emailPreferences/current` |
| `profileEmailNotification` | Firestore-Writes auf `users/{uid}/profiles/{profileId}/notifications/{eventId}` |

Beide Ereignisfilter beschränken Datenbank und Namespace auf `(default)`.
Die Trigger verwenden `movie-hub-email-events`, die Laufzeit `movie-hub-email`,
der Build `movie-hub-email-build`. Pro Funktion höchstens eine Instanz und ein
gleichzeitiger Aufruf, keine Mindestinstanz, 256 MiB und 120 Sekunden Zeitlimit.
Der GitHub-Deployer erhält durch diesen Workflow keine neuen IAM-Rechte.

Die Env-Datei liegt nur temporär außerhalb des Upload-Quellordners und enthält
keine Secrets. Fest gesetzt sind `MOVIE_HUB_EMAIL_ENABLED=false`, leere
Versandstartzeit/Aktions-URL, die vorhandene Web-App als App-URL, Frankfurt und
die dedizierte Laufzeitidentität. Vorbereiteter Absender:
`MovieHub <onboarding@resend.dev>`. Die zwei Secrets werden ausschließlich anhand
aktiver Versionsmetadaten auf konkrete numerische Versionen festgelegt. Weder
Secret-Werte noch Profildaten werden im Deployment gelesen oder ausgegeben.

Das Upload-Paket wird aus `email-functions/` mit eigenem Lockfile aufgebaut.
`.gcloudignore` schließt lokale Abhängigkeiten, Env-/Secret-Dateien und Gitdaten
aus, erhält aber die von `prepare-email-function.mjs` kopierten `server/`- und
`src/`-Module. Alle vier Exporte werden vor der Cloud-Anmeldung importiert.

## Prüfungen und Wiederholung

Vor dem ersten Deploy werden Projekt, Datenbankregion, alle vier Mailkonten,
Secret-Versionen, Scheduler-Bestand und alle bereits vorhandenen Ziel-Funktionen
gelesen. Eine bereits aktivierte oder anders konfigurierte Mailfunktion, ein
vorhandener Mail-Zeitplan oder eine nicht lesbare Voraussetzung führen zum Abbruch.
Nicht lesbar bedeutet niemals fehlend.

Vorhandene Dienste müssen private IAM-Bindungen und einen aktiven Invoker-IAM-Check
haben. Nach jedem Deploy werden Name, Gen2-/Node-Version, Einstieg, Build-/Laufzeit-
identität, ausgeschaltete Konfiguration, numerische Secret-Referenzen,
Ressourcenlimits, Ereignispfade/-identität sowie Cloud-Run-Ziel/HTTPS-URL geprüft.
Der gesamte Verkehr muss auf der geprüften neuesten Revision liegen; gemischte
alte/neue Revisionen werden nicht als bestätigter ausgeschalteter Stand akzeptiert.
Anschließend wird erneut dessen dienstbezogene IAM-Konfiguration geprüft.
Der Workflow ändert keine Dienst-IAM-Bindungen. Der abschließende Scheduler-Check
bestätigt, dass weiterhin kein Mail-Job existiert. Andere Zeitpläne werden nicht verändert.

Bei Fehlern stoppt die Bereitstellung weiterer Funktionen; bereits erfolgreich
bereitgestellte Funktionen bleiben ausgeschaltet erhalten. Ein erneuter Lauf kann
bestätigte private, ausgeschaltete Teilstände weiterverwenden. Ein noch laufender
oder nicht sicher überprüfbarer Fehlstand erfordert zuerst Diagnose, keine
automatische Löschung. SDK-Fehler enthalten nur Kategorie und gegebenenfalls den
Berechtigungsnamen, keine rohen Provider-Antworten.

## Danach erforderlich

- Die beiden Eventdienste erhalten `roles/run.invoker` ausschließlich für
  `movie-hub-email-events`; der Retry-Dienst ausschließlich für
  `movie-hub-email-scheduler`. Die tatsächlichen Dienstnamen vorher auslesen.
- Nur die Aktionsseite wird später öffentlich erreichbar. Ihre Tokens bleiben
  im URL-Fragment, GET/HEAD ändern nichts; Bestätigung/Abmeldung erst durch POST.
- Den Collection-Group-Index `emailDeliveries.queueAt` gezielt ergänzen und READY
  abwarten, ohne andere Indizes zu entfernen. Dieser Workflow deployt keine Indizes.
- Genau einen privaten Retry-Minutenjob mit dedizierter OIDC-Identität einrichten.
  Der HTTP-Handler prüft POST und den aktivierten Mailkanal; interne Fehlerdaten
  verlassen ihn nicht. Es gibt keinen impliziten `onSchedule`-Deploy mehr.
- Resend-Kontoadresse als ausdrücklich vorgesehenen Testempfänger feststellen,
  Aktions-URL/Startzeit und begrenzte Testfreigabe setzen. Erst dann Versand aktivieren.
  Keine privaten Empfängeradressen ins Repository schreiben.
- Einstellungen erneut speichern und Bestätigung, alle drei Meldungsphasen,
  Opt-out/Wiederholung sowie echten Empfang mit Matthias prüfen. #384 bleibt offen.

Der manuelle Prepare-Workflow eignet sich **nicht** zur Notabschaltung einer
bereits aktivierten Installation: Er verweigert ausdrücklich deren Überschreibung.
Eine spätere Abschaltung muss die Aktivierung gezielt zurücknehmen.

## Referenzen

- [Cloud-Functions-Vorgänge lesend auflisten](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.operations/list)
- [Cloud Functions deploy: Buildkonto, Triggerfilter, Env- und Secret-Referenzen](https://docs.cloud.google.com/sdk/gcloud/reference/functions/deploy)
- [Metadaten der Gen2-Funktionen und Ereignisfilter](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions)
- [Firestore-Trigger und getrennte Aufrufberechtigung](https://docs.cloud.google.com/firestore/native/docs/extend-with-cloud-run-functions)
