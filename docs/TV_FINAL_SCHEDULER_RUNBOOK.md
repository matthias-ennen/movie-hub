# MovieHub #382 – privater Minuten-Worker und gesicherter Scheduler-Livegang

**Dokumentationsstand 12.10.2026:** PR #409/#410 sind in `main` integriert.
Der freigegebene [Aktivierungslauf #38064584915](https://github.com/matthias-ennen/movie-hub/actions/runs/38064584915)
hat am 10.10.2026 den privaten Scheduler `movie-hub-tv-final-1min` mit
`state: ENABLED`, `schedule: '* * * * *'`, `timeZone: Etc/UTC` und OIDC-POST
erzeugt und rückgelesen. Cloud-Logs vom 10.10., 17:46–17:48 Uhr Europe/Berlin,
sind in [#382 dokumentiert](https://github.com/matthias-ennen/movie-hub/issues/382#issuecomment-6099322840):
jeweils `failed=0`, `considered=0`, `finalCreated=0`; einmal `expired=2`.
Das ist der letzte hier belegte Cloud-Betriebsnachweis, keine neue Cloud-Abfrage
vom 12.10.2026. Die fachliche Film-/Serien-End-to-End-Abnahme hat Matthias
am 12.10.2026 ausdrücklich bestätigt; #382 ist abgeschlossen.

Der frühere [rote Lauf #38063377537](https://github.com/matthias-ennen/movie-hub/actions/runs/38063377537)
scheiterte an `run.services.setIamPolicy`. Nach der einmaligen ressourcenbezogenen
IAM-Zuweisung durch den Projektadministrator prüft GitHub den Invoker nur lesend.
Das Compute-Standardkonto bleibt unverändert. Die Aktivierung nicht wiederholen.

## Rollen, Dienste, Trennung

- **Deployer:** `github-movie-hub-deploy@movie-hub-62459.iam.gserviceaccount.com` (OIDC Workload Identity, nur geschützter Workflow).
- **Build:** `movie-hub-tv-build@movie-hub-62459.iam.gserviceaccount.com`, explizit `--build-service-account=projects/movie-hub-62459/serviceAccounts/...`. **Kein** Editor.
- **Runtime:** `movie-hub-tv-final@movie-hub-62459.iam.gserviceaccount.com` mit den benötigten fünf Firestore-Rechten, kein Delete.
- **Scheduler-Caller:** `movie-hub-tv-scheduler@movie-hub-62459.iam.gserviceaccount.com`, ohne Firestore-Zugriff; nur `roles/run.invoker` auf dem **einen** Cloud-Run-Dienst.
- Region `europe-west3` (Frankfurt), Node 22, 256 MiB, 60 s, `maxInstances=1`, `concurrency=1`.
- Cloud Scheduler in `europe-west3`, ein HTTP-POST pro Minute, OIDC-Audience = exakte URL, null Wiederholungsversuche, niemals unauthentifiziert. Worker ohne zusätzliche TV-/TMDB-Abfragen, bestehender Firestore-Transaktionspfad und Deduplizierung bleiben unverändert.

## Release-Gates in `.github/workflows/tv-final-infrastructure.yml`

1. **`preflight`** (lesen): unverändert, um bestehende APIs/Billing/Runtime-IAM zu kontrollieren. Der vorliegende Nutzer-Preflight hatte 11/11 grüne Checks. Das war **kein** Live-Deployment-Test.
2. **`prepare`** (manuell, nur `main`, exakte Phrase `PREPARE_MOVIEHUB_TV_FINAL_PRIVATE`, Environment `production-tv-final-reminders` mit Nutzerfreigabe): Tests/Build, Firestore-Index bereitstellen + `READY` abwarten, danach **nur private HTTP-Function** per `gcloud functions deploy --gen2 --build-service-account`; kontrolliert anschließend Runtime-/Build-SA und URL. **Kein Scheduler-Job**, kein periodischer Lauf. Ein erneuter `prepare`-Lauf bricht ab, sobald bereits ein TV-Minutenjob existiert, damit keine aktive Funktion unbemerkt neu ausgerollt wird.
3. **`activate`** (erneut separate manuelle Nutzerfreigabe, Phrase `ENABLE_MOVIEHUB_TV_FINAL_1MIN`): Existenzen & Identitäten erneut verifizieren; keine bestehende Scheduler-Job-Übernahme; vorab vom Projektadministrator erteiltes `roles/run.invoker` auf **nur diesem** Cloud-Run-Service **rein lesend** prüfen; öffentliche IAM-Principals und deaktivierte Cloud-Run-Invoker-IAM-Prüfung explizit verbieten; Funktionsziel auf die geprüfte Cloud-Run-Ressource und `run.app`-URL begrenzen; **erst dann** einen OIDC-authentifizierten, minutengenauen Scheduler-Job erzeugen. Beim Fehler vor dem letzten Schritt bleibt die Function privat/dormant.
4. Prüfung der tatsächlichen `considered/finalCreated/skipped/failed`-Logs und echter Film-/Serien-End-to-End-Tests auf Smartphone/Fire TV. Nur dann #382 abnehmen.

Der normale `deploy-firebase.yml`-Nachtlauf bleibt auf `hosting,firestore:rules` begrenzt. **Niemals** `firebase deploy --only functions` oder die alte `onSchedule`-Variante für diese Function starten.

## Voraussetzungen der abgeschlossenen Ersteinrichtung

Die folgenden Punkte dokumentieren die damalige Einrichtung. Sie sind keine
erneute Arbeitsanweisung oder Behauptung aktuell fehlender Voraussetzungen.
Vor einem späteren Infrastruktur-Update ist der aktuelle Bestand erneut zu prüfen.

- `movie-hub-tv-build`: Google-Cloud-Build-Berechtigungen gemäß der offiziellen Cloud-Functions-Dokumentation; mindestens Log Writer, Artifact Registry Writer auf erforderlichem Repo und Storage Object Viewer auf erforderlichem Quell-Bucket. Bestands-Registry `gcf-artifacts` und Build-Quell-Buckets liegen bisher **nur in europe-west1**, die neue Funktion ist die erste in europe-west3. Daher west3-Buildspeicher gezielt anlegen/verifizieren, **keine pauschalen Rechte am Nachtlauf-Bucket** `movie-hub-62459-nightly-checkpoints`.
- GitHub-Deployer: `roles/iam.serviceAccountUser` **direkt** auf Build-, Runtime- und Scheduler-SA; `roles/cloudfunctions.developer`, `roles/datastore.indexAdmin`, `roles/cloudscheduler.admin` bestehen. Beim geänderten `activate`-Workflow wird `run.services.getIamPolicy` verwendet, **nicht** `run.services.setIamPolicy`. Daher keine zusätzliche Cloud-Run-IAM-Schreibrolle für GitHub.
- Scheduler-SA wurde vom Nutzer angelegt. Einmalig die Aufrufrolle durch den Projektadministrator **direkt am TV-Cloud-Run-Service** vergeben, **bevor** das korrigierte `activate` gestartet wird (kein Projektgrant). Google Cloud Scheduler-Service-Agent muss existieren und funktionieren.
- Firestore Composite-Index-Bestand vorab leer, Field-Overrides laut Nutzer-Screenshot nur Standardkonfiguration `*`; Indexdatei enthält den neuen `notifications`-Composite.
- GitHub Environment: Required Reviewer `matthias-ennen`, Selbstfreigabe erlaubt, Admin-Bypass aus, ausschließlich `main`.
- IAM-Änderungen, mögliche Cloud-Kosten und jeder produktive Job benötigen gesonderte Nutzerfreigabe.

## Historische einmalige IAM-Reparatur nach rotem Aktivierungslauf

Die folgende ressourcengebundene Zuweisung wurde vor dem erfolgreichen
Aktivierungslauf vom Projektadministrator ausgeführt (keine Projektrolle).
Nicht allein wegen der früheren Fehlermeldung erneut ausführen:

```sh
gcloud run services add-iam-policy-binding moviehubtvfinalreminder \
  --project=movie-hub-62459 --region=europe-west3 \
  --member="serviceAccount:movie-hub-tv-scheduler@movie-hub-62459.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

Die damalige Kontrolle erfolgte per `gcloud run services get-iam-policy moviehubtvfinalreminder --project=movie-hub-62459 --region=europe-west3 --format=yaml` und im korrigierten `activate`-Workflow: nur der Scheduler-Serviceaccount als Aufrufberechtigter, keine `allUsers` oder `allAuthenticatedUsers`. Der alte rote Run kann den erfolgreichen neuen Lauf nicht widerlegen; maßgeblich ist der oben verlinkte Aktivierungsnachweis.

## Timing-Abnahme und spätere Updates

- **Fundmeldung:** `Bald im TV` entsteht bei Aktivierung mit passendem
  veröffentlichtem Termin oder bei späterer Entdeckung durch den Datenlauf.
- **Enderinnerung:** `Gleich im TV` wird frühestens fünf Minuten vor Sendestart
  fällig. Bis zum nächsten Minutentakt können knapp 60 Sekunden vergehen,
  zuzüglich Scheduler-/Firestore-Latenz. Während einer noch laufenden Sendung
  lautet eine nachgeholte Nachricht `Jetzt im TV`.
- Matthias hat das Zeitverhalten am 12.10.2026 mit „Das passt auch!“ bestätigt.
  Die anschließende Gesamtabnahme („1 bis 5 abgenommen“) umfasst Film und ganze
  Serie, frühe Fundmeldung, Titelöffnung, Deduplizierung und die Enderinnerung
  bei geschlossener App; automatischer Abschluss war separat bestätigt.
  Der frühere Timing-Einwand ist erledigt. Kein Vorlaufpuffer erforderlich oder
  implementiert. Bei einer neuen konkreten Abweichung Phase, Titel/Sender,
  Sendestart und Erscheinungszeit mit Erzeugungszeit/Worker-Logs vergleichen.
- Der normale Hosting-Deploy ändert den privaten Worker nicht. `prepare`
  verweigert Änderungen bei vorhandenem Scheduler. Ein späteres Worker-Update
  braucht einen gesondert vorbereiteten und freigegebenen Update-/Rollback-Ablauf;
  vorhandene Aktivierungs- und Privatheitsprüfungen nicht umgehen.

## Risiken, Rollback und Monitoring

- **Kein Scheduler bei fehlgeschlagenem `prepare`**; Funktion bleibt privat und ohne regelmäßigen Trigger. Index darf bei Fehler erhalten bleiben.
- **Bei Fehlern nach `activate`:** Scheduler-Job `movie-hub-tv-final-1min` unverzüglich **pausieren** (`gcloud scheduler jobs pause ...`). Bestätigte Meldungen und Watch-Abschlüsse nicht löschen oder ungeprüft rücksetzen.
- `activate` bricht ab, wenn der geplante Job oder der alte Firebase-Scheduler-Job bereits existiert; keine versteckte Doppelaktivierung. Frühere Bereitstellungen können nach vorheriger Prüfung gezielt korrigiert werden.
- Den HTTP-Endpunkt weder öffentlich freigeben noch über einen ungeprüften Browser-Request testen; Cloud Run IAM ist die Zugangsschranke, HTTP-Methode POST eine zusätzliche Verteidigung.

Quellen: https://docs.cloud.google.com/sdk/gcloud/reference/functions/deploy ; https://docs.cloud.google.com/run/docs/authenticating/service-to-service ; https://docs.cloud.google.com/run/docs/triggering/using-scheduler ; https://firebase.google.com/docs/functions/schedule-functions .

**Status:** Aktivierung und wiederholter Cloud-Betrieb am 10.10.2026 nachgewiesen.
Fachliche Film-/Serien-Erinnerungskette einschließlich Timing und automatischem
Abschluss durch Matthias am 12.10.2026 abgenommen; #382 geschlossen. Die
Nutzerabnahme ergänzt den Cloud-Nachweis, liefert aber keine neuen Logwerte.
Keine erneute Infrastrukturaktivierung erforderlich.
