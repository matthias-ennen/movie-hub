# Profilbezogene E-Mail-Mitteilungen (#384)

Stand 14.10.2026: Profiloberfläche und Besitzerregeln mit Web-Build `a790327`
veröffentlicht; der Mailkanal bleibt standardmäßig abgeschaltet.
Keine Mail-Function bereitgestellt und keine echte E-Mail versandt.
Die bestehende Hosting-Konfiguration und der TV-Minutenprüfer bleiben unverändert.
Der normale Hosting-Workflow veröffentlicht nur die Oberfläche und Firestore-
Regeln. Der separate Mail-Deploy wird dadurch nicht ausgelöst.

## Bedienung und Daten

Unter **Profile & Konto** steht direkt nach dem Profilnamen die Adresse und
**Mitteilungen auch per E-Mail erhalten**. Hauptprofile erhalten initial die
Anmeldeadresse, Unterprofile ein leeres Feld. Der Versand ist anfangs aus.
Gespeicherte leere/geänderte Adressen bleiben erhalten; die Loginadresse wird
nicht geändert. Speichern nutzt eine Transaktion mit Revisionsprüfung.
Zwei Listener existieren ausschließlich während der geöffneten Profilseite.

| Pfad unter `users/{uid}/profiles/{profileId}` | Inhalt | Zugriff aus der App |
| --- | --- | --- |
| `emailPreferences/current` | `schemaVersion`, `email`, `enabled`, `revision`, `addressVersion`, `updatedAt` | Besitzer liest/speichert validierte Wünsche; kein Löschen |
| `emailVerification/current` | Bestätigungsstatus und Version der Adresse | Besitzer liest; nur Server schreibt |
| `emailDeliveries/{sha256}` | Dauerhafter Auftrag/Versandstatus je Ereignis | Kein Lese-/Schreibzugriff |

Die eigene Konto-Adresse gilt ausschließlich dann als bestätigt, wenn der
Server sie mit der **aktuell verifizierten** Adresse aus Firebase Admin Auth
abgleicht. Sonst wird eine Bestätigung an die eingetragene Adresse versandt.
Ein erneuter Wechsel zur alten Adresse erhält eine neue `addressVersion` und
benötigt eine neue Bestätigung. Dass eine Adresse eingetragen ist, genügt nicht.

Bestätigungslinks gelten 24 Stunden und einmalig. Sie enthalten ein signiertes
Token im URL-Fragment, keine Adresse. Die unabhängige Aktionsseite entfernt
das Fragment sofort aus der Browserhistorie und überträgt das Token erst nach
Buttonklick im POST-Body. Ein GET/Linkscanner bestätigt oder deaktiviert nichts.
Abmeldelinks gelten 90 Tage und nur für die darin gebundene Adresse und
Einstellungsrevision. Nach einer neuen bewussten Einstellung ist ein alter Link
ungültig. Ausschalten ist auch jederzeit auf der Profilseite möglich.

Adressen sind bewusst für den Versandserver lesbar; sie verwenden **nicht**
die ausschließlich auf Android entschlüsselbare Notizverschlüsselung.
Firestore verschlüsselt sie im Ruhezustand. Private Aufträge enthalten während
der Wiederholungsfrist Empfänger und fertige Mail einschließlich Aktionslink,
damit jeder Wiederholungsversuch exakt dieselben Bytes verwendet. Endzustände
entfernen Empfänger, Mailtext, Token und Titel-/Profilnamen aus dem Auftrag.
Nur die nicht öffentlich lesbare Zustandskennung bleibt dauerhaft zur
Deduplizierung. Keine Adressen, Tokens, API-Schlüssel oder Anbieterantworten
in Anwendungslogs schreiben; kein HTTP-Body-Logging aktivieren.

## Ereignisse und Versand

Die bestehenden Mitteilungen bleiben die einzige Ereignisquelle:

| Phase | Mailinhalt | Versandgrenze |
| --- | --- | --- |
| `included-found` | Titel und vorhandene Anbieternamen, sonst allgemeiner Inklusivhinweis | Höchstens 23 Stunden nach Erstellung |
| `tv-found` | Titel, Sender, Datum und Uhrzeit in Europe/Berlin | Vor Beginn der Ausstrahlung |
| `tv-final` | Titel, Sender und Beginn; „Gleich“ oder „Jetzt“ anhand Versandzeit | Bekannte Endezeit, maximal 6 Stunden nach Beginn; ohne Ende maximal 15 Minuten |

Nur V2-Mitteilungen und ihre passende Beobachtung/Aktivierung werden angenommen.
Aktive V1-Beobachtungen bleiben für neue TV-Erstmeldungen kompatibel. Abschluss-
Meldungen müssen mit `completionNotificationId` der erledigten Beobachtung
übereinstimmen. `providerNames` ist eine optionale strukturierte Ergänzung bei
neuen Inklusivmeldungen; bestehende Nachrichtentexte werden nicht ausgewertet
oder ersetzt. HTML maskiert alle Namen/Titel; es gibt immer eine Textfassung.

Die vertrauenswürdige Firestore-**Dokumenterstellzeit** muss nach Versandstart,
letzter Einstellung und Bestätigung liegen. Einschalten, eine Änderung oder
Bestätigung lösen **keinen rückwirkenden Versand** aus. Die Listener für
Mitteilungen prüfen auch Updates, um vorhandene Ereignisabläufe zu unterstützen;
die stabile Ereignis-ID erlaubt trotzdem höchstens einen Auftrag.

Firestore-Transaktionen vergeben eine 60-Sekunden-Lease; bis zu fünf Versuche
verwenden denselben Resend-Idempotenzschlüssel und eingefrorenen Inhalt.
Der gesamte Versuchskorridor bleibt unter Resends 24-Stunden-Aufbewahrung.
Auch nach Ablauf wird ein Endzustand nicht erneut versandt. Bei jedem Versuch
werden Profil, Auth-Konto, Einwilligung, Adresse, Bestätigung und Beobachtung
erneut geprüft. Vorab formulierte „Gleich“-Mails werden nach Sendungsbeginn
nicht wiederholt. Geänderte/abgesagte Ausstrahlungen werden verworfen.
Eine bereits an Resend übergebene Mail kann beim Ausschalten nicht zurückgerufen
werden. `submitted` bedeutet Anbieterannahme, **keinen Zustellnachweis**.
Bounce-/Complaint-Webhooks und ein Zustellmonitor sind spätere Ausbaustufen.

Konservative Startgrenzen (alle Profile gemeinsam): 90 neue Mails pro UTC-Tag,
2.700 pro UTC-Monat, 30 pro Konto/Tag sowie drei Bestätigungsanforderungen pro
Konto/Stunde. Überschrittene Aufträge werden verworfen, nicht später gesammelt
verschickt. Diese bewusst niedrig angesetzten Grenzen müssen vor einem größeren
Nutzerkreis zum gebuchten Resend-Tarif passend geprüft werden. Wiederholungen
zählen nicht erneut gegen diese lokalen Budgets. Technische Resend-Limits
bleiben zusätzlich wirksam. Serverinterne Zähler liegen unter `emailInternal`;
optional TTL auf deren `expiresAt` konfigurieren, niemals auf dem Versandledger.

## Isolierte Funktionen und Freischaltung

