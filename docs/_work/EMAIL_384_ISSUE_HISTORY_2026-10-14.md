# #384 – Issue-Verlauf bis 14.10.2026, 19:22 Uhr

Unveränderter Snapshot des bis dahin veröffentlichten Issue-Texts. Historische
Zwischenstände sind keine aktuellen Arbeitsanweisungen. Aktuelle Übergabe:
[EMAIL_384.md](EMAIL_384.md). Das Issue bleibt für Restarbeiten offen.

---

## Umsetzungsstand 14.10.2026 – Erster Mail-Empfang bestätigt, Domain registriert

**Aktuell 19:14:** Matthias bestätigt nach neuer TV-Mitteilung den echten E-Mail-Empfang und bewertet Inhalt/Layout positiv. Damit ist der erste Versandweg praktisch bestätigt. Zweite TV-Stufe etwa fünf Minuten vor Sendebeginn (Minutenjob) noch offen; Titel/Startzeit nicht konkret genannt. Zusätzlich offen: Inklusivmail, Abmeldung, andere Profiladresse mit Bestätigungslink und abschließende Abnahme. Ereignisupdate #453 aus Main `aa599a788d27201d2894bc1bfb03177e7ce1f20b` seit 18:57 installiert, CI/Android grün. Netcup-Mail von 14:30 bestätigt Registrierung von `moviehubgermany.de` und verfügbare CCP-Einstellungen. Nächster Aufbau: Versanddomain in Resend hinzufügen, tatsächlich angezeigte DNS-Einträge bei netcup setzen und verifizieren; danach kontrollierte Absender-/Domain-Schlüsselumstellung und Freigabe weiterer Profiladressen. Bis dahin bleibt der funktionierende Testversand begrenzt. Domain-DNS/Resend und produktive Umstellung noch nicht ausgeführt.

## Fortsetzung 14.10.2026, 14:56 – Fehlender Bestätigungsempfang, erneute Anfrage prüfen

- App-Adresse entspricht der privat benannten Testadresse, Option ist eingeschaltet, Speichern wurde bestätigt. Screenshot zeigt weder `pending/sentAt` noch verifizierten oder fehlgeschlagenen Bestätigungsstatus; allein daraus lässt sich die Ursache nicht feststellen.
- Code geprüft: jeder Speichervorgang erhöht `revision`; `reconcile` kann dadurch eine neue Bestätigungsanfrage erzeugen. Obergrenze drei Anfragen je Konto und Stundenfenster. Daher einmal erneut speichern, nicht wiederholt klicken. Bereits bestätigte identische Adressen erhalten keine neue Bestätigungsmail.
- Die aktivierte Konfiguration ist nachgewiesen, der konkrete Ereignisaufruf/Verarbeitungserfolg für dieses Profil bisher nicht. Kein Resend-/Spam-/Berechtigungsfehler auf Verdacht angenommen. Bei unverändertem Status die letzten Preferences-Laufzeitlogs lesend prüfen:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="profileemailpreferences"' \
  --project=movie-hub-62459 --freshness=30m --limit=10 \
  --format='yaml(timestamp,severity,httpRequest.status,textPayload,jsonPayload.message)'
```

- Pauschalen App-Hinweis als missverständlichen Text festgehalten. Zuerst reale Verarbeitung/Fehlerursache klären. Keine zusätzliche Bereitstellung, Rechteausweitung oder Secret-Änderung in diesem Diagnoseschritt.

## Fortsetzung 14.10.2026, 14:49 – Aktive Testkonfiguration erfolgreich zurückgelesen

- Der Screenshot zeigt den erwarteten Main-Archivabruf und `--verify-active`, erfolgreiche Voraussetzungenprüfung und **TESTVERSAND GEPRÜFT**. Anschließend ausdrücklich **Nur gelesen; keine Cloud-Einstellungen geändert. Tatsächlichen E-Mail-Empfang separat prüfen.** Der frühere Scheduler-Prüfstopp ist damit erledigt.
- Bestätigt sind die vier eingeschalteten Testfunktionen mit gemeinsamer Konfiguration, Empfängerbegrenzung und Startzeit, Aufrufrechte, Secret-Metadaten, READY-Index, die per GET erreichbare öffentliche Aktionsseite und der eingeschaltete private Minutenjob. Keine erneute Bereitstellung nötig.
- Als nächsten Besitzer-Test in MovieHub: im gewünschten Profil die privat vereinbarte Resend-Kontoadresse kontrollieren, **Mitteilungen auch per E-Mail erhalten** einschalten und **E-Mail-Einstellungen speichern**. Danach App-Status sowie Posteingang und Spam prüfen; einen erhaltenen Bestätigungslink öffnen. Bereits über Firebase bestätigte identische Adressen benötigen keine zusätzliche Bestätigungsmail.
- Noch kein tatsächlicher E-Mail-Empfang gemeldet. Nach Verifizierung folgt eine neue geeignete Titelmeldung als Zustelltest; weitere Abnahmepunkte bleiben bestehen. Adresse, Fingerabdruck und Schlüssel werden nicht öffentlich dokumentiert.

## Fortsetzung 14.10.2026, 14:37 – Scheduler-Slash erkannt und ohne erneutes Deployment prüfbar

- Die lesende Besitzerabfrage bestätigt den festen Mailjob, POST, Ein-Minuten-Zeitplan, UTC, 120 Sekunden Deadline, leere JSON-Nutzlast als `e30=`, dediziertes Schedulerkonto und die unveränderte exakte OIDC-Audience. `retryCount` ist nicht ausgegeben (Standard 0), `maxRetryDuration` ist `0s`. Die Zieladresse unterscheidet sich von der Service-URI nur durch den Wurzel-Slash. Dadurch scheiterte der bisherige exakte Zeichenkettenvergleich.
- **PR #451:** https://github.com/matthias-ennen/movie-hub/pull/451. Akzeptiert nur Ursprung oder Ursprung + `/` desselben geprüften HTTPS-Cloud-Run-Dienstes; andere Hosts, Ports, Zugangsdaten, Pfade, Querys und Fragmente bleiben gesperrt. Audience weiter exakt. Kollisionserkennung für Zeitpläne berücksichtigt dieselbe eng begrenzte Gleichheit.
- Neuer Modus `--verify-active`: verlangt alle vier eingeschalteten Funktionen mit identischer vollständiger Testkonfiguration einschließlich privater Empfängerbegrenzung und ursprünglichem Start, bestehende Aufrufrechte, numerische Secret-Metadaten, READY-Index, eingeschalteten privaten Job sowie erfolgreichen zustandsfreien GET der Aktionsseite. Nur lesende Abfragen; kein Deployment, IAM-/Job-Schreiben, neuer Start oder Mailauftrag. Unvollständige Konfiguration wird nicht repariert oder als Erfolg ausgegeben.
- **Validierung:** 46 gezielte Tests; CI #1408, Run `38564781591`, mit **1.112 App-Tests / 173 Dateien**, **35 Regeltests**, **20 + 12 Python-Simulationen** erfolgreich. Android APK #1333, Run `38564781603`, ebenfalls erfolgreich. Exakter Head `8cefac4d5ea17d125044020f04522012157461b7`. Squash-Main `8c7a037bdfadef52d02deb873a392f62903fd54a`; identischer Tree `6cd9f534a52884f0434bcd3b603bb3429a137b24` remote und lokal bestätigt; Arbeitsbaum sauber.
- Folgenden auf den geprüften Main fixierten Befehl übergeben. Bei der Abfrage die bereits privat bestätigte Resend-Kontoadresse eingeben; Adresse und Fingerabdruck bleiben außerhalb des öffentlichen Issues.

```bash
(
set -e
mail_check_dir="$(mktemp -d /tmp/moviehub-email-check.XXXXXX)"
curl -fsSL \
  'https://github.com/matthias-ennen/movie-hub/archive/8c7a037bdfadef52d02deb873a392f62903fd54a.tar.gz' \
  -o "$mail_check_dir/source.tar.gz"
tar -xzf "$mail_check_dir/source.tar.gz" \
  -C "$mail_check_dir" --strip-components=1
node "$mail_check_dir/scripts/activate-profile-email-test.mjs" --verify-active
)
```

- Erwartet **TESTVERSAND GEPRÜFT**. Anschließend im gewünschten Profil die richtige Testadresse und eingeschaltete Option kontrollieren, **E-Mail-Einstellungen speichern**, Postfach/Spam und App-Status prüfen. Falls die Adresse bereits über Firebase bestätigt ist, wird keine zusätzliche Bestätigungsmail erzeugt; danach folgt eine neue geeignete Titelmeldung als Zustelltest.
- Der Screenshot zeigt Job-Aktivität, aber keinen E-Mail-Empfang. Vollständige korrigierte Cloud-Abschlussprüfung, tatsächliche Zustellung und Geräteabnahme bleiben noch offen. Historischer Prüfauftrag unten ist mit dieser Rückmeldung beantwortet.

## Fortsetzung 14.10.2026, 14:26 – Aktivierung erreicht Minutenjob, Rückleseprüfung bricht ab

- Originalbild im Chat lesbar; die Fehlermeldung zum lokalen Anhangpfad verhindert die Auswertung nicht. Keine erneute Bildbeschaffung erforderlich.
- Sichtbare Reihenfolge: Voraussetzungen geprüft → Action bereitgestellt → öffentliche Seite bestätigt → Retry, Preferences und Notification bereitgestellt → Scheduler-Prüfung meldet Abweichung. Im Skript folgt auf jedes Deployment die Funktions- und Zugriffsprüfung, bevor der nächste Schritt beginnt. Daher ist ein vollständig ausgeschalteter Versand nicht mehr der bestätigte Stand.
- Die Meldung entsteht in `checkRetryJob` im eigenen Aktivierungshelfer; sie benennt aktuell nur die Gesamtprüfung. Sie beweist weder ein Resend-Problem noch ein fehlgeschlagenes Funktionsdeployment. Ein Mailjob wird gelesen, aber mindestens eine erwartete Eigenschaft stimmt nicht exakt überein. Ob dies eine relevante Konfigurationsabweichung oder eine unterschiedliche API-Darstellung ist, lässt sich ohne reale Metadaten noch nicht entscheiden.
- Lokaler Quelltext und vorhandene Tests geprüft. Die Tests verwenden synthetische Jobdaten und belegen nicht die konkrete Cloud-Rückgabe. Daher noch keine Änderung an Validator, Job oder Berechtigungen auf Verdacht.
- Für die nächste Diagnose ausschließlich die zwei folgenden lesenden Besitzer-Abfragen übergeben. Sie liefern Retry-Ziel-URI, Zeitplan, Authentifizierungskonfiguration, Nutzlastdarstellung und letzten Aufrufstatus; keine Secret-Werte oder Resend-Schlüssel.

```bash
gcloud functions describe profileEmailRetry \
  --gen2 --project=movie-hub-62459 --region=europe-west3 \
  --format='yaml(serviceConfig.uri)'

