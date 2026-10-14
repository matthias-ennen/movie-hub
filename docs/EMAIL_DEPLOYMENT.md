# Private Mailfunktionen bereitstellen (#384)

## Aktueller Tagesabschluss – 14.10.2026, 19:22 Uhr

**Die Testinstallation ist aktiv; der erste echte TV-Mail-Empfang ist bestätigt.**
Matthias' Lauf um 18:57 aktualisierte Preferences/Notification aus
`aa599a788d27201d2894bc1bfb03177e7ce1f20b` mit `--refresh-events` und endete mit
`EREIGNISFUNKTIONEN AKTUALISIERT`. Um 19:14 bestätigt er Empfang und positives
Layoutfeedback. Die zweite TV-Mail und weitere Abnahmen bleiben offen.
Domainregistrierung bestätigt, eigene Resend-/DNS-Konfiguration noch nicht.

Für einen neuen Chat zuerst die [Übergabe](_work/EMAIL_384.md) lesen. Die folgenden
Abschnitte dokumentieren frühere Stufen und deren Bedienung, keinen Auftrag zum
erneuten Durchlaufen. Insbesondere kein ausgeschaltetes Prepare auf die aktive
Installation anwenden. Beim heutigen Schlusspunkt bleiben Testversand und Jobs
aktiv; Domain-/Absenderumstellung wird in der nächsten Sitzung fortgeführt.

## CloudEvent-Einstiege korrigieren – 14.10.2026, 16:06 Uhr

Screenshot `1000062564.jpg` bestätigt das installierte Diagnoseupdate.
Der anschließende frische Fehler (`1000062566.jpg`, 14:06:20 UTC) lautet
`mail-account-unavailable sdk=auth/invalid-uid http=unknown hints=unknown`.
Damit liegt der beobachtete Abbruch bei der UID-Validierung vor dem Auth-Netzaufruf.

Der Fehler wurde mit dem tatsächlichen Quellpaket lokal reproduziert: Der
Functions-Framework-Loader übernimmt bei nicht registrierten Exporten seinen
HTTP-Standard, ohne die Firebase-`__endpoint`-Metadaten auszuwerten. Ein binärer
Firestore-CloudEvent-POST erreicht den Firebase-Wrapper dann als Express-Request.
`event.document` fehlt, die extrahierten `params` sind leer und `getUser(undefined)`
erzeugt denselben Fehler. Der frühere reine Importtest hat diesen Eingang nicht
ausgeführt und konnte den Fehler deshalb nicht erkennen.

`email-functions/index.mjs` registriert Preferences und Notification jetzt
ausdrücklich als `cloudEvent`, Action und Retry als `http` im Functions Framework.
Das Framework ist eine direkte, im Lockfile festgelegte Paketabhängigkeit.
Die Firebase-Wrapper samt Ereignis-/Deployment-Metadaten bleiben erhalten.
Vor dem Mailservice prüft `mailEventIdentity` Ereignistyp, UID, Profilkennung,
Mitteilungskennung und deren Übereinstimmung mit dem erwarteten Dokumentpfad.
Ungültige Übergaben enden mit dem festen Fehler `invalid-mail-event`, ohne
Kontoprüfung, Datenbankarbeit oder Wiedergabe von Nutzdaten.

`scripts/test-profile-email-entrypoints.mjs` lädt die echten Exporte über den
Functions-Framework-Loader mit HTTP als Ausgangseinstellung und sendet lokale
binäre Protobuf- sowie strukturierte JSON-Ereignisse an dessen HTTP-Server.
Sechs Prüfungen decken Registrierungen, Haupt-/Unterprofile, Schreib-/Löschereignisse,
die Mitteilungspfade, fehlerhafte Übergaben und die HTTP-Verträge von Action/Retry ab.
Auth/Firestore werden dabei im Testprozess ersetzt; externe Fetch-Aufrufe sind
gesperrt. Kein Cloud-Zugriff oder E-Mail-Versand. Dieser Test läuft in CI und im
manuellen Prepare-Workflow vor der Cloud-Anmeldung.