Matthias hat die Hauptprofilanzeige bestätigt und die Mailoption aktiviert.
Am 14.10.2026 um 10:40 Uhr hat er das sichere Hinterlegen eines neuen
Resend-Schlüssels unter `RESEND_API_KEY` bestätigt. Nach seiner Secret-Viewer-
Freigabe hat der erneut gestartete Prüflauf eine aktive Version technisch
bestätigt. Schlüsselinhalt und Resend-Berechtigung sind noch nicht geprüft.
Die verbleibenden Servervoraussetzungen werden im Workflow
`Profile email infrastructure preflight` geprüft. Dieser liest ausschließlich
Metadaten, niemals Schlüsselwerte oder persönliche Profildaten. Fehlende oder
nicht lesbare Voraussetzungen ergeben einen fehlgeschlagenen Prüflauf; sie
werden nicht automatisch angelegt. Der bestehende TV-Prüfer wird nicht verändert.

Die einmalige Einrichtung der vier Mailkonten, begrenzten Rollen und des
Token-Schlüssels ist als geprüftes Cloud-Shell-Skript vorbereitet:
[EMAIL_CLOUD_SETUP.md](EMAIL_CLOUD_SETUP.md). Ausführung mit dem Cloud-Konto von
Matthias steht aus; der Code-Merge selbst verändert keine Cloud-Ressource.

Der provisorische Absender ist `MovieHub <onboarding@resend.dev>`; Resend erlaubt
damit nur die mit dem Resend-Konto verbundene Empfängeradresse. Diese muss vor
dem echten Test festgestellt werden. Der abgesonderte Test ersetzt weder die
Domainverifikation noch den späteren Test anderer Profiladressen.

`server/email/` enthält die testbare Logik. `email-functions/` ist eine eigene
Gen2-Codebase mit eigenem Lockfile. `scripts/prepare-email-function.mjs` kopiert
nur die benötigten Quellen. `firebase.email.json` ist ausdrücklich getrennt
vom normalen Hosting-/TV-Deploy. CI lädt diese Module ohne Schlüssel und ohne
Versand; Importieren führt keine Firestore-Abfragen/Netzwerkversände aus.

- `profileEmailPreferences`: Wunschänderung prüfen und ggf. Bestätigung erzeugen.
- `profileEmailNotification`: vorhandenes Mitteilungsereignis prüfen/versenden.
- `profileEmailRetry`: minütlich höchstens 40 fällige Aufträge verarbeiten.
- `profileEmailAction`: öffentliche, tokengebundene Bestätigungs-/Abmeldeseite.

Vor einem **separat freigegebenen** produktiven Start:

1. `moviehubgermany.de` bei netcup abwarten; Domain in Resend hinzufügen und nur
   die dort tatsächlich angezeigten DNS-Einträge übernehmen. Vorschlag für den
   sichtbaren Absender: `MovieHub <mitteilungen@moviehubgermany.de>`.
2. Dedizierte Laufzeitidentität einrichten. Benötigt Firestore-Lesen/Abfragen/
   Erstellen/Ändern, Firebase-Auth-Benutzerlesen sowie Zugriff ausschließlich auf
   die beiden Mail-Secrets. Keine IAM-Änderungsrechte oder Firestore-Delete-
   Rechte erteilen. Vorhandene TV-Identität unverändert lassen. Exakte Rolle,
   Eventarc-/Scheduler-Aufrufidentitäten und Region vor Deployment prüfen.
3. `RESEND_API_KEY` als auf diese Domain begrenzten **Sending access**-Schlüssel
   und zufälligen `MOVIE_HUB_EMAIL_TOKEN_KEY` (mindestens 32 Zeichen) ausschließlich
   in Secret Manager hinterlegen. Niemals `VITE_`-Variablen/Repository/Chat verwenden.
   Bei späterer Token-Schlüsselrotation offene Aufträge vorher abarbeiten oder
   verwerfen, da bestehende Links dadurch ungültig werden.
4. Nicht geheime Werte aus `email-functions/.env.example` setzen, zunächst
   `MOVIE_HUB_EMAIL_ENABLED=false`. Firestore-Region und `MOVIE_HUB_EMAIL_REGION`
   abgleichen. Dedizierte `MOVIE_HUB_EMAIL_SERVICE_ACCOUNT` setzen. `APP_URL` ist
   die vorhandene App; `ACTION_URL` ist die HTTPS-URL von `profileEmailAction`.
   Eine neue App-Domain oder Hosting-Rewrite ist dafür nicht erforderlich.