gcloud scheduler jobs describe movie-hub-email-retry-1min \
  --project=movie-hub-62459 --location=europe-west3 \
  --format='yaml(name,state,schedule,timeZone,attemptDeadline,retryConfig,httpTarget.uri,httpTarget.httpMethod,httpTarget.oidcToken,httpTarget.body,status,lastAttemptTime)'
```

- Nach Rückmeldung exakte Ursache festhalten und nötige Korrektur gezielt testen. Startzeit und Empfängerbegrenzung beibehalten, keinen zweiten Mailjob erzeugen und vorhandene TV-Jobs unverändert lassen. Erfolgreiche Zustellung und Abnahme bleiben offen.

## Fortsetzung 14.10.2026, 14:07 – Testaktivierung implementiert und auf Main übernommen

- **PR #450:** https://github.com/matthias-ennen/movie-hub/pull/450. Exakt geprüfter Head `dd8968523ad3f13a4587f8ee81fe70512e7de001`; CI #1406 (Run `38560747304`) und Android APK #1331 (Run `38560747417`) erfolgreich. CI: **1.106 App-Tests / 173 Dateien**, **35 Firestore-/Regeltests**, **20 Cloud-Setup- und 12 Index-Simulationen**. Lokal 40 gezielte Aktivierungs-, Transport- und Deploymenttests erfolgreich.
- Squash-Main `12c50457e7f1421b85099ee2b9b4f62f637cf2e1`; über GitHub und lokalen Fetch bestätigt: identischer getesteter Tree `da89a641a5e5dba504321f4cdb6f8da82e618e1b`, Arbeitsbaum sauber.
- Der Transport begrenzt den provisorischen Absender auf den normalisierten Fingerabdruck genau der eingegebenen Kontoadresse und bleibt ohne gültige Begrenzung gesperrt. Ausgeschlossene Adressen erzeugen keine neuen Verifikations-/Versandaufträge; bereits vorhandene ausgeschlossene Aufträge werden ohne Transportaufruf beendet und bereinigt.
- Der neue Besitzer-Helfer prüft vor Änderungen die vier Funktionen, Dienstkonten, Aufrufrechte, Secret-Metadaten, READY-Index und Zeitplanbestand. Er übernimmt die bestehenden numerischen Secret-Versionen, setzt die tatsächliche Aktions-URL und einen festen Startzeitpunkt und stellt alle vier Funktionen aus dem geprüften isolierten Mailpaket bereit. Frühere Meldungen werden nicht nachträglich versendet.
- Öffentlich wird ausschließlich die Bestätigungs-/Abmeldeseite. Ein anonymer GET muss ihren exakten Inhalt bestätigen; bei kurz verzögerten Aufrufrechten erfolgen begrenzte GET-Wiederholungen. Ereignis- und Retry-Funktionen bleiben privat. Der Minutenjob `movie-hub-email-retry-1min` nutzt POST und das dedizierte Scheduler-Dienstkonto mit exakter OIDC-Audience; vorhandene TV-Jobs bleiben erhalten.
- Erneute Ausführung führt denselben Testempfänger und Startzeitpunkt fort. Ein Abbruch kann bereits aktivierte Teilfunktionen hinterlassen; kein pauschaler Rückschluss auf ausgeschalteten Versand. Ein passender vorhandener Minutenjob wird wiederverwendet, ein abweichender nicht überschrieben.
- **Jetzt an Matthias übergeben:** folgenden auf Main fixierten Befehl in Cloud Shell ausführen und bei der Abfrage die privat bestätigte Resend-Kontoadresse eingeben. Kein neuer API-Schlüssel erforderlich.

```bash
(
set -e
mail_setup_dir="$(mktemp -d /tmp/moviehub-email-test.XXXXXX)"
curl -fsSL \
  'https://github.com/matthias-ennen/movie-hub/archive/12c50457e7f1421b85099ee2b9b4f62f637cf2e1.tar.gz' \
  -o "$mail_setup_dir/source.tar.gz"
tar -xzf "$mail_setup_dir/source.tar.gz" \
  -C "$mail_setup_dir" --strip-components=1
node "$mail_setup_dir/scripts/activate-profile-email-test.mjs" --apply
)
```

- Erwarteter Abschluss: **TESTVERSAND AKTIV: auf die eingegebene Resend-Kontoadresse begrenzt. Minutenjob eingerichtet.** Erst nach dieser Rückmeldung die Profileinstellungen erneut speichern und den echten Empfang prüfen. Entspricht die Adresse bereits der verifizierten Firebase-Kontoadresse, entsteht absichtlich keine zusätzliche Bestätigungsmail; dann ist eine neue passende Titelmeldung für den Zustellungstest erforderlich.
- Der Helfer verifiziert die Zeitplankonfiguration, nicht den tatsächlichen Scheduler-Aufruf oder E-Mail-Empfang. Diese Cloud-Ausführung und die Abnahme stehen noch aus. Issue bleibt offen. Die vorherige Empfängerfrage im historischen Abschnitt ist durch die private Rückmeldung erledigt.

## Fortsetzung 14.10.2026, 13:44 – Retry-Index READY, Wechsel zur Testaktivierung

- Screenshot `1000062552.jpg` (13:43 Uhr) zeigt den auf Main `4da834e` fixierten Helfer: **3 vorhandene Indexdefinitionen geprüft**, Mail-Index ergänzt, Status bis READY abgefragt, abschließend **INDEX BEREIT**. Der vorherige Index-Einrichtungsschritt ist damit erledigt; keine weitere Wiederholung erforderlich.
- Auf Matthias’ Frage „Warum bleibt der Versand noch aus?“ wurde der tatsächlich aktive Prepare-Stand und die Serverkonfiguration geprüft: `MOVIE_HUB_EMAIL_ENABLED=false`, noch leere Aktions-URL und Startzeit. Nur den Schalter umzulegen genügt nicht: `createEmailService` benötigt die gültige Aktions-URL, und der Transport benötigt zusätzlich eine gültige Startzeit. Der bisherige Prepare-Workflow kann absichtlich keinen Versand einschalten oder Zeitplan erzeugen.
- Die erste Zustellung ist jetzt das nächste Ziel. Dafür die vorhandene Bestätigungs-/Abmeldeseite erreichbar machen, die tatsächliche URL und einen festen Versandstart konfigurieren, den privaten OIDC-Retry-Minutenjob ergänzen und den provisorischen Test auf die ausdrücklich benannte Resend-Kontoadresse begrenzen. Vorhandene Meldungen vor Versandstart dürfen nicht nachträglich versendet werden.
- **Noch erforderliche Information:** die tatsächlich mit dem Resend-Konto verbundene E-Mail-Adresse. Google-/GitHub-Adressen sind kein Nachweis und werden nicht dafür angenommen. Die Adresse wird nicht ins öffentliche Repository oder Issue geschrieben; kein API-Schlüssel wird erneut angefordert.
- Resend bestätigt aktuell: `onboarding@resend.dev` kann für den Test nur an die mit dem Resend-Konto verbundene Adresse zustellen; für andere echte Empfänger ist eine verifizierte eigene Domain erforderlich. [Offizielle Resend-Dokumentation](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain). Auf netcup muss für den ersten Kontoadressen-Test nicht gewartet werden.
- Keine Codeänderung oder Aktivierung in diesem Diagnose-/Rückmeldeschritt. Main bleibt `4da834e69f568cefe3340667c465abe251a57fd7`. Issue bleibt bis zum tatsächlichen Empfang und zur Abnahme offen.

## Fortsetzung 14.10.2026 – Aufrufrechte bestätigt, gezielter Mailindex vorbereitet

- Screenshot `1000062551.jpg`, aufgenommen **13:23 Uhr**, zeigt für `profileemailpreferences`, `profileemailnotification` und `profileemailretry` jeweils **GEPRUEFT** nach erfolgreicher IAM-Änderung und gesonderter Rückleseprüfung. Damit sind die zwei Event-Aufrufrechte für `movie-hub-email-events` und das Retry-Aufrufrecht für `movie-hub-email-scheduler` bestätigt; keine öffentliche Bindung in diesen Richtlinien. Der vorherige Besitzer-Aufrufrechte-Schritt ist erledigt.
- [PR #449](https://github.com/matthias-ennen/movie-hub/pull/449) ergänzt einen standardmäßig nur lesenden Python-Helfer für genau `emailDeliveries.queueAt`, **COLLECTION_GROUP ASCENDING**. Er prüft das feste Projekt/Frankfurt-Datenbank/Feldziel, übernimmt die vorhandenen expliziten oder geerbten Feldindexdefinitionen und ergänzt den einen Index mit `updateMask=indexConfig`. Keine anderen Felder, TTL-, Benutzer-, Secret-, IAM-, Function- oder Scheduler-Änderungen; kein Versand.
- Vor dem einzelnen Patch erkennt eine erneute Leseprüfung zwischenzeitliche Feldänderungen. Die API bietet keine ETag-Vorbedingung; keine parallele Indexbearbeitung dieses Felds während des Schritts. Geerbte Definitionen werden als explizite Feldkonfiguration übernommen. Unbekannte Optionen oder Reparaturzustände stoppen vor Änderung. Ein bereits laufender Aufbau wird nur weiter geprüft; Erfolg erst bei **READY** und bestätigten vorhandenen Definitionen.
- Geprüfter PR-Head **`aefec8a2efd730963e203ffe83c1e514f7a85c68`**; CI **#1403** [38556943437](https://github.com/matthias-ennen/movie-hub/actions/runs/38556943437) und Android **#1328** [38556943377](https://github.com/matthias-ennen/movie-hub/actions/runs/38556943377) erfolgreich. **1.095 Anwendungstests / 172 Dateien**, **33 Regeltests**, **20 vorhandene Cloud-Simulationen + 12 Index-Prüfungen**, Browser-/Build-/Dependency-Gates erfolgreich.
- Main **`4da834e69f568cefe3340667c465abe251a57fd7`** und geprüfter Head haben den identischen Quellbaum **`0b1731fb035b45a23c68f4880b47c4ba973c0a99`**. Lokaler Checkout auf Main abgeglichen. Die tatsächliche Index-Einrichtung erfolgt erst durch den folgenden Besitzerbefehl und ist noch nicht abgenommen.
- Nach `INDEX BEREIT`: privaten OIDC-Retry-Minutenjob und kontrollierte Aktivierung vorbereiten, tatsächliche Resend-Kontoadresse als Testempfänger feststellen. Issue #384 bleibt bis zur Zustellungs-/Geräteabnahme offen.

**Historischer Index-Schritt – mit Screenshot um 13:43 Uhr als READY bestätigt:**

```bash
curl -fsSL \
  'https://raw.githubusercontent.com/matthias-ennen/movie-hub/4da834e69f568cefe3340667c465abe251a57fd7/scripts/setup-profile-email-index.py' \
  -o /tmp/moviehub-email-index-4da834e.py && \
