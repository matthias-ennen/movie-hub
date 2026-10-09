# MovieHub #382 – sicherer privater Minuten-Worker (Plan, kein Livegang)

**Stand 09.10.2026:** Die ursprüngliche Firebase-onSchedule-Implementierung war technisch getestet, aber der Firebase-CLI-Deploy konnte kein separates Build-Dienstkonto auswählen. Das Compute-Standardkonto besitzt bestehende Editor-Rechte und wird **nicht** von GitHub impersoniert oder verändert. Ein neues isoliertes Build-Konto `movie-hub-tv-build` wurde erstellt, hat aber **noch keine nachgewiesenen Build-Berechtigungen**. Diese PR schlägt einen eigenen, authentifizierten HTTP-Deploypfad vor. **Keiner der Jobs dieser PR wurde produktiv ausgeführt; vor dem Merge fehlen Live-IAM und E2E.**

## Rollen, Dienste, Trennung

- **Deployer:** `github-movie-hub-deploy@movie-hub-62459.iam.gserviceaccount.com` (OIDC Workload Identity, nur geschützter Workflow).
- **Build:** `movie-hub-tv-build@movie-hub-62459.iam.gserviceaccount.com`, explizit `--build-service-account=projects/movie-hub-62459/serviceAccounts/...`. **Kein** Editor.
- **Runtime:** `movie-hub-tv-final@movie-hub-62459.iam.gserviceaccount.com` mit den benötigten fünf Firestore-Rechten, kein Delete.
- **Scheduler-Caller:** künftig `movie-hub-tv-scheduler@movie-hub-62459.iam.gserviceaccount.com`, ohne Firestore-Zugriff; nur `roles/run.invoker` auf der **einen** Funktion.
- Region `europe-west3` (Frankfurt), Node 22, 256 MiB, 60 s, `maxInstances=1`, `concurrency=1`.
- Cloud Scheduler in `europe-west3`, ein HTTP-POST pro Minute, OIDC-Audience = exakte URL, null Wiederholungsversuche, niemals unauthentifiziert. Worker ohne zusätzliche TV-/TMDB-Abfragen, bestehender Firestore-Transaktionspfad und Deduplizierung bleiben unverändert.

## Release-Gates in `.github/workflows/tv-final-infrastructure.yml`

1. **`preflight`** (lesen): unverändert, um bestehende APIs/Billing/Runtime-IAM zu kontrollieren. Der vorliegende Nutzer-Preflight hatte 11/11 grüne Checks. Das war **kein** Live-Deployment-Test.
2. **`prepare`** (manuell, nur `main`, exakte Phrase `PREPARE_MOVIEHUB_TV_FINAL_PRIVATE`, Environment `production-tv-final-reminders` mit Nutzerfreigabe): Tests/Build, Firestore-Index bereitstellen + `READY` abwarten, danach **nur private HTTP-Function** per `gcloud functions deploy --gen2 --build-service-account`; kontrolliert anschließend Runtime-/Build-SA und URL. **Kein Scheduler-Job**, kein periodischer Lauf.
3. **`activate`** (erneut separate manuelle Nutzerfreigabe, Phrase `ENABLE_MOVIEHUB_TV_FINAL_1MIN`): Existenzen & Identitäten erneut verifizieren; keine bestehende Scheduler-Job-Übernahme; `roles/run.invoker` **nur** für das dedizierte Scheduler-SA am Cloud-Run-Service; öffentliche IAM-Principals explizit verbieten; **erst dann** einen OIDC-authentifizierten, minutengenauen Scheduler-Job erzeugen. Beim Fehler vor dem letzten Schritt bleibt die Function privat/dormant.
4. Prüfung der tatsächlichen `considered/finalCreated/skipped/failed`-Logs und echter Film-/Serien-End-to-End-Tests auf Smartphone/Fire TV. Nur dann #382 abnehmen.

Der normale `deploy-firebase.yml`-Nachtlauf bleibt auf `hosting,firestore:rules` begrenzt. **Niemals** `firebase deploy --only functions` oder die alte `onSchedule`-Variante für diese Function starten.

## Noch manuell aufzubauende und zu verifizierende Voraussetzungen

- `movie-hub-tv-build`: Google-Cloud-Build-Berechtigungen gemäß der offiziellen Cloud-Functions-Dokumentation; mindestens Log Writer, Artifact Registry Writer auf erforderlichem Repo und Storage Object Viewer auf erforderlichem Quell-Bucket. Bestands-Registry `gcf-artifacts` und Build-Quell-Buckets liegen bisher **nur in europe-west1**, die neue Funktion ist die erste in europe-west3. Daher west3-Buildspeicher gezielt anlegen/verifizieren, **keine pauschalen Rechte am Nachtlauf-Bucket** `movie-hub-62459-nightly-checkpoints`.
- GitHub-Deployer: `roles/iam.serviceAccountUser` **direkt** auf dem neuen Build-SA und dem vorhandenen Runtime-SA; `roles/cloudfunctions.developer`, `roles/datastore.indexAdmin`, `roles/cloudscheduler.admin` bereits vom Nutzer bestätigt. Um `gcloud run services add-iam-policy-binding` nutzen zu können, engste Custom-Rolle mit `run.services.getIamPolicy`/`run.services.setIamPolicy` bereitstellen; **kein** projektweiter Cloud-Run-Admin auf Verdacht.
- `movie-hub-tv-scheduler` erst anlegen, `roles/iam.serviceAccountUser` für den Deployer **nur auf diesem SA** vergeben, und `roles/run.invoker` nur für den betroffenen Cloud-Run-Dienst während `activate` eintragen; Google Cloud Scheduler-Service-Agent muss existieren und funktionieren.
- Firestore Composite-Index-Bestand vorab leer, Field-Overrides laut Nutzer-Screenshot nur Standardkonfiguration `*`; Indexdatei enthält den neuen `notifications`-Composite.
- GitHub Environment: Required Reviewer `matthias-ennen`, Selbstfreigabe erlaubt, Admin-Bypass aus, ausschließlich `main`.
- IAM-Änderungen, mögliche Cloud-Kosten und jeder produktive Job benötigen gesonderte Nutzerfreigabe.

## Risiken, Rollback und Monitoring

- **Kein Scheduler bei fehlgeschlagenem `prepare`**; Funktion bleibt privat und ohne regelmäßigen Trigger. Index darf bei Fehler erhalten bleiben.
- **Bei Fehlern nach `activate`:** Scheduler-Job `movie-hub-tv-final-1min` unverzüglich **pausieren** (`gcloud scheduler jobs pause ...`). Bestätigte Meldungen und Watch-Abschlüsse nicht löschen oder ungeprüft rücksetzen.
- `activate` bricht ab, wenn der geplante Job oder der alte Firebase-Scheduler-Job bereits existiert; keine versteckte Doppelaktivierung. Frühere Bereitstellungen können nach vorheriger Prüfung gezielt korrigiert werden.
- Den HTTP-Endpunkt weder öffentlich freigeben noch über einen ungeprüften Browser-Request testen; Cloud Run IAM ist die Zugangsschranke, HTTP-Methode POST eine zusätzliche Verteidigung.

Quellen: https://docs.cloud.google.com/sdk/gcloud/reference/functions/deploy ; https://docs.cloud.google.com/run/docs/authenticating/service-to-service ; https://docs.cloud.google.com/run/docs/triggering/using-scheduler ; https://firebase.google.com/docs/functions/schedule-functions .

**Status:** Review-/Testvorschlag. Keine produktive Bereitstellung, keine Abnahme.
