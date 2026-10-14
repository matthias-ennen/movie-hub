# Private Mailfunktionen bereitstellen (#384)

Stand 14.10.2026: Matthias' Screenshot um 12:00 Uhr bestätigt
**BUILDRECHTE ERFOLGREICH**. Das Setup hat die beiden Frankfurt-Buckets und die
Docker-Registry geprüft, die drei direkten Rechte für das Mail-Buildkonto ergänzt
und rückgelesen. Grundlage: [EMAIL_CLOUD_SETUP.md](EMAIL_CLOUD_SETUP.md).
Die Mailfunktionen sind noch nicht bereitgestellt, es wurde keine E-Mail versandt.

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

- [Cloud Functions deploy: Buildkonto, Triggerfilter, Env- und Secret-Referenzen](https://docs.cloud.google.com/sdk/gcloud/reference/functions/deploy)
- [Metadaten der Gen2-Funktionen und Ereignisfilter](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions)
- [Firestore-Trigger und getrennte Aufrufberechtigung](https://docs.cloud.google.com/firestore/native/docs/extend-with-cloud-run-functions)