Nach geprüftem Merge das festgelegte Archiv laden und als Besitzer
`node scripts/activate-profile-email-test.mjs --refresh-events` ausführen.
Der Modus verlangt die vollständige bestehende Testkonfiguration und aktualisiert
ausschließlich `profileEmailPreferences` und `profileEmailNotification`.
Umgebung, Empfängerbegrenzung, Startzeit und Secret-Versionen bleiben erhalten;
IAM und Scheduler werden nicht geändert. Jede Funktion wird direkt nach dem
Update geprüft, anschließend nochmals alle vier Funktionen, Aufrufrechte und der
private Minutenjob. Bei einem Teilabbruch setzt derselbe Befehl mit derselben
Kontoadresse fort. Der Modus darf nicht mit anderen Modi kombiniert werden.

Erwarteter Abschluss: **EREIGNISFUNKTIONEN AKTUALISIERT**. Danach einmal die
Profil-E-Mail-Einstellungen speichern und den tatsächlichen Empfang prüfen.
Eine erfolgreiche lokale Reproduktion und Korrektur ersetzt diesen Cloud-Test
nicht. Bei weiterhin fehlender Mail frische Preferences-Fehler lesen. Issue #384
bleibt bis zu Empfang, Linkprüfung und fachlicher Abnahme offen.

