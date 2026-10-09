# MovieHub #382 – TV-Minuten-Scheduler: Betriebs-/Freigabeplan

**Status 09.10.2026:** Quellcode und Aktivierungsworkflow vorbereitet. **Keine
Cloud-Funktion und kein Cloud-Scheduler-Job dadurch produktiv aktiviert.**
Die vorherige Zustimmung des Nutzers gilt der Einrichtung. Das Live-Gate
muss nach Integration, Tests und bewusster Produktionsentscheidung gesondert
durchlaufen werden.

## Architektur

- Firebase **Cloud Functions 2nd gen**, Node.js 22, `europe-west3` (Frankfurt).
- Separater Firebase-Codebase `tv-final-reminders`, Runtime-Dienstkonto
  `movie-hub-tv-final@movie-hub-62459.iam.gserviceaccount.com`.
- Geplante Frequenz **jede Minute** (`* * * * *`, UTC), begrenzt auf
  eine Instanz und eine parallele Ausführung, Timeout 60 Sekunden.
- Der geprüfte Prozess `runTvFinalReminderCheck` lädt ausschließlich
  aktuelle `tv-found`-Mitteilungen über den vorbereiteten Collection-Group-Index
  (`phase`, `scheduleStatus`, `airingStartAt`). Nur `scheduled`-Ereignisse
  liegen im Zeitfenster; erledigte, stornierte und abgelaufene Einträge
  werden nicht in jedem Minutentakt erneut geladen. Der Dienst ruft
  **keine** TV-/TMDB-API auf.
- Firestore-Transaktion schützt vor älteren Aktivierungen, Doppelaufrufen,
  abgeschalteten Beobachtungen und konkurrierenden Geräten.
- Der normale Nachtlauf veröffentlicht weiterhin ausschließlich
  `hosting,firestore:rules`; er installiert oder startet diese Function
  **nicht**. Keine Änderung an der Android-APK-Architektur.

## Sicherheits- und Datenschutzvertrag

Die Funktion läuft **nicht** mit dem Deploy-Dienstkonto. Ihr eigenes
Runtime-Dienstkonto darf nur die notwendigen Firestore-Vorgänge ausführen;
der Admin-SDK-Pfad umgeht die Client-Firestore-Rules. Darum sind geprüfter
Servercode und eine schmale IAM-Rolle wichtig.

Für den Projektadministrator (einmalige Infrastruktur-Vorbereitung,
**nicht automatisch von PR oder Nachtlauf ausgeführt**):