python3 /tmp/moviehub-email-index-4da834e.py --apply
```

Der Helfer wartet bis zu fünf Minuten. `INDEX NOCH IM AUFBAU` bedeutet weiter ausstehend; dann denselben Befehl später erneut ausführen. Bei Fehlern Ausgabe zurückmelden; keine Rechte automatisch ausweiten. Ein `INDEX BEREIT` bestätigt nur den Index, nicht den Mailversand.

## Fortsetzung 14.10.2026, 13:20 – alle vier Mailfunktionen erfolgreich bereitgestellt

- Matthias bestätigt den neuen manuellen Start mit „Erledigt“. [Prepare-Lauf #2, 38554131325](https://github.com/matthias-ennen/movie-hub/actions/runs/38554131325), Job `115818934907`, auf Main **`e3447d28b74eae724d9941466f12b19322dc31d0`**, Quellbaum `44be3cc3534fb1321b447599e51816de73a82246`: **success**, Start **13:05:28**, Ende **13:11:27** (Europe/Berlin).
- Log um **13:11:21**: `MAIL FUNCTIONS PREPARED: four private functions verified; sending remains disabled. No scheduler or index created.` Sowohl die Eventarc-Service-Agent-Validierung als auch Updates bestehender privater HTTP-Dienste liefen in diesem neuen Versuch erfolgreich durch.
- Das tatsächlich ausgeführte Skript prüft für jede Funktion ACTIVE/Gen2, festen Einstieg/Build-/Laufzeitidentität, Frankfurt, alle ausgeschalteten Env-Werte, numerisch fixierte Secret-Referenzen, Ressourcenlimits, gesamten Traffic auf der geprüften Revision, genaue Cloud-Run-Zielnamen sowie private IAM/aktiven Invoker-Check. Beide Ereignisfunktionen haben die vorgesehenen engen Firestore-Pfade und das dedizierte Ereigniskonto.
- **Nächster Besitzerschritt, noch nicht ausgeführt/bestätigt:** Event-Konto `movie-hub-email-events` erhält `roles/run.invoker` nur auf `profileemailpreferences` und `profileemailnotification`; Scheduler-Konto `movie-hub-email-scheduler` nur auf `profileemailretry`. Die drei Cloud-Run-Namen sind durch den erfolgreichen Deploy-Rücklesetest bestätigt. Das ist die vorgesehene dienstbezogene Aufrufberechtigung; keine Projektrolle, kein öffentlicher Zugang und keine zusätzliche GitHub-Berechtigung.
- Der folgende Block ergänzt die Bindungen additiv, stoppt bei Fehlern und liest jede Richtlinie unabhängig zurück. Erfolgszeilen erscheinen nur, wenn die vorgesehene unbedingte Bindung vorhanden ist und keine öffentliche Bindung vorliegt. Shell-Syntax lokal geprüft. Ausführung erfolgt durch Matthias, weil `run.services.setIamPolicy` für GitHub nachweislich fehlt.
- Referenzen: [Google Eventarc: dienstbezogene Aufrufrechte](https://docs.cloud.google.com/eventarc/docs/roles-permissions), [gcloud add-iam-policy-binding](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/add-iam-policy-binding).
- Nach Rückmeldung: gezielten Queue-Index, privaten Retry-Minutenjob und kontrollierten Testversand vorbereiten; Resend-Kontoadresse als Testempfänger noch feststellen. Keine vorhandenen TV-Dienste ändern. Issue bleibt bis echter Zustellung und Geräteabnahme offen.

**Historischer Aufrufrechte-Schritt – mit Screenshot um 13:23 Uhr erledigt:**

```bash
(
set -euo pipefail
for mail_service in profileemailpreferences profileemailnotification profileemailretry; do
  mail_account=movie-hub-email-events
  if [ "$mail_service" = profileemailretry ]; then
    mail_account=movie-hub-email-scheduler
  fi
  mail_member="serviceAccount:${mail_account}@movie-hub-62459.iam.gserviceaccount.com"

  gcloud run services add-iam-policy-binding "$mail_service" \
    --project=movie-hub-62459 --region=europe-west3 \
    --member="$mail_member" --role=roles/run.invoker \
    --condition=None --quiet --format=none

  gcloud run services get-iam-policy "$mail_service" \
    --project=movie-hub-62459 --region=europe-west3 --format=json |
    python3 -c 'import json,sys
b=json.load(sys.stdin).get("bindings", [])
assert any(x.get("role")=="roles/run.invoker" and sys.argv[1] in x.get("members", []) and not x.get("condition") for x in b), "Aufrufrecht fehlt"
assert not any(m in ("allUsers", "allAuthenticatedUsers") for x in b for m in x.get("members", [])), "Unerwarteter oeffentlicher Zugriff"
print("GEPRUEFT:", sys.argv[2])' "$mail_member" "$mail_service"
done
)
```

## Fortsetzung 14.10.2026 – Audit ausgewertet, wiederholbare private Bereitstellung korrigiert

- Matthias’ Screenshot (12:51 Uhr) erledigt die unten dokumentierte Audit-Abfrage: `cloudfunctions.functions.create` war **granted=true**; Status 9 meldete **Permission denied while using the Eventarc Service Agent** beim Trigger für `profileEmailPreferences`. Die zugehörige Google-Service-Agent-Rolle war bereits lesend bestätigt. Das passt zu Googles Hinweis auf verzögerte Rechteübernahme und rechtfertigte einen erneuten Versuch; ob die ursprüngliche Eventarc-Validierung inzwischen durchläuft, ist noch nicht bewiesen.
- Prepare-Lauf [38549712845, Versuch 2](https://github.com/matthias-ennen/movie-hub/actions/runs/38549712845/attempts/2), Job `115814013102`, blieb am alten Commit `93d9cf7`. Das Update von `profileEmailAction` selbst war erfolgreich, anschließend scheiterte der durch wiederholtes `--no-allow-unauthenticated` ausgelöste Zugriff an **`run.services.setIamPolicy`**. Die Ereignisfunktionen wurden in diesem Versuch noch nicht erreicht.
- [PR #448](https://github.com/matthias-ennen/movie-hub/pull/448) prüft weiterhin alle vorhandenen Dienste vor dem ersten Deploy auf private Zugriffe. Bei Updates bereits geprüfter Dienste werden beide Unauthenticated-Access-Flags weggelassen; neue HTTP-Dienste erhalten weiterhin explizit die private Einstellung. Die Prüfung nach jedem Deploy bleibt bestehen. Keine zusätzlichen IAM-Rechte. Eine feste, datensparsame Eventarc-Diagnose ergänzt die Fehlermeldung.
- Regression: Wiederaufnahme mit beiden vorhandenen privaten HTTP-Diensten und absichtlich verweigerten IAM-Updates funktioniert; private Zugriffe werden vor und nach dem Deploy geprüft. **13 gezielte Tests**, Syntax und Diff-Prüfung erfolgreich. Vollständige CI: **1.095 Anwendungstests / 172 Dateien, 33 Regeltests, 20 Cloud-Simulationen**, Browser-/Build-/Dependency-Gates erfolgreich.
- Geprüfter Head **`3399a3e79fbeb8309d23e5d94066451943b09e42`**; CI **#1401** [38553260409](https://github.com/matthias-ennen/movie-hub/actions/runs/38553260409) und Android **#1326** [38553260411](https://github.com/matthias-ennen/movie-hub/actions/runs/38553260411) erfolgreich. Übernommen auf Main **`e3447d28b74eae724d9941466f12b19322dc31d0`**, identischer geprüfter Quellbaum **`44be3cc3534fb1321b447599e51816de73a82246`**.
- Rein lesender Preflight [38551889069, Versuch 2](https://github.com/matthias-ennen/movie-hub/actions/runs/38551889069/attempts/2), Diagnosejob `115816220437`: beide HTTP-Funktionen **ACTIVE**, Versandflag **false**; Ereignisfunktionen fehlen. Operations-Abfrage erfolgreich und nicht gekürzt, einschließlich erfolgreichem Action-Update um **10:53:29 UTC**. Gesamt-Preflight weiterhin **23/31 ready**. Keine Scheduler-/Index-Erstellung, keine Mail versandt.
- **Nächster Schritt durch Matthias:** [Prepare-Workflow öffnen](https://github.com/matthias-ennen/movie-hub/actions/workflows/profile-email-prepare.yml), **Run workflow → main → Run workflow**. Ein neuer Lauf ist erforderlich, damit PR #448 verwendet wird; das erneute Starten des alten Jobs bleibt am alten Quellstand. Die GitHub-Verbindung kann vorhandene Läufe wiederholen, bietet aber keinen Erststart per Workflow-Dispatch.
- Danach alle vier Funktionen prüfen; Aufrufrechte, Mail-Index, Retry-Zeitplan und tatsächliche Zustellung/Abnahme bleiben offen. Issue #384 bleibt bis zur tatsächlichen Zustellungs- und Geräteabnahme offen.

## Fortsetzung 14.10.2026, 12:48 – Diagnose eingegrenzt, Audit-Lesen durch Besitzer erforderlich

- [PR #447](https://github.com/matthias-ennen/movie-hub/pull/447) nach grünen Gates übernommen: Head `cf795440d4fdb20e1ba8f347a36e7310bfc0b4c5`, Main **`08b6e557009a3178f2a90c4c9fabcff48986cae5`**, identischer Quellbaum `39493bafd846c26592e94fdd6920b1ffcae08ead`. CI **#1399** [38551539301](https://github.com/matthias-ennen/movie-hub/actions/runs/38551539301) und Android **#1324** [38551539329](https://github.com/matthias-ennen/movie-hub/actions/runs/38551539329) erfolgreich.
- Preflight **#6** [38551889069](https://github.com/matthias-ennen/movie-hub/actions/runs/38551889069), Diagnosejob `115811561339`: korrigierte Operations-Abfrage **read, truncated=false**. Nur die abgeschlossenen HTTP-Bereitstellungen `profileEmailAction` (12:28:11) und `profileEmailRetry` (12:29:10), jeweils ohne Fehlercode, sind vorhanden. Kein fehlgeschlagener Event-Function-Vorgang zurückgegeben; der Create-Request wurde offenbar zuvor abgewiesen. Das ist eine Eingrenzung, noch kein Nachweis einer bestimmten fehlenden Berechtigung.
- Unverändert: HTTP-Functions `ACTIVE` und Versandflag `false`; Event-Functions fehlen. Event-Receiver und Eventarc-Service-Agent haben ihre zugehörigen geprüften Projektrollen. Audit-Lesen über GitHub scheitert an Berechtigung; keine zusätzliche Rolle vergeben.
- Gesamt-Preflight bleibt wegen offener/unlesbarer Voraussetzungen rot. Die Diagnose selbst ist erfolgreich ausgeführt. Index, Aufrufrechte, Retry-Zeitplan und Versandabnahme bleiben offen.

**Historischer Schritt – mit Screenshot vom 14.10.2026, 12:51 Uhr erledigt (nur lesen):**

```bash
gcloud logging read \
'timestamp>="2026-10-14T10:27:00Z" AND timestamp<="2026-10-14T10:31:00Z" AND (protoPayload.serviceName="cloudfunctions.googleapis.com" OR protoPayload.serviceName="eventarc.googleapis.com") AND protoPayload.status.code>0' \
--project=movie-hub-62459 --limit=5 \
--format='yaml(timestamp,protoPayload.status,protoPayload.authorizationInfo)'
```

Die feste UTC-Zeitspanne entspricht 12:27–12:31 Uhr deutscher Zeit und umfasst nur den ersten Mail-Versuch. Höchstens fünf fehlgeschlagene Cloud-Functions-/Eventarc-Logeinträge, nur Status und Berechtigungsmetadaten. Keine Secret-Abfrage, keine Benutzer-Dokumente und keine Cloud-Änderung. Ausgabe/Screenshot zurückmelden; danach die konkrete Ursache gezielt beheben. Kein unmotivierter erneuter Deploy.

## Fortsetzung 14.10.2026, 12:28–12:43 – erster Deploy teilweise erfolgreich, Diagnose läuft

- Matthias bestätigte den Start mit „Läuft“. Manueller Prepare-Lauf **#1**, [38549712845](https://github.com/matthias-ennen/movie-hub/actions/runs/38549712845), auf Main `93d9cf7`: Quellpaket und Google-Anmeldung erfolgreich.
- `profileEmailAction` wurde um 12:29, `profileEmailRetry` um 12:29:52 vollständig als privater, ausgeschalteter Dienst geprüft. Der nächste Deploy `profileEmailPreferences` scheiterte um **12:30:16** mit `permission-or-authentication`. `profileEmailNotification` wurde nicht begonnen. Kein automatischer Wiederholungsversuch und keine Rechteausweitung.
- [PR #446](https://github.com/matthias-ennen/movie-hub/pull/446) ergänzt rein lesende, begrenzte Diagnose von Function-Zuständen, ausgewählten Dienstkonto-Rollen, abgewiesenen Infrastruktur-Auditrequests und Cloud-Functions-Vorgängen. Nur erkannte Kennungen/Kategorien erscheinen; keine rohen Providerantworten, Nutzdaten oder Tokens.
- Geprüfter PR-Head `9696c4b64b165b6a65f1d8b032902b32d64003b5`; Main **`accfbdf04e8d78c05753dc462ae7eefa7f5ee795`**; Quellbaum identisch `41f97dadf0f342b94070b7ac5b645e65904a9fef`. CI **#1397** [38550900860](https://github.com/matthias-ennen/movie-hub/actions/runs/38550900860) und Android **#1322** [38550900854](https://github.com/matthias-ennen/movie-hub/actions/runs/38550900854) erfolgreich. 1.095 Anwendungstests, 33 Regeltests, 20 Cloud-Simulationen, Browser-/Dependency-Prüfung erfolgreich.
- Preflight **#5** [38551260494](https://github.com/matthias-ennen/movie-hub/actions/runs/38551260494): Diagnose ausgeführt; Gesamtstatus wegen offener Voraussetzungen weiterhin fehlgeschlagen, **23/31 ready**. Die beiden HTTP-Functions sind `ACTIVE` und `MOVIE_HUB_EMAIL_ENABLED=false`; die beiden Event-Functions fehlen. `movie-hub-email-events` hat `roles/eventarc.eventReceiver`; der Google-Eventarc-Agent hat `roles/eventarc.serviceAgent`. Der Deployer hat unter den geprüften Rollen `roles/cloudfunctions.developer`.
- GitHub kann die gezielten Audit-Logs nicht lesen. Der Operations-Endpunkt antwortete mit HTTP 400 auf die verschachtelte Teilprojektion. [PR #447](https://github.com/matthias-ennen/movie-hub/pull/447) korrigiert die Abfrage auf den stabilen Metadaten-Umschlag; lokale Diagnoseprüfungen erfolgreich, GitHub-Gates laufen. Keine Leserechte nur für die Diagnose erweitert.
- Nach Merge wird der bestehende lesende Preflight automatisch erneut ausgewertet. Erst aus dem konkreten Fehler folgt eine begründete Wiederholung oder begrenzte Rechteergänzung. #384 bleibt offen.

## Fortsetzung nach Screenshot 12:00 – Buildrechte bestätigt, private Mail-Bereitstellung vorbereitet

Matthias' Cloud-Shell-Lauf auf dem gepinnten Stand `f08576c` meldet: **BUILDRECHTE ERFOLGREICH: Zwei Quell-Buckets und eine Docker-Registry rückgeprüft.** Damit ist der unten dokumentierte Buildrechte-Schritt abgeschlossen. Kein neuer Speicher, kein Function-/Index-Deploy, kein Zeitplan und kein Mailversand durch diesen Lauf.

- [PR #445](https://github.com/matthias-ennen/movie-hub/pull/445) ist übernommen. Geprüfter PR-Head: `264b2f8aeca26c6d37a688e2d45aad0ad821708e`; Main nach Squash: **`93d9cf7d6feb541dd6c3b03308cd6df17598fc51`**; identischer Quellbaum `30241a50bf47a0bb8282277b7d86705f3df01420`.
- PR-CI **#1394**, [38548670180](https://github.com/matthias-ennen/movie-hub/actions/runs/38548670180): erfolgreich mit 1.090 Anwendungstests, 33 Regeltests, 20 Cloud-Simulationstests, Browserprüfung, Build, Workflow-YAML und produktiver Dependency-Prüfung. Android **#1319**, [38548670202](https://github.com/matthias-ennen/movie-hub/actions/runs/38548670202): erfolgreich.
- Neuer ausschließlich manueller Main-Workflow `.github/workflows/profile-email-prepare.yml`: genau `profileEmailAction`, `profileEmailRetry`, `profileEmailPreferences` und `profileEmailNotification` in Frankfurt mit den festen separaten Build-/Laufzeit-/Eventkonten, numerisch gepinnten Secret-Referenzen, begrenzten Ressourcen und `MOVIE_HUB_EMAIL_ENABLED=false`. Keine Secret-Inhalte werden abgefragt.
- Alle vorhandenen Ziel-Functions werden vor der ersten Änderung geprüft. Aktivierte/fremde Konfiguration, vorhandener Mail-Zeitplan, unlesbare Ressourcen, öffentlicher Dienstzugang oder abweichende Event-Pfade führen zum Abbruch. Nach jedem Deploy werden Konfiguration, Identitäten, Grenzen, private Dienstrechte und vollständiger Verkehr auf der geprüften neuesten Version zurückgelesen. Ein sicher ausgeschalteter Teilerfolg bleibt bestehen und kann erneut geprüft werden.
- Retry ist ein privater POST-HTTP-Endpunkt; kein impliziter Firebase-Scheduler. Auch die Token-Aktionsseite ist in dieser Vorbereitungsphase privat. Keine IAM-Zuweisungen, kein Index und kein Zeitplan im neuen Workflow. Bestehender TV-Betrieb bleibt unverändert.
- Anleitung: [docs/EMAIL_DEPLOYMENT.md](https://github.com/matthias-ennen/movie-hub/blob/main/docs/EMAIL_DEPLOYMENT.md). Die Bereitstellung ist vorbereitet, **noch nicht ausgeführt**.

**Historischer Startschritt – am 14.10.2026 um 12:27 ausgeführt:** [Profile email server prepare (sending disabled)](https://github.com/matthias-ennen/movie-hub/actions/workflows/profile-email-prepare.yml) öffnen → **Run workflow** → Branch **main** → **Run workflow**. Der erste Start erfolgt durch Matthias, da die vorhandene GitHub-Verbindung Lesen und Wiederholen, aber keinen erstmaligen Workflow-Dispatch unterstützt. Danach Lauf und Rückprüfung unabhängig auswerten.

Nach erfolgreicher Bereitstellung folgen gezielte Dienst-Aufrufrechte, der Retry-Index, genau ein OIDC-Zeitplan und anschließend ein kontrollierter Test mit der noch festzustellenden Resend-Kontoadresse. Domainfreischaltung ist für diese Vorbereitung nicht erforderlich. #384 bleibt bis tatsächlichem E-Mail-Empfang und Geräteabnahme offen.

## Fortsetzung nach Screenshot 11:52 – tatsächlicher Speichername geklärt

Matthias' Cloud-Shell-Liste zeigt vorhandene Quell- und Upload-Buckets in `EUROPE-WEST3`. Die Upload-Buckets in west1 und west3 enthalten einen **Punkt zwischen Projektnummer und Region**. Damit ist der vorherige `missing`-Befund erklärt: geprüft wurde ein anderer Name mit Bindestrich. Der tatsächliche west3-Upload-Bucket ist:

`gcf-v2-uploads-612913221205.europe-west3.cloudfunctions.appspot.com`

- [PR #444](https://github.com/matthias-ennen/movie-hub/pull/444) korrigiert Setup/Preflight und die Anleitung. Die Cloud-Test-Fixture enthält jetzt die vom Besitzer beobachteten Namen unabhängig von den Setup-Konstanten.
- Geprüfter PR-Head: `f6229befc26a7d15a097d39dcc9d786e63d77c94`; Main nach Squash: **`f08576c499ac8b040d91cfc27441e2ae77f3aa9e`**; Quellbaum `c734caa69f53be58f868aeca5b1be619ff0552f6`.
- Lokal 20 Cloud-Simulationstests und vier Preflight-Regressionstests bestanden. PR-CI **#1390**, [38545843978](https://github.com/matthias-ennen/movie-hub/actions/runs/38545843978), und Android **#1315**, [38545843967](https://github.com/matthias-ennen/movie-hub/actions/runs/38545843967), beide erfolgreich.
- Die fehlenden GitHub-Leserechte für Speicher-/Registry-IAM sind ein separater Punkt. Keine neuen GitHub-Projektrechte vergeben. Der Besitzerlauf prüft Projekt, Region und alle drei Policies vor dem ersten Schreiben und liest jede Bindung zurück.
- Bereits zuvor auf Main `ef1f220`: CI [38544955973](https://github.com/matthias-ennen/movie-hub/actions/runs/38544955973), Android [38544955953](https://github.com/matthias-ennen/movie-hub/actions/runs/38544955953) und Hosting/Regeln [38544956005](https://github.com/matthias-ennen/movie-hub/actions/runs/38544956005) erfolgreich; der Preflight blieb wie dokumentiert wegen offener Infrastruktur rot.

**Historischer Cloud-Shell-Schritt – durch Screenshot 12:00 als erfolgreich bestätigt** (nicht erneut erforderlich):

```bash
curl -fsSL \
'https://raw.githubusercontent.com/matthias-ennen/movie-hub/f08576c499ac8b040d91cfc27441e2ae77f3aa9e/scripts/setup-profile-email-cloud.py' \
-o /tmp/moviehub-email-build-f08576c.py &&
python3 /tmp/moviehub-email-build-f08576c.py --build-access --apply
```

Umfang unverändert: `movie-hub-email-build` erhält direkt an den beiden festen Frankfurt-Buckets `roles/storage.objectViewer` und direkt an der vorhandenen Frankfurt-Docker-Registry `roles/artifactregistry.writer`. Keine neue Speicherressource, keine Secret-Inhalte, kein Function-/Index-Deploy, kein Zeitplan und kein Mailversand. Ausführung um 12:00 erfolgreich bestätigt. Gemeldete Erfolgszeile: **BUILDRECHTE ERFOLGREICH: Zwei Quell-Buckets und eine Docker-Registry rückgeprüft.** #384 bleibt offen.


## Fortsetzung 14.10.2026 – Grundlage bestätigt, Speicherbestand vor Rechtevergabe klären

- Screenshot 11:34: `setup-profile-email-cloud.py` meldet erfolgreiche Rückprüfung der Konten, Rollen und Secret-Metadaten; Versand aus.
- Der anschließende Preflight-Versuch auf dem alten Stand scheiterte an `TypeError: Cannot read properties of null (reading 'disabled')` (Lauf [38540128127](https://github.com/matthias-ennen/movie-hub/actions/runs/38540128127), Job `115783465533`). Eine Projektion nur des optionalen Statusfelds ist für aktive Konten ungeeignet.
- [PR #443](https://github.com/matthias-ennen/movie-hub/pull/443) nach grünen Gates übernommen: Main **`ef1f220ee62efa8878ec634fa0524c769466f7ab`**, identischer geprüfter Quellbaum `2c04d2938279e291f1ae3c8ff6f4662a55f9312f`. Preflight prüft nun zusätzlich die exakte Kontoidentität und verliert bei leeren/fehlerhaften Metadaten nicht den restlichen Bericht.
- PR-CI **#1388**, [38544645304](https://github.com/matthias-ennen/movie-hub/actions/runs/38544645304): erfolgreich; 1.077 Anwendungstests, 33 Regel-/Emulatortests, 20 Cloud-Simulationstests, Browserprüfung, Build und produktive Dependency-Prüfung erfolgreich. Android **#1313**, [38544645456](https://github.com/matthias-ennen/movie-hub/actions/runs/38544645456): erfolgreich.
- Korrigierter unabhängiger Preflight **#3**, [38544956025](https://github.com/matthias-ennen/movie-hub/actions/runs/38544956025), Job `115788605979`: vollständiger Bericht ohne Skriptabbruch, **21/31 Einzelprüfungen ready**. Gesamtstatus bewusst weiterhin fehlgeschlagen wegen nachstehender offener Voraussetzungen.

| Prüfung | Tatsächlicher Befund |
| --- | --- |
| 10 APIs, native Frankfurt-Datenbank, Billing | ready |
| Beide Secret-Versionen, vier Mailkonten, exakte Laufzeitrolle/Zuweisung | ready |
| Frankfurt-Docker-Registry `gcf-artifacts` | ready |
| `gcf-v2-sources-612913221205-europe-west3` und dessen IAM | Für GitHub nicht lesbar (Berechtigung); kein Beleg für Abwesenheit |
| `gcf-v2-uploads-612913221205-europe-west3.cloudfunctions.appspot.com` und IAM | missing |
| Builder-IAM auf Docker-Registry | Für GitHub nicht lesbar (Berechtigung) |
| Collection-Group-Index `emailDeliveries.queueAt` | needs-setup |
| Vier Mail-Functions | missing |

**Historischer Zwischenstand vor dem Screenshot 11:52 (durch die Fortsetzung oben ersetzt):** Der neue, lokal/CI-geprüfte Modus `--build-access --apply` ist vorbereitet, aber **noch nicht auszuführen**: Er verlangt alle drei exakt geprüften Bestandsressourcen und würde beim derzeit als fehlend gemeldeten Upload-Bucket stoppen. Es wurde kein Buildrecht geändert und kein Ersatzspeicher angelegt. Als nächster konkreter Schritt liest Matthias in seiner Cloud Shell ausschließlich die tatsächlichen Bucket-Namen und Regionen:

```bash
gcloud storage buckets list \
  --project=movie-hub-62459 \
  --raw --format='table(name,location)'