Referenzen: [CloudEvent-Registrierung](https://github.com/GoogleCloudPlatform/functions-framework-nodejs/blob/main/docs/cloudevents.md),
[Firestore-CloudEvent-Beispiel](https://docs.cloud.google.com/run/docs/triggering/trigger-functions-with-firestore-documents),
[Firebase-Admin-Fehler](https://firebase.google.com/docs/auth/admin/errors).

## Kontoprüfung diagnostizieren – 14.10.2026, 15:32 Uhr

Die Besitzerprüfung um 14:49 Uhr bestätigt die aktive Testkonfiguration.
Ein echter E-Mail-Empfang wurde weiterhin nicht bestätigt. Der Screenshot um
15:01 Uhr zeigt stattdessen HTTP 500 mit `mail-account-unavailable` aus
`accountAvailable → reconcile`: `auth.getUser(uid)` scheitert vor Bestätigung,
Queue und Resend. Um 15:32 Uhr sind `firebaseauth.users.get` in der vorgesehenen
Laufzeitrolle und deren bedingungslose Bindung an das Mail-Laufzeitkonto bestätigt.
Die gezielte Identity-Toolkit-Auditabfrage liefert keine Einträge; daraus lässt
sich weder eine erfolgreiche Kontoprüfung noch eine konkrete Ursache ableiten.

`server/email/accountFailure.mjs` erhält deshalb nur fest erlaubte SDK-Codes,
HTTP-Statuscodes und bekannte API-/Berechtigungshinweise in der Fehlermeldung.
Unbekannte Werte werden `unknown`. Originalfehler, `cause`, Provider-Antwort,
Header, UID, Adresse und Tokens werden nicht protokolliert. Fehlende oder gesperrte
Konten werden weiterhin ohne Versand übersprungen. Die Oberfläche nennt bei
fehlendem Bestätigungsstatus jetzt die ausstehende Bestätigung; sie behauptet
keinen bekannten Zustand der Cloud-Versandfreigabe.

Nach geprüftem Merge das genaue Archiv laden und als Besitzer
`node scripts/activate-profile-email-test.mjs --refresh-preferences` ausführen.
Die interaktive Kontoadresse muss der bestehenden Resend-Testadresse entsprechen.
Dieser separate Modus verlangt zuerst dieselbe vollständig aktive Konfiguration
wie `--verify-active`, einschließlich eingeschaltetem privaten Minutenjob und
erreichbarer Aktionsseite. Er aktualisiert ausschließlich `profileEmailPreferences`
aus der geprüften Quelle. Ohne Env-Änderungsflags bleiben sämtliche bisherigen
Umgebungsvariablen erhalten; die numerischen Secret-Versionen werden beibehalten.
Es gibt keine IAM-/Jobänderung, keine neue Empfängerfreigabe oder Startzeit.
Alle vier Funktionskonfigurationen und Aufrufrechte sowie der Minutenjob werden
anschließend erneut geprüft. Der Modus lässt sich nicht mit `--apply` oder
`--verify-active` kombinieren. Bei Abbruch kann diese einzelne Funktion schon
aktualisiert sein; eine fehlende Abschlussprüfung ist kein bestätigter Erfolg.

Erwarteter Abschluss: **KONTOPRÜFUNGS-DIAGNOSE BEREIT**. Danach einmal die
Profil-E-Mail-Einstellungen speichern und frische Logs von
`profileemailpreferences` auf `mail-account-unavailable sdk=` lesen. Aus dem
festen Fehlercode folgt der nächste gezielte Reparaturschritt. Das Diagnoseupdate
behebt die noch unbekannte Ursache nicht und ist kein Versand-/Empfangsnachweis.
Die übrigen drei Cloud-Funktionen erhalten diesen Diagnosecode bei einem späteren
vollständigen Mail-Update. Issue #384 bleibt bis zum tatsächlichen Empfang und
der fachlichen Abnahme offen.

Referenzen: [Firebase-Admin-Fehler](https://firebase.google.com/docs/auth/admin/errors),
[accounts.lookup](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/lookup),
[gcloud functions deploy](https://docs.cloud.google.com/sdk/gcloud/reference/functions/deploy).

## Abschlussprüfung nach Scheduler-URL-Normalisierung

Der Besitzerlauf am 14.10.2026 um 14:25 Uhr hat alle vier Testfunktionen
bereitgestellt und die öffentliche Aktionsseite bestätigt. Die abschließende
Scheduler-Prüfung stoppte an einem zu strengen Zeichenkettenvergleich:
Der Screenshot um 14:29 Uhr zeigt die Retry-Service-URL ohne abschließenden Slash,
die Scheduler-Zieladresse mit `/` und die OIDC-Audience weiterhin exakt ohne Slash.
Der Job ist `ENABLED`; `lastAttemptTime` liegt bei 12:29 UTC und `status` ist leer.
Das ist noch kein Nachweis einer zugestellten E-Mail.

Die Prüfung akzeptiert jetzt ausschließlich die zwei Schreibweisen desselben
HTTPS-Cloud-Run-Ursprungs mit leerem Pfad bzw. `/`. Andere Hosts, Pfade, Querys,
Fragmente, Anmeldedaten und Ports bleiben ausgeschlossen. Die OIDC-Audience
wird weiterhin exakt mit der rückgelesenen Service-URL verglichen.
Auch die Suche nach kollidierenden Jobs erkennt beide Ziel-Schreibweisen.

Nach dem geprüften Merge das korrigierte Archiv laden und ausschließlich
`node scripts/activate-profile-email-test.mjs --verify-active` ausführen.
Die interaktive Resend-Kontoadresse muss der bisherigen Testadresse entsprechen.
Dieser Modus verlangt vier eingeschaltete Funktionen mit derselben vollständigen
Testkonfiguration, passende Aufrufrechte, Secret-Metadaten, den READY-Index,
einen eingeschalteten privaten Minutenjob und eine erreichbare Aktionsseite.
Er führt nur Metadatenabfragen und den zustandsfreien GET aus; kein Deployment,
keine IAM-/Jobänderung, keine neue Startzeit und kein Versandauftrag.
`--apply` und `--verify-active` dürfen nicht kombiniert werden.

Erwarteter Abschluss: **TESTVERSAND GEPRÜFT**. Danach folgen Profil-Einstellungen
und echter Empfangstest wie unten beschrieben. Ein Konfigurationsnachweis ersetzt
weder den tatsächlichen E-Mail-Empfang noch dessen Abnahme.

## Kontrollierten Testversand aktivieren

Matthias hat am 14.10.2026 um 13:43 Uhr `INDEX BEREIT` bestätigt.
Die Resend-Kontoadresse für den ersten Empfangstest ist im Chat ausdrücklich
benannt; sie wird nicht in Repository, Issue oder Workflow-Eingaben gespeichert.

Nach geprüftem Merge wird der genaue Commit als Archiv in ein frisches temporäres
Cloud-Shell-Verzeichnis geladen. Dort startet der Besitzer mit Node.js 22 oder neuer
`node scripts/activate-profile-email-test.mjs --apply`. Der Helfer fragt die
Resend-Kontoadresse interaktiv ab, normalisiert sie wie die App und hinterlegt nur
ihren SHA-256-Fingerabdruck in der Cloud-Konfiguration. Ohne `--apply` liest er nur.
Kein neuer API-Schlüssel wird benötigt; die bereits geprüften numerischen
Secret-Versionen werden weiterverwendet, ohne ihre Inhalte auszulesen.

Der Helfer prüft alle vier vorhandenen Functions, ihre privaten Aufrufrechte,
den READY-Index, Secret-Versionsmetadaten und bestehende Zeitpläne vor Änderungen.
Er stellt das geprüfte Mail-Quellpaket mit genau einer zugelassenen Empfängeradresse,
einem festen Versandstart und der tatsächlichen Aktions-URL bereit. Zuerst folgen
Action und Retry, dann die beiden Ereignisfunktionen. Nur `profileemailaction`
erhält die öffentliche Invoker-Bindung für die tokengebundene Bestätigungs-/Abmeldeseite.
Ein anonymer GET muss genau die erwartete Seite liefern, bevor weitere Funktionen
aktiviert werden. GET/HEAD verarbeiten weiterhin keine Tokens oder Profiländerungen.

Abschließend wird genau `movie-hub-email-retry-1min` in Frankfurt eingerichtet:
POST jede Minute in UTC, OIDC über das dedizierte Schedulerkonto, Audience gleich
der rückgelesenen Retry-URL, 120 Sekunden Deadline und keine zusätzlichen
Scheduler-Retryversuche. Die fachlichen Wiederholungen steuert die vorhandene
Firestore-Queue. Andere Zeitpläne, insbesondere TV-Erinnerungen, bleiben unberührt.
Der Helfer prüft die fertige Jobkonfiguration; ein erfolgreicher Jobaufruf und
echter E-Mail-Empfang sind anschließend gesondert zu bestätigen.

Für `resend.dev` verweigert der Transport eine Aktivierung ohne gültigen
Empfängerfingerabdruck. Andere Adressen werden vor Queue-/Budget-Erstellung und
zusätzlich unmittelbar vor dem Netzaufruf ausgeschlossen; bestehende unzulässige
Queue-Einträge werden ohne Versand beendet. Die normale Verifizierung, Einwilligung,
Zeitgrenzen, Duplikatsperren und Limits bleiben bestehen. Eine Produktionsfreigabe
für beliebige Empfänger ist damit nicht verbunden.

Bei Abbruch können bereits einzelne Testfunktionen aktiv sein. Derselbe geprüfte
Befehl mit derselben Adresse setzt den Teilstand fort und behält den ursprünglichen
Versandstart. Ein anderer Empfänger, uneinheitliche Startzeiten, unerwartete
Konfigurationen, weitere öffentliche Dienste oder fremde Mail-Zeitpläne stoppen
vor weiteren Änderungen. Der Prepare-Workflow mit ausgeschaltetem Versand ist
danach weiterhin nicht zum Überschreiben dieses aktivierten Standes geeignet.

Nach `TESTVERSAND AKTIV` die E-Mail-Einstellungen des vorgesehenen MovieHub-Profils
erneut speichern. Bei einer bereits über Firebase bestätigten identischen Adresse
wird keine zusätzliche Bestätigungsmail erzeugt; für den Empfangstest anschließend
eine neue passende Titelmitteilung auslösen. Andere Profiladressen bleiben im
provisorischen Betrieb ausgeschlossen. Erst Empfang, Bestätigungs-/Abmeldelink,
alle drei Meldungsphasen und Retry-Ausführung abnehmen; Issue #384 bleibt offen.

Referenzen: [Resend-Testempfänger](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain),
[Cloud Scheduler OIDC](https://docs.cloud.google.com/scheduler/docs/http-target-auth),
[Jobparameter](https://docs.cloud.google.com/sdk/gcloud/reference/scheduler/jobs/create/http).

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
