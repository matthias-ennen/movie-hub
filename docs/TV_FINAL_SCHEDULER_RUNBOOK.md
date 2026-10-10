# MovieHub #382 – privater Minuten-Worker und gesicherter Scheduler-Livegang

**Stand 10.10.2026:** PR #409 ist in `main` integriert. `preflight` und `prepare` wurden laut Nutzer erfolgreich ausgeführt. [Aktivierungslauf #38063377537](https://github.com/matthias-ennen/movie-hub/actions/runs/38063377537) brach nach erfolgreichen Identitäts- und Privatheitsprüfungen bei `run.services.setIamPolicy` mit `PERMISSION_DENIED` ab. **Kein Scheduler-Job aktiviert.** Korrektur: GitHub darf den einzelnen Cloud-Run-Aufrufberechtigten nur lesen/prüfen, die einmalige IAM-Zuweisung übernimmt der befugte Projektadministrator direkt auf dem einzigen TV-Dienst. Das Compute-Standardkonto bleibt unverändert.

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

## Noch manuell aufzubauende und zu verifizierende Voraussetzungen

- `movie-hub-tv-build`: Google-Cloud-Build-Berechtigungen gemäß der offiziellen Cloud-Functions-Dokumentation; mindestens Log Writer, Artifact Registry Writer auf erforderlichem Repo und Storage Object Viewer auf erforderlichem Quell-Bucket. Bestands-Registry `gcf-artifacts` und Build-Quell-Buckets liegen bisher **nur in europe-west1**, die neue Funktion ist die erste in europe-west3. Daher west3-Buildspeicher gezielt anlegen/verifizieren, **keine pauschalen Rechte am Nachtlauf-Bucket** `movie-hub-62459-nightly-checkpoints`.
- GitHub-Deployer: `roles/iam.serviceAccountUser` **direkt** auf Build-, Runtime- und Scheduler-SA; `roles/cloudfunctions.developer`, `roles/datastore.indexAdmin`, `roles/cloudscheduler.admin` bestehen. Beim geänderten `activate`-Workflow wird `run.services.getIamPolicy` verwendet, **nicht** `run.services.setIamPolicy`. Daher keine zusätzliche Cloud-Run-IAM-Schreibrolle für GitHub.
- Scheduler-SA wurde vom Nutzer angelegt. Einmalig die Aufrufrolle durch den Projektadministrator **direkt am TV-Cloud-Run-Service** vergeben, **bevor** das korrigierte `activate` gestartet wird (kein Projektgrant). Google Cloud Scheduler-Service-Agent muss existieren und funktionieren.
- Firestore Composite-Index-Bestand vorab leer, Field-Overrides laut Nutzer-Screenshot nur Standardkonfiguration `*`; Indexdatei enthält den neuen `notifications`-Composite.
- GitHub Environment: Required Reviewer `matthias-ennen`, Selbstfreigabe erlaubt, Admin-Bypass aus, ausschließlich `main`.
- IAM-Änderungen, mögliche Cloud-Kosten und jeder produktive Job benötigen gesonderte Nutzerfreigabe.

## Einmalige IAM-Reparatur nach rotem Aktivierungslauf

Der Projektadministrator führt in der **Google Cloud Shell** einmalig genau diese ressourcengebundene Zuweisung aus (nur nach Prüfung von Projekt und Service, keine Projektrolle):

```sh
gcloud run services add-iam-policy-binding moviehubtvfinalreminder \
  --project=movie-hub-62459 --region=europe-west3 \
  --member="serviceAccount:movie-hub-tv-scheduler@movie-hub-62459.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

Danach per `gcloud run services get-iam-policy moviehubtvfinalreminder --project=movie-hub-62459 --region=europe-west3 --format=yaml` kontrollieren, dass nur der Scheduler-Serviceaccount diese Rolle erhält und weder `allUsers` noch `allAuthenticatedUsers` berechtigt sind. **Der Nutzer muss den reparierten Workflow von `main` neu ausführen**: Der alte rote Run-Stand kennt die geänderte Prüfung nicht. Der Scheduler startet erst, wenn das geschützte `activate` wieder erfolgreich läuft.

## Risiken, Rollback und Monitoring

- **Kein Scheduler bei fehlgeschlagenem `prepare`**; Funktion bleibt privat und ohne regelmäßigen Trigger. Index darf bei Fehler erhalten bleiben.
- **Bei Fehlern nach `activate`:** Scheduler-Job `movie-hub-tv-final-1min` unverzüglich **pausieren** (`gcloud scheduler jobs pause ...`). Bestätigte Meldungen und Watch-Abschlüsse nicht löschen oder ungeprüft rücksetzen.
- `activate` bricht ab, wenn der geplante Job oder der alte Firebase-Scheduler-Job bereits existiert; keine versteckte Doppelaktivierung. Frühere Bereitstellungen können nach vorheriger Prüfung gezielt korrigiert werden.
- Den HTTP-Endpunkt weder öffentlich freigeben noch über einen ungeprüften Browser-Request testen; Cloud Run IAM ist die Zugangsschranke, HTTP-Methode POST eine zusätzliche Verteidigung.

Quellen: https://docs.cloud.google.com/sdk/gcloud/reference/functions/deploy ; https://docs.cloud.google.com/run/docs/authenticating/service-to-service ; https://docs.cloud.google.com/run/docs/triggering/using-scheduler ; https://firebase.google.com/docs/functions/schedule-functions .

**Status:** Private Function vorbereitet; Scheduler nach fehlgeschlagenem Aktivierungslauf noch inaktiv. Nach separater Dienst-IAM-Zuweisung, grünem Korrektur-PR und bestandener echter Scheduler-/Geräteprüfung erneut bewerten. Keine Produktabnahme.