```

Danach die Buildziele anhand des Bestands festlegen und erforderliche Rechte gezielt einrichten. Keine spekulative Ausweitung der GitHub-Leserechte. Anschließend isolierter Function-/Index-Deploy mit Versand aus, konkrete Aufrufrechte/Retry-Job und kontrollierter Resend-Test mit noch festzustellender Resend-Kontoadresse. #384 bleibt bis echter Empfangs-/Geräteabnahme offen.

- Unter **Profile & Konto** steht direkt unter dem Profilnamen eine Empfängeradresse mit „Mitteilungen auch per E-Mail erhalten“. Hauptprofil initial mit Konto-Adresse, Unterprofile leer, Option zunächst aus. Bewusst geleerte/geänderte Werte bleiben erhalten; die Loginadresse bleibt unverändert.
- Speichern und Live-Synchronisierung sind profilbezogen. Ein Entwurf bleibt bei gleichzeitiger Änderung auf einer zweiten Ansicht erhalten; veraltete Snapshots überschreiben keinen erfolgreichen Speichervorgang. Bestätigungsstatus und Speichermeldung sind gemeinsam sichtbar. E-Mail-Feld, Schalter und Speichern sind mit D-Pad nacheinander erreichbar.
- Servergrundlage mit Adressbestätigung, vier HTML-/Textvorlagen, signierten Links, dauerhafter Deduplizierung und begrenzten Wiederholungen vorbereitet. Kein rückwirkender Versand. Die isolierte Mail-Codebase bleibt ausgeschaltet; Betriebsanleitung: `docs/EMAIL_NOTIFICATIONS.md`.
- Lokal **1.073 Anwendungstests + 33 Emulator-/Regeltests**, Produktionsbuild und isolierter Function-Import erfolgreich. Produktive Mail-Abhängigkeiten ohne npm-Audit-Funde.
- Browserprüfung inzwischen **bestanden**: echte Profilkomponenten und Firestore-Speicherlogik mit lokalem Emulator, synthetischen Konten und Profilwahl-Fixture; vier Bildschirmgrößen, zwei Live-Ansichten, D-Pad sowie alle Mailvorlagen. Die vorherige Runtime-Blockade ist behoben. Dies ersetzt keine physische Smartphone-/Fire-TV- oder echte Mailclient-Abnahme.
- Für den geprüften PR-Stand `fa020d4`: [CI #1380](https://github.com/matthias-ennen/movie-hub/actions/runs/38534119951) und [Android APK #1305](https://github.com/matthias-ennen/movie-hub/actions/runs/38534119658) erfolgreich. CI enthält die Browserprüfung und das synthetische Screenshot-/Berichtartefakt (7 Tage).
- Für den übernommenen Stand `a790327`: [CI #1381](https://github.com/matthias-ennen/movie-hub/actions/runs/38534463081), [Android APK #1306](https://github.com/matthias-ennen/movie-hub/actions/runs/38534462942) und [Deploy Firebase #1014](https://github.com/matthias-ennen/movie-hub/actions/runs/38534463068) **erfolgreich**, einschließlich tatsächlicher Veröffentlichungsprüfung.
- Zusätzlich direkt an `https://movie-hub-62459.web.app/` geprüft: Entry `index-DZg9YNL7.js`, Profil-Chunk `ProfileView-B1qwozLA.js`, About-Chunk `AboutView-DL0sm4cY.js`; Build-ID `a790327`, E-Mail-Feld, Mailoption, Speicherbutton und Hinweis auf ausstehende Versandfreischaltung vorhanden. Keine neue APK für diese Weboberfläche erforderlich; keine Geräteinstallation behauptet.