```sh
PROJECT=movie-hub-62459
gcloud services enable --project="$PROJECT" \
  cloudfunctions.googleapis.com cloudscheduler.googleapis.com \
  run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com eventarc.googleapis.com

gcloud iam service-accounts create movie-hub-tv-final \
  --project="$PROJECT" --display-name="MovieHub TV final reminders runtime"

gcloud iam roles create MovieHubTvFinalRuntime \
  --project="$PROJECT" --title="MovieHub TV final reminder Firestore" \
  --stage=GA --permissions="datastore.databases.get,datastore.entities.get,datastore.entities.list,datastore.entities.create,datastore.entities.update"

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:movie-hub-tv-final@$PROJECT.iam.gserviceaccount.com" \
  --role="projects/$PROJECT/roles/MovieHubTvFinalRuntime"

gcloud iam service-accounts add-iam-policy-binding \
  "movie-hub-tv-final@$PROJECT.iam.gserviceaccount.com" \
  --project="$PROJECT" \
  --member="serviceAccount:github-movie-hub-deploy@$PROJECT.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

Wenn SA oder Custom Role bereits existieren, **nicht blind noch einmal
erstellen**: vorhandene Berechtigungen und Rollen zuerst kontrollieren.
Die Berechtigungen des GitHub-Deploy-Kontos zum **Deploy von Functions,
Cloud Scheduler, Run und Indexes** müssen gesondert geprüft und ggf. von
einem autorisierten GCP-Administrator minimal ergänzt werden; **keine
projektweite Owner-/Editor-Rolle vergeben**. Die von Firebase verwalteten
Scheduler-Invoker-Berechtigungen nur gemäß Firebase-Betriebsvorgaben
anlegen und nicht öffentlich freigeben.

## Technische Prüfung

1. PR #405 – 14-Tage-Erstfund und Client/Server-Terminbindung – CI und
   Android erfolgreich, danach auf `main` integrieren.
2. PR #406 – Funktion, enger Zeitprüfer, IAM-/Cloud-Plan – CI,
   Firestore-Regeltests, Android sowie **Funktionspaket-Importtest** bestehen.
3. Regressionstests mit verschobenem/abgesagtem Sendetermin,
   mehrfachem Lauf, Scheduler-Verzögerung, abgeschlossenem TV-Termin,
   deaktiviertem und reaktiviertem Watch. Zusätzlich echter
   E2E-Test auf einem eigenen Termin, kein künstlicher Massentest am
   echten Nutzerprofil.
4. `firestore.indexes.json` enthält Composite-Collection-Group-Index.
   Die Bereitstellung erfolgt getrennt, und der Index muss vor Aktivierung
   `READY` sein.
5. `GitHub → Actions → TV final reminder infrastructure (manual)` mit
   `operation=preflight`: aktiviert **keine** Cloud-Ressourcen.
6. **Erst nach fachlicher Freigabe, funktionierendem Billing/IAM und
   vollständig grünem End-to-End-Gate:** `operation=activate` und
   `confirmation=ENABLE_MOVIEHUB_TV_FINAL_1MIN` von `main` aus.
   Das geschützte GitHub-Environment
   `production-tv-final-reminders` sollte vorab mit Required Reviewers
   konfiguriert werden.
7. Der Workflow veröffentlicht zuerst den Datenbankindex und wartet bis
   `READY`, dann und nur dann die isolierte Function. Erst die Function-
   Veröffentlichung legt den **laufenden** Scheduler-Job an.
8. In Cloud Logging je Durchlauf `considered/finalCreated/skipped/failed`
   prüfen, dann echte End-to-End-Abnahme auf Smartphone und Fire TV.

## Rollback

Bei fehlerhaften Erinnerungen zuerst den Scheduler-Job in Google Cloud
**pausieren**, damit keine neuen TV-Endmeldungen entstehen. Anschließend
den auslösenden Code korrigieren und vor dem Wiederanlauf prüfen, welche
Meldungen bereits atomar als erledigt markiert wurden. Automatische
Korrektur oder Löschen persönlicher Meldungen nur nach gesonderter Prüfung.
Firebase Scheduled Functions werden normalerweise vom Firebase CLI
verwaltet; Job-Konfiguration nicht dauerhaft außerhalb dieser Verwaltung
ändern. <https://firebase.google.com/docs/functions/schedule-functions>

## Kosten und Betrieb

Firebase Scheduled Functions verknüpfen einen Cloud-Scheduler-Job mit
einer Cloud Function. Google bietet ein Freikontingent für Scheduler-Jobs,
aber Funktionen, Firestore-Abfragen, Speicher und Logs können ebenfalls
verbrauchsabhängig berechnet werden. Eine Erhöhung der Häufigkeit ist nicht
vorgesehen. Nach dem Livegang den Billing-Status (Nachtlauf hatte
`delinquent` gemeldet) und Cloud-Logs prüfen; eine reine Quellcodeänderung
ist noch **keine** erfolgreiche Cloud-Einrichtung.

## Noch offen vor Livegang

- Veränderte/abgesagte Sendetermine sind technisch abgeglichen: bei
  vollständigen EPG-Quellen nur ein korrigierter Ersttermin, ohne doppelte
  Meldung oder Lesestatusverlust; keine Stornierung bei Teilquellen.
- Ausfall-/Retry-Verhalten ist implementiert: im laufenden Programm bis
  maximal sechs Stunden nach Sendebeginn mit korrektem „läuft jetzt“-Text
  nachholen. Nach Sendeende kein künstliches „verpasst“-Ereignis, sondern
  den Ersttermin als abgelaufen markieren und auf einen neu bestätigten
  Folgetermin warten. Reale Ausfall-/Zeitgrenzentests bleiben Pflicht.
- Echte Produktions-E2E mit einer passenden Ausstrahlung und
  Datumswechsel prüfen.
- Issue #381 inklusive globaler Admin-Mitteilungen und PR #404 nicht
  ohne Nutzer-Abnahme schließen.