5. Bereitgestellte Besitzerregeln prüfen und den Collection-Group-Index
   `emailDeliveries.queueAt` aus `firestore.indexes.json` separat bereitstellen.
   Dann ausschließlich die neue Codebase
   über `firebase deploy --config firebase.email.json --only functions:profile-email`
   bereitstellen. Nicht pauschal alle Functions aus der Standardkonfiguration
   deployen. Kein solcher Befehl wurde in diesem Arbeitspaket ausgeführt.
6. Cloud-Funktions-/Scheduler-/Firestore-Kosten und begrenzte Laufzeitrollen
   prüfen, Aktions-URL einsetzen. Eindeutige UTC-Startzeit als
   `MOVIE_HUB_EMAIL_LIVE_AFTER` setzen, Versand erst für den vereinbarten Test
   einschalten. Ohne vollständige Konfiguration bleiben alle Versände gesperrt.
7. Bereits vorbereitete Empfängereinstellungen einmal erneut speichern, damit
   der nachträglich eingerichtete Server die Bestätigung anstößt. Keine globale
   Altbestandsmigration und kein Nachversand alter Ereignisse.
8. Mit ausdrücklich freigegebenem Empfänger Bestätigung, alle drei Phasen,
   Opt-out und Fehler/Wiederholung real prüfen. Danach Smartphone-/Fire-TV-
   Bedienung und Zwei-Geräte-Abnahme mit Matthias. #384 bis dahin offen lassen.

Notabschaltung: `MOVIE_HUB_EMAIL_ENABLED=false` für die Mail-Codebase ausrollen;
bei Bedarf deren neue Trigger/Retry-Job stoppen. Bestehende In-App-Mitteilungen
und der TV-Prüfer bleiben fachlich unabhängig. Während längerer Abschaltung
abgelaufene private Auftragsdaten kontrolliert bereinigen; Deduplizierungs-
Endzustände erhalten. Keine vorhandenen Rollen/Scheduler anderer Funktionen ändern.

## Reproduzierbare Oberflächenprüfung

`npm run test:email:browser` startet einen lokalen Firestore-Emulator mit dem
Demo-Projekt `demo-moviehub-email-ui` und prüft echte Profilkomponenten mit
synthetischen Konten. Voraussetzung: Java 21 und ein mit
`npx playwright install chromium` installiertes Chromium. CI installiert den
Browser einschließlich Systemabhängigkeiten. Der Test blockiert alle externen
Browseranfragen und erzeugt keine E-Mails.

Geprüft werden getrennte Profile, Defaults, Speichern/Neuladen, zwei gleichzeitige
Ansichten, Revisionskonflikte, Live-Bestätigungsstatus und D-Pad-Fokus. Vier
Bildschirmgrößen sowie alle vier Mailvorlagen erzeugen Screenshots und einen
Prüfbericht unter `artifacts/profile-email-browser/`; CI bewahrt sie sieben Tage
auf. Echte Smartphone-/Fire-TV-Bedienung und Empfang in Mailprogrammen benötigen
weiterhin die gesonderte Abnahme. Die Profilwahl im Browser verwendet Testdaten.

## Technische Referenzen

- [Firestore-Trigger und Wiederholungen](https://firebase.google.com/docs/functions/firestore-events)
- [Secrets und Konfiguration](https://firebase.google.com/docs/functions/config-env)
- [Geplante Funktionen](https://firebase.google.com/docs/functions/schedule-functions)
- [Resend-Versand](https://resend.com/docs/api-reference/emails/send-email)
- [Resend-Idempotenz](https://resend.com/docs/dashboard/emails/idempotency-keys)