**Manuelle Rückmeldung 14.10.2026, 10:31 Uhr:** Matthias bestätigt die angezeigten Einstellungen („Passt“) und hat die Mailoption aktiviert. Das ist die Bestätigung der bisherigen Hauptprofilanzeige, keine vollständige Unterprofil-/Zwei-Geräte-Abnahme und kein Zustellnachweis. Ob anschließend ausdrücklich gespeichert wurde, wurde noch nicht serverseitig geprüft.

**Jetzt beauftragt:** Mit provisorischem Versand ohne eigene Domain fortfahren. Der vorhandene Transport unterstützt `MovieHub <onboarding@resend.dev>`. Resend erlaubt damit nur die mit dem Resend-Konto verbundene Empfängeradresse; diese muss vor dem ersten Test feststehen. Matthias hat am 14.10.2026 um 10:40 Uhr die angeleitete Ersetzung und sichere Ablage des neuen Resend-Schlüssels unter `RESEND_API_KEY` mit „Erledigt“ bestätigt. Der erneute Metadatenlauf bestätigt inzwischen eine aktive Secret-Version; Schlüsselgültigkeit und Versandberechtigung sind noch nicht getestet. Kein Testversand erfolgt. Firebase-Anbindung für die kontrollierte Servereinrichtung angeboten. App und Mail-Server bleiben bis zur tatsächlich erfolgten Einrichtung getrennt; das Aktivieren der Profiloption allein startet noch keinen Versand.


**Technischer Infrastrukturstand 14.10.2026, 10:49 Uhr:** Der ausschließlich lesende [Prüflauf #1](https://github.com/matthias-ennen/movie-hub/actions/runs/38537750613) aus [PR #440](https://github.com/matthias-ennen/movie-hub/pull/440), main `b650c13`, wurde ausgeführt. Die rote Schlussfolgerung zeigt offene Voraussetzungen, keine fehlgeschlagene Mail und keinen App-Fehler.

- Alle zehn benötigten APIs aktiv, Firestore Native in `europe-west3`, Cloud-Abrechnung aktiviert.
- Secret-Versionsmetadaten für `RESEND_API_KEY` und `MOVIE_HUB_EMAIL_TOKEN_KEY` mit dem GitHub-Deploy-Zugang nicht lesbar. Daraus wird weder Abwesenheit noch ungültiger Inhalt abgeleitet.
- Dedizierte Konten `movie-hub-email`, `movie-hub-email-build`, `movie-hub-email-events` und Rolle `MovieHubEmailRuntime` fehlen; Rollenzuordnung und Retry-Index benötigen Einrichtung. Alle vier Mail-Functions fehlen.
- Kein Secret-Wert oder persönlicher Profildatensatz gelesen, kein IAM-/Function-Deploy und keine Mail durch diesen Prüflauf.
- PR-Codeprüfung [CI #1382](https://github.com/matthias-ennen/movie-hub/actions/runs/38537451792) und [Android #1307](https://github.com/matthias-ennen/movie-hub/actions/runs/38537451643) erfolgreich; main [CI #1383](https://github.com/matthias-ennen/movie-hub/actions/runs/38537750470) ebenfalls erfolgreich. Lokale Syntax-/YAML-Prüfung und zwei synthetische CLI-Durchläufe (je 24 Checks, einschließlich korrekt gesperrtem Berechtigungsfehler) bestanden.

**Fortschritt nach der Rückmeldung um 10:55 Uhr:** Die scoped Viewer-Freigabe greift. [Prüflauf #1, Versuch 2](https://github.com/matthias-ennen/movie-hub/actions/runs/38537750613/attempts/2) erkennt `RESEND_API_KEY` als aktive Secret-Version. Der Token-Schlüssel bleibt für diesen Prüfer unlesbar; Konten, Rolle, Index und Functions sind noch offen. Keine Schlüsselwerte gelesen und keine Mail versandt.

**Einrichtung vorbereitet:** [PR #441](https://github.com/matthias-ennen/movie-hub/pull/441) ist als main `7649d946a902fad65ad82b363ad937539e45a2e9` übernommen. `scripts/setup-profile-email-cloud.py` richtet bei ausdrücklichem `--apply` im festen MovieHub-Projekt vier Mailkonten, die begrenzte Laufzeitrolle, kontobezogene actAs-Rechte und zwei ressourcenbezogene Secret-Grants ein. Ein zufälliger Token-Schlüssel geht direkt über stdin an Secret Manager. Vorhandene Schlüssel werden nicht ersetzt, abweichende Rollen und Berechtigungsfehler führen zum Abbruch; Schreibvorgänge werden rückgelesen. Keine Functions, Indizes, Scheduler oder E-Mails durch dieses Skript.

- Acht simulierte Cloud-Prüfungen lokal und in [CI #1384](https://github.com/matthias-ennen/movie-hub/actions/runs/38539896083) erfolgreich; gesamte PR-CI einschließlich Anwendung, Regeln und Browser grün. [Android #1309](https://github.com/matthias-ennen/movie-hub/actions/runs/38539896079) ebenfalls erfolgreich.
- Zusätzliche lokale Metadaten-Simulation: je 25 Checks für vollständig vorhandene Ressourcen, fehlende Rechte und deaktivierte neueste Secret-Version; korrekte Sperre und keine privaten Fehlermeldungen im Report.
- Der neue Preflight prüft die tatsächlich neueste Secret-Version, ergänzt das vierte Konto und meldet bereinigte Fehlerkategorien. [Main-Prüflauf #2](https://github.com/matthias-ennen/movie-hub/actions/runs/38540128127) ist abgeschlossen: auch die **neueste** `RESEND_API_KEY`-Version ist aktiv. Token-Metadaten noch wegen Berechtigung/Authentifizierung unlesbar; alle vier Mailkonten und die Rolle fehlen, Index und vier Functions stehen aus. Daher erwartungsgemäß noch rot; kein Versandversuch.
- Anleitung und genauer Umfang: [EMAIL_CLOUD_SETUP.md](https://github.com/matthias-ennen/movie-hub/blob/7649d946a902fad65ad82b363ad937539e45a2e9/docs/EMAIL_CLOUD_SETUP.md). Merge und CI führen das Einrichtungsskript nicht aus. Matthias hat das Skript ausgeführt; Screenshot vom 14.10., 11:12 Uhr zeigt Abbruch bei `Dienstkonto movie-hub-email`. Die generische Meldung nennt noch keine belastbare Ursache. Token-Erzeugung und Rechtevergabe wurden im gezeigten Ablauf nicht erreicht.

**Fortschritt nach dem Screenshot vom 14.10., 11:22 Uhr:** Der direkte SDK-Aufruf bestätigt mit `ALREADY_EXISTS`, dass `movie-hub-email` vorhanden ist. Der darüber sichtbare erneute Skriptabbruch liegt inzwischen bei `movie-hub-email-build`. Der frühere Sammelfehler belegt nicht den genauen ursprünglichen SDK-Status. Die sofortige einmalige Rückprüfung nach Anlage war jedoch nicht robust gegen Googles dokumentierte verzögerte Kontosichtbarkeit.

**Korrektur übernommen:** [PR #442](https://github.com/matthias-ennen/movie-hub/pull/442), main `84cf1612a6557c19f209908fcdad08f0110b1a8d`. Ausschließlich lesende, begrenzte Wiederholungen nach Kontoanlage/Existenzkonflikt; Bestandskonten nach Identitäts-/Aktivitätsprüfung weiterverwenden. Keine automatische Wiederholung von Anlegebefehlen, keine Erhöhung des Rechteumfangs und keine Secret-Rotation. Dauerhaft nicht lesbare oder deaktivierte Konten blockieren Rollen-/Secret-Fortschritt. Fehler nennen jetzt Anlage/Rückprüfung sowie bereinigte Status- und Exit-Codes.

- 15 gezielte Cloud-Simulationen lokal und in [CI #1386](https://github.com/matthias-ennen/movie-hub/actions/runs/38542524225) bestanden; vollständige Anwendung-/Regel-/Browserprüfung ebenfalls erfolgreich. [Android #1311](https://github.com/matthias-ennen/movie-hub/actions/runs/38542524227) erfolgreich.
- Vorheriger main-Stand `7649d94`: [CI #1385](https://github.com/matthias-ennen/movie-hub/actions/runs/38540127843), [Android #1310](https://github.com/matthias-ennen/movie-hub/actions/runs/38540127790) und [Hosting #1016](https://github.com/matthias-ennen/movie-hub/actions/runs/38540128189) erfolgreich. Diese Codeprüfungen/Hosting-Deploys richten die Mailkonten nicht ein.

**Nächster konkreter Schritt:** Matthias lädt das korrigierte `scripts/setup-profile-email-cloud.py` aus dem festen Commit `84cf1612a6557c19f209908fcdad08f0110b1a8d` und führt es in derselben Cloud Shell mit `--apply` aus. Bei Wartehinweisen laufen lassen; Erfolgs- oder genauere STOPP-Zeile zurückmelden. Danach unabhängige Metadatenprüfung und verbleibende Buildspeicher-/Index-/Function-Einrichtung. Tatsächlicher Erfolg dieses korrigierten Cloud-Laufs und Testempfänger weiterhin offen.


**Nachprüfung nach dem Screenshot:** [Prüflauf #2, Versuch 2](https://github.com/matthias-ennen/movie-hub/actions/runs/38540128127/attempts/2) bestätigt weiterhin die aktive neueste Resend-Version. Die Konten `movie-hub-email` und `movie-hub-email-build` sind nun für den GitHub-Zugang wegen Berechtigung/Authentifizierung nicht lesbar; das ist ausdrücklich kein Beleg, dass sie fehlen. Events-/Scheduler-Konto weiterhin als fehlend gemeldet. Die Originalmeldung aus Matthias’ Cloud-Shell-Konto wird zur Klärung benötigt; keine zusätzliche Rolle pauschal vergeben.
Anschließend isolierte Mail-Functions, Bestätigungs-/Abmeldeweg und echten Empfang testen. Nach Domainfreischaltung den Absender auf `moviehubgermany.de` umstellen und weitere Profiladressen testen. **#384 bleibt offen; #112 bleibt das Gate vor öffentlicher Verteilung.**

---

## Aktueller Einstieg 14.10.2026 – Empfänger je Profil unter „Profile & Konto“

**Status:** Matthias hat die Arbeit an der E-Mail-Grundlage beauftragt und die Bedienung konkretisiert. Repository und offizielle technische Dokumentation sind untersucht. Dieser Abschnitt ist der aktuelle Umfang und ersetzt insbesondere den früher geplanten Ort „Einstellungen → Mitteilungen“ sowie die Beschränkung auf die Konto-Adresse. App-/Backend-Code ist in diesem Einstieg noch nicht geändert; kein Anbieter eingerichtet, kein Versand und kein Deployment erfolgt.

### Verbindlicher Nutzerwunsch

- Auf **Profile & Konto** direkt unter dem Eingabefeld für den Profilnamen ein editierbares Feld **E-Mail-Adresse**.
- Hauptprofil: Konto-E-Mail aus Firebase Authentication automatisch vorausfüllen, wenn noch keine bewusste Empfängereinstellung vorliegt.
- Unterprofile: Feld zunächst leer; keine automatische Übernahme der Konto-Adresse.
- Darunter eine profilbezogene Ein-/Aus-Option, vorgeschlagene Beschriftung **Mitteilungen auch per E-Mail erhalten**. Standard bleibt aus.
- Die für dieses Profil gespeicherte Adresse ist sein Empfänger. Änderungen des Mail-Empfängers ändern weder die Anmeldeadresse noch die Zuordnung des Firebase-Kontos.
- Alle bestehenden persönlichen Meldungen aus den zwei Beobachtungen berücksichtigen: `included-found`, `tv-found`, `tv-final`. Keine neuen Beobachtungsarten in diesem Paket.
- Passende gestaltete deutsche E-Mails zum beobachteten Titel, mit Profilbezug und zutreffendem Anbieter-/TV-Kontext.

### Verifizierter technischer Ausgangspunkt

Quellstand: `main` / `970e7267652a105ad4362c7cdf3e2374eb003e37`.

- `src/components/ProfileView.jsx` enthält bereits Profilauswahl und Namensformular; die Kontoadresse wird getrennt darunter angezeigt. `role: primary/member` ist vorhanden.
- `src/profiles/ProfileProvider.jsx` lädt Profile mit `getDocs` beim Start und aktualisiert anschließend lokale Werte. Für Mail-Einstellungen ist ein gezielter geräteübergreifender Aktualisierungspfad nötig; Backend-Entscheidungen dürfen nicht vom letzten Clientzustand abhängen.
- `useTitleAlerts.js`, `scripts/check-title-alerts.mjs` und `scripts/check-tv-final-reminders.mjs` schreiben in denselben profilbezogenen Mitteilungspfad. Ein gemeinsamer serverseitiger Anschluss an neue Mitteilungen erfasst alle drei Entstehungswege ohne zusätzliche TMDB-/Provider-Abfragen je Mail.
- Die Profildokumente sind laut `firestore.rules` durch den Kontoinhaber schreibbar. Ein dort frei gesetztes `verified` wäre keine vertrauenswürdige Bestätigung. Verifikation, Versandstatus und Mailaufträge brauchen eigene serververwaltete Datensätze und passende Regeln.
- Der bestehende Functions-Framework-Einstieg enthält ausschließlich den privaten TV-Minutenprüfer. Repo-Suche nach SMTP/Resend/SendGrid/Nodemailer/Mailgun/Brevo und Firebase-E-Mail-Verifikationsaufrufen ergab keinen vorhandenen allgemeinen Versand-/Verifikationspfad. Dies ist eine Codeprüfung, keine Bestandsauskunft über möglicherweise außerhalb des Repos eingerichtete Dienste.
- `personalDataCrypto.js` verlangt die native Kryptobrücke. Die vorhandene Verschlüsselung persönlicher Notizen/Links lässt sich daher nicht unverändert für einen bei geschlossener App arbeitenden Mailserver verwenden. Empfängerdaten benötigen eine bewusst serverlesbare, private Ablage; keine Adressen oder Bestätigungstoken in öffentlichen Artefakten/Logs.

### Architekturvorschlag und konkrete Umsetzungsschritte

1. **Profilkontakt und Bedienung:** Versionierter Kontakt-/Opt-in-Vertrag je UID + Profil-ID. Hauptprofil nur initial vorbelegen; ausdrücklich geleerte oder geänderte Werte nicht beim nächsten Start überschreiben. Unterprofile bleiben leer. Adresse und Option bewusst speichern; leere/ungültige Adresse verhindert Aktivierung. Gezielte Statussynchronisierung im Profilbereich, keine Abfragen je Poster oder Titelansicht.
2. **Adressbestätigung:** Authentifizierter Backend-Pfad prüft UID und Profilzuordnung. Bereits vom Server bestätigte identische Konto-Adresse kann übernommen werden; andere oder unbestätigte Adressen über einmaligen, ablaufenden Bestätigungslink. Adresswechsel entwertet alte Bestätigung/ausstehende Aufträge. Token nur gehasht ablegen, Links zeitlich begrenzen und Bestätigungsversand begrenzen. Ein automatischer Linkabruf durch Mailscanner darf keine irreversible Bestätigung bewirken. Bestätigung und Abschalten auf Handy/Browser zugänglich halten.
3. **Gemeinsamer Ereignisanschluss:** Neue persönliche Mitteilungen serverseitig verarbeiten. Ereignisart, UID/Profil, Aktivierung und kanonische Ereignis-ID prüfen. Clientgeschriebene Nachrichten sind kein vertrauenswürdiger Auftrag mit frei wählbarem Empfänger/Betreff/HTML. Feste Vorlagen und geprüfte strukturierte Referenzen verwenden; benötigte Anbieterinformationen über den vorhandenen gemeinsamen Metadatenpfad bereitstellen.
4. **Versandzustand und Wiederholung:** Dauerhafter Auftrag je UID + Profil-ID + Ereignis-ID. Opt-in-/Adressversion, Aktivierungszeitpunkt, Gültigkeit und Abmeldung vor Übergabe an den Anbieter erneut prüfen. Keine Nachsendung alter Mitteilungen beim Einschalten oder späterer Bestätigung. Bereits regulär abgeschlossene Beobachtungen dürfen ihre zugehörige Abschlussmail erhalten; abgeschlossene Beobachtung nicht pauschal mit Abmeldung verwechseln. TV-Zeitgrenze aus Ausstrahlung ableiten, nicht aus der längeren In-App-Sichtbarkeit. Wartende veraltete Aufträge verwerfen.
5. **Transport:** Eigenständiger Gen2-Backend-Baustein mit separater Runtime/Secret-Verwaltung und austauschbarem Versandadapter. Den privaten TV-Minutenprüfer und seinen Scheduler unverändert erhalten. Keine neue managed Firebase Extension als Fundament. Anbieter mit Idempotenzunterstützung bevorzugen; bei Resend gilt das Anbieterfenster von 24 Stunden, deshalb zusätzlich dauerhaften eigenen Status und begrenzte Retry-Frist verwenden. Profiladresse/Opt-in vor Versand erneut lesen; bereits an den Anbieter übergebene Mails können durch späteres Ausschalten nicht zurückgerufen werden.
6. **Mailvorlagen:** Gemeinsamer MovieHub-Rahmen, mobile Darstellung, HTML plus Text, Profilname, Titel, Anlass sowie vorhandene Anbieter-/Sender-/Zeitangaben (Europe/Berlin). Bei verspäteter, noch gültiger TV-Erinnerung zutreffend „läuft jetzt“, niemals falsches „in fünf Minuten“. Nach Versandprotokoll trennen zwischen vom Anbieter angenommen und tatsächlich zugestellt. Mailfehler blockieren weder In-App-Meldung noch Abschluss der Beobachtung.
7. **Prüfung/Bereitstellung:** Default-/Migrationsfälle, bewusst leere Hauptprofiladresse, Profil-/Kontotrennung, ungültige und geänderte Adressen, Verifikation/Tokenablauf, Abschalten vor Retry, doppelte/ungeordnet eintreffende Events, abgeschlossene Beobachtung, Mailfehler und TV-Ablauf gezielt testen. UI mit Touch/D-Pad prüfen. Anschließend Infrastruktur anhand des konkreten Anbieters bereitstellen und ausdrücklich autorisierten Testversand sowie manuelle Geräteabnahme durchführen.

### Noch zu konkretisieren

**Nächste Produkt-/Einrichtungsfrage:** Ist eine eigene Domain bzw. bereits ein technischer Absender/Versanddienst vorhanden? Das entscheidet über den günstigsten Einrichtungsweg. Keine Anbieterbuchung oder Domainwahl ist erfolgt. Resend ist ein technisch passender Kandidat wegen der Idempotenzunterstützung; regulärer Versand setzt dort eine eigene verifizierte Domain voraus.

Die frühere Aufwandsschätzung galt für die bestätigte Konto-Adresse. Mit frei wählbaren Profiladressen kommen Adressbestätigung, Adresswechsel und zusätzliche Sicherheits-/Regeltests hinzu; die alte Spanne ist keine unveränderte Zusage für diesen erweiterten Umfang.

### Zusätzliche Abnahmekriterien aus dem Nutzerinput

- [ ] E-Mail-Feld direkt unter Profilnamen in Profile & Konto; passende Mailoption darunter
- [ ] Hauptprofil initial mit Konto-Adresse, Unterprofile initial leer
- [ ] bewusst geänderte/geleerte Adresse bleibt erhalten; Konto-Anmeldung unverändert
- [ ] gespeicherter Empfänger und Opt-in strikt je Profil, geräteübergreifend konsistent
- [ ] serverseitige Bestätigung und Adresswechsel ohne Versand an alten/unbestätigten Empfänger
- [ ] gemeinsame, verständliche deutsche Vorlagen für alle drei bestehenden persönlichen Meldungsphasen

### Offizielle technische Quellen (geprüft 14.10.2026)

- [Firebase Extensions Deprecation FAQ](https://firebase.google.com/docs/extensions/faq-and-troubleshooting): Verwaltung des Extensions-Dienstes endet am 31.03.2027; bereits installierte Functions laufen weiter. Neue Grundlage daher direkt als eigener Functions-Baustein.
- [Firestore triggers](https://firebase.google.com/docs/functions/firestore-events): Ereignisse mindestens einmal, keine Reihenfolgegarantie; Verarbeitung muss Wiederholungen vertragen.
- [Trigger Email](https://firebase.google.com/docs/extensions/official/firestore-send-email): auch die Extension benötigt einen eingerichteten SMTP-Versanddienst.
- [Resend Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys): 24-Stunden-Fenster für denselben Versandauftrag.
- [Resend Domains](https://resend.com/docs/dashboard/domains/introduction): eigene verifizierte Versanddomain.

---

## Historischer Analyse- und Planungsstand bis 13.10.2026

Die folgenden Abschnitte dokumentieren die frühere Planung. Bei Abweichungen gilt der aktuelle Einstieg oben.

> **Priorität 13.10.2026, 20:46 Uhr (Europe/Berlin):** #387 (Einstellungen) und #426 (Detailseite einschließlich aller Nachträge, Build `6ef4f83`) sind durch Matthias abgenommen und abgeschlossen. Damit ist #384 das nächste vorgesehene offene Arbeitspaket. Umfang und Aufwandsschätzung sind analysiert; die Umsetzung ist noch nicht gestartet. Versanddienst/Absender und Empfängerregel sind beim Einstieg zu konkretisieren. Dieser Planungsabgleich startet keine Implementierung, Anbieterbuchung oder Testversand. Dokumentation: [PR #438](https://github.com/matthias-ennen/movie-hub/pull/438).

## Analyseauftrag 12.10.2026 – „Auch per E-Mail“ je Profil

Matthias hat #118/#381/#312 vollständig abgenommen. Für das nächste Paket
beauftragt er zunächst eine kurze technische Analyse und Aufwandsschätzung;
keine Implementierung, Anbieterbuchung oder Nachricht wird dadurch ausgelöst.

Der aktuelle Wunsch erweitert die frühere Beschränkung auf die letzte
TV-Erinnerung: bestehende **persönliche** Meldungen sollen nach profilbezogenem
Opt-in zusätzlich per E-Mail versendet werden. Umfang: `included-found`,
`tv-found` und `tv-final`. Globale Admin-Mitteilungen sind kontoweit und
werden nicht stillschweigend in diesen Profilkanal aufgenommen.

## Bedienung und Mailinhalt

- Einstellungen → Mitteilungen → **Auch per E-Mail**, standardmäßig aus.
- Speicherung und Versandentscheidung je Konto und Profil, auf allen Geräten
  konsistent; vorhandene Touch-/D-Pad-Gestaltung beibehalten.
- Verständliche deutsche HTML-/Textvorlagen je Anlass, mit Profilname,
  Titel, Anbieter oder Sender und Termin soweit vorhanden.
- Grundlage der Schätzung: bestätigte Konto-E-Mail aus Firebase Authentication.
  Eine eigene Empfängeradresse je Profil ist bislang nicht eindeutig verlangt;
  falls gewünscht, vor Umsetzung einschließlich Adressbestätigung festlegen.
- No-Reply-Absender ist möglich, aber keine technische Pflicht. Tatsächlicher
  Absender und Versanddienst müssen eingerichtet/verifiziert werden.

## Technischer Befund aus dem aktuellen Repo

- `SettingsView.jsx` enthält bereits `TitleWatchSettings` mit UID, Profil-ID
  und Profilname; `ProfileProvider.jsx` lädt und speichert Profileinstellungen.
  Die Mailoption kann diese Struktur erweitern. Die Profiloption benötigt
  einen zuverlässigen geräteübergreifenden Aktualisierungspfad.
- Persönliche Meldungen stehen unter
  `users/{uid}/profiles/{profileId}/notifications/{notificationId}`.
  Ihre vorhandenen stabilen Ereignis-IDs können zur Deduplizierung dienen.
- `useTitleAlerts.js` erzeugt Sofortmeldungen im Client,
  `check-title-alerts.mjs` spätere Treffer im Datenlauf und
  `check-tv-final-reminders.mjs` die letzte Erinnerung.
  Nur den Minutenprüfer zu erweitern würde daher zwei Entstehungspfade verfehlen.
- Der aktuelle Function-Einstieg ist ein privater HTTP-Minutenprüfer.
  In den geprüften Profil-/Mitteilungs- und Function-Dateien ist kein
  allgemeiner Mailkanal vorhanden.

## Vorgeschlagene Umsetzung

1. Versionierte Profiloption mit Default aus, Opt-in-Zeitpunkt und sicherem
   Speichern/Lesen ergänzen. Bereits vorhandene Meldungen nicht nachversenden.
2. Gemeinsamen vertrauenswürdigen Backend-Pfad für neu erzeugte persönliche
   Meldungen vorsehen: Profiloption und bestätigten Empfänger prüfen,
   erlaubten Ereignistyp/Bezug validieren und Versandauftrag erzeugen.
   Keine frei verwendbare Mailfunktion oder Client-Mail-Outbox.
3. Versandstatus und Wiederholungsregeln über UID + Profil-ID + Ereignis-ID
   führen. Schutz vor doppeltem Versand, begrenzte Wiederholungen, erneutes
   Prüfen von Abmeldung/Gültigkeit vor Zustellung; veraltete TV-Erinnerungen
   nicht beliebig spät nachsenden. Exakte Wiederholungsgarantie hängt auch
   von der Idempotenzunterstützung des gewählten Versanddienstes ab.
4. Versanddienst, verifizierten Absender und Secret-Verwaltung einrichten.
   Eigener serverseitiger SMTP-/API-Versand oder geeignete Firebase-Anbindung
   auswählen; keine Anbieterentscheidung getroffen.
5. Gemeinsame Mailvorlagen bauen. Mailfehler dürfen weder In-App-Meldung
   noch Beobachtungsabschluss verhindern.
6. Profil-/Kontotrennung, alle drei Ereigniswege, Aus/Ein, Doppelereignisse,
   Versandfehler und Smartphone-/Fire-TV-Bedienung testen; danach kontrollierte
   Bereitstellung und ausdrücklich autorisierter Testversand.

## Aufwandsschätzung

Grobe Planungsspanne, keine feste Terminzusage:

- UI/Profiloption: etwa 20–40 Minuten;
- Backend-Anbindung, Vorlagen und Versandstatus: etwa 60–100 Minuten;
- gezielte Prüfungen, Bereitstellung und Abnahme: etwa 30–60 Minuten.

Mit nutzbarem Versanddienst und verifiziertem Absender insgesamt ungefähr
**2–3,5 Stunden gemeinsamer Arbeit**. Bei vollständiger Neueinrichtung eher
**3–5 Stunden**, zuzüglich möglicher externer Domain-/Anbieter-Wartezeiten.
Ein kompletter produktionsfähiger Abschluss innerhalb einer Stunde ist keine
belastbare Zusage. Eigene verifizierte Empfängeradressen je Profil würden
zusätzlichen Umfang bedeuten.

## Abnahme nach späterer Umsetzung

- [ ] profilbezogene, geräteübergreifend konsistente Option, Default aus
- [ ] alle drei bestehenden persönlichen Meldungsarten werden berücksichtigt
- [ ] keine nachträglichen Mails für alte Meldungen beim Einschalten
- [ ] ausschließlich bestätigte/beabsichtigte Empfänger und feste Vorlagen
- [ ] Schutz vor Doppelversand und begrenztes Fehler-/Wiederholungsverhalten
- [ ] Abschalten und Gültigkeit vor Versand berücksichtigt
- [ ] In-App-Meldungen und Abschluss unabhängig vom Mailerfolg
- [ ] Smartphone/Fire TV, Profil-/Kontowechsel und kontrollierter Mailtest bestätigt
- [ ] Datenschutz-/Release-Gate #112 berücksichtigt

Die frühere Entscheidung vom 03.10.2026 „nur letzte TV-Erinnerung“ ist durch
den aktuellen Analyseauftrag für persönliche Meldungen erweitert.
Bezug: #314 #118 #382 #383 #112.
Technische Referenz: https://firebase.google.com/docs/extensions/official/firestore-send-email
