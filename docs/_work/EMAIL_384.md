# #384 – Profilbezogene E-Mail-Mitteilungen

## Fortsetzung 15.10.2026 – Versanddomain verifiziert, produktive Umstellung beauftragt

- Matthias bestätigt echten Empfang beider TV-Mail-Phasen (`tv-found` und
  `tv-final`). Individuelle Minutengenauigkeit wurde nicht vermessen.
- netcup DNS-Änderungen veröffentlicht; Resend `mail.moviehubgermany.de`
  in Ireland `Verified`, beide SPF-CNAMEs und DKIM jeweils `Verified`.
  Ein zusätzlicher DMARC-TXT-Eintrag mit `v=DMARC1; p=none;` liegt bei netcup.
- Matthias hat einen neuen domainbeschränkten Resend-Sending-Key und
  **Version 2** im bestehenden Secret `RESEND_API_KEY` bestätigt.
  Cloud-Version/-Secret-Inhalte noch nicht unabhängig geprüft.
- **Neuer ausdrücklicher Auftrag:** das provisorische Testempfänger-Limit
  vollständig entfernen und alle vier aktiven Funktionen auf
  `MovieHub <mitteilungen@mail.moviehubgermany.de>` und die
  verifizierte Domain umstellen. Nur per Opt-in und bestätigter Adresse
  versenden; nicht rückwirkend. #384 bleibt offen.
- Dafür entsteht ein eigener geprüfter PR mit
  `scripts/promote-profile-email-domain.mjs` und Tests. Dieser
  **ändert die Cloud nicht beim Merge**. Benutzer führt den geprüften
  Cloud-Shell-Lauf danach aus und bestätigt Ausgabe/Empfang.
  **Keinesfalls** vorherige Testaktivierung, ausgeschaltetes Prepare
  oder `--refresh-events` erneut ausführen. Einzelheiten:
  [EMAIL_DEPLOYMENT.md](../EMAIL_DEPLOYMENT.md).

Die nachfolgenden Inhalte sind der archivierte Tagesabschluss vom 14.10.
und deshalb kein neuer Auftrag, die bereits erledigte Domainregistrierung
oder DNS-Einrichtung zu wiederholen.

---

Stand des historischen Abschlusses: **14.10.2026, 19:22 Uhr (Europe/Berlin)**.

Matthias setzt hier einen Schlusspunkt für heute. Die dokumentierte Arbeitsphase
ist beendet; **#384 bleibt als aktuelles Arbeitspaket offen**. Der erste echte
TV-Mail-Empfang ist bestätigt, die vollständige Fachabnahme noch nicht.
Heute keine weitere Domain-/Cloud-Umstellung und kein neues Arbeitspaket starten.
Der laufende begrenzte Testversand samt Minutenjobs bleibt aktiv.

## Einstieg im nächsten Chat

1. Human AI Protocol als Arbeitsrahmen berücksichtigen. Dieses Dokument und
   [Issue #384 samt neuen Rückmeldungen](https://github.com/matthias-ennen/movie-hub/issues/384)
   lesen; den aktuellen Repo-/Cloud-Stand vor einer Änderung abgleichen.
2. Zuerst Matthias fragen, ob die erwartete **zweite TV-Mail** angekommen ist.
   Sie ist etwa fünf Minuten vor Sendebeginn vorgesehen; Minutenlauf und
   Zustellung können verzögern. Titel und genaue Startzeit wurden nicht genannt.
   Empfang niemals aus vergangener Uhrzeit oder aus der ersten Mail ableiten.
3. Mit der **eigenen Versanddomain** fortsetzen: Resend → Domains → Add Domain.
   Zuletzt vorgeschlagen ist `mail.moviehubgermany.de` als Versand-Subdomain,
   europäische Region. Das ist ein Vorschlag, noch keine bestätigte Einrichtung.
   Zuerst einen eventuell inzwischen angelegten Domain-Eintrag ansehen.
4. Die tatsächlich von Resend angezeigten DNS-Einträge bei netcup zuordnen,
   setzen und rückprüfen. Kein erfundener DKIM-Wert und keine Übernahme alter
   Beispielwerte: je nach Resend-Konfiguration sind TXT/MX oder CNAME möglich.
   Bestehende Einträge erhalten; SPF/DKIM und anschließend DMARC prüfen.
5. Nach erfolgreicher Domainprüfung den passenden dauerhaften Absender und
   einen auf die Domain begrenzten Sending-Schlüssel festlegen. Die kontrollierte
   Umstellung der bestehenden Funktionen vorbereiten, prüfen und durchführen;
   kein erneutes Infrastruktur-Bootstrap. Schlüssel nur im Secret Manager.
   Die bisherige Empfängerbegrenzung erst im abgestimmten Test erweitern.
6. Die noch offenen Fachtests unten abschließen, danach Matthias' ausdrückliche
   Abnahme einholen. Erst dann #384 schließen und #385 einzeln priorisieren.

## Bestätigter Stand und Grenzen

| Bestandteil | Nachweis / aktueller Status |
| --- | --- |
| Profiloberfläche | Hauptprofil mit Konto-Adresse vorbelegt, Unterprofile zunächst leer; eigene Adresse und optionaler Schalter, getrennt von der Anmeldung. Veröffentlicht. |
| Mail-Infrastruktur | Vier Gen2-Funktionen, dedizierte Konten/Rechte, zwei numerisch referenzierte Secrets, READY-Queue-Index und privater Retry-Minutenjob eingerichtet. |
| CloudEvent-Korrektur | PR #453 auf Main `aa599a788d27201d2894bc1bfb03177e7ce1f20b`; Preferences/Notification durch Besitzer am 14.10. um 18:57 aktualisiert und rückgeprüft (`1000062582.jpg`). |
| Adressbestätigung | App zeigt um 19:09 „E-Mail-Adresse bestätigt“ (`1000062591.jpg`). Bei gleicher bereits verifizierter Konto-Adresse ist keine zusätzliche Bestätigungsmail erforderlich. Konkrete Nachweisquelle wurde nicht aus Cloud-Daten gelesen. |
| Erster echter Empfang | Matthias bestätigt um 19:14 nach einer neuen TV-Mitteilung eine zugehörige E-Mail. Inhalt und Gestaltung gefallen ihm. Als bestätigten Einzelfall dokumentiert, keine Gesamtfreigabe. |
| Weitere TV-Mail | Noch keine Rückmeldung. Erwartet etwa fünf Minuten vor dem Sendebeginn; kein automatischer Nachweis und keine eingerichtete ChatGPT-Erinnerung. |
| Domain | Netcup-Mail vom 14.10., 14:30 Uhr bestätigt Registrierung von `moviehubgermany.de`; CCP-Einstellungen verfügbar. Weltweite DNS-Verbreitung kann laut Mail bis zu 48 Stunden benötigen. |
| Resend / DNS | Hinzufügen, DNS-Einträge und Verifikation der eigenen Domain sind noch nicht nachgewiesen. Kein dauerhafter Absender umgestellt. |

Der Testsender ist weiterhin `MovieHub <onboarding@resend.dev>`, begrenzt auf die
bereits privat freigegebene Resend-Kontoadresse. Adresse, Fingerprint, Tokens und
Schlüssel nicht in öffentliche Dokumentation übernehmen. Bestehende Startzeit,
numerische Secret-Versionen und Empfängerbegrenzung bei Wartung erhalten.
Alte Mitteilungen werden nach Opt-in/Bestätigung nicht nachgesendet. Jede neue
Mail beruht auf dem bestehenden persönlichen Mitteilungsereignis.

## Offene Abnahme

- Echte `tv-final`-Mail zur laufenden Beobachtung (etwa fünf Minuten vorher).
- Echte `included-found`-Mail; `tv-found` ist durch den ersten Empfang belegt.
- Unterprofil und andere eigene Testadresse nach Domainfreigabe: Profiltrennung,
  Bestätigung per Link, passende Empfänger, Adresswechsel und Ausschalten.
- Abmeldelink bewusst betätigen und danach ausbleibenden weiteren Versand prüfen;
  diesen Test erst nach der noch erwarteten TV-Mail durchführen.
- App-Link, Smartphone-/Fire-TV-Bedienung und Mehrgeräteverhalten im Mailumfang.
  Die bereits abgenommene Mitteilungs-Grundstrecke nicht erneut öffnen.
- Deduplizierung/Fehler/Wiederholungen sind automatisiert geprüft. Ein echter
  Providerfehler mit erfolgreicher Wiederholung ist nicht beobachtet; vor der
  Gesamtfreigabe technische Nachweise und verbleibenden Live-Testbedarf benennen.

## Betrieb und geprüfte Quellen

- Projekt `movie-hub-62459`, Nummer `612913221205`, Region `europe-west3`.
- `profileEmailPreferences` und `profileEmailNotification`: private Firestore-
  Ereignisse. `profileEmailRetry`: privater POST, Job `movie-hub-email-retry-1min`.
  `profileEmailAction`: öffentliche tokengebundene Bestätigungs-/Abmeldeseite;
  bloßes Öffnen eines Links ändert nichts.
- Runtime `movie-hub-email`, Builder `movie-hub-email-build`, Eventkonto
  `movie-hub-email-events`, Retrykonto `movie-hub-email-scheduler`, jeweils im
  Projekt. Keine pauschalen Owner-/Editor-Rechte erforderlich.
- Secrets `RESEND_API_KEY` und `MOVIE_HUB_EMAIL_TOKEN_KEY`; keine Schlüsselwerte
  auslesen oder neu erzeugen, nur weil ein neuer Chat beginnt.
- Behobener Fehler: Ohne Framework-Registrierung wurde ein Firestore-Ereignis
  als HTTP-Aufruf behandelt; UID fehlte und `auth/invalid-uid` entstand. PR #453
  registriert die Signaturen und prüft den Dokumentbezug vor dem Servicezugriff.
- Der spätere Vorprüfungsabbruch um 18:19 lag an keiner aktiven gcloud-Kontoauswahl.
  Er ist durch den erfolgreichen Lauf um 18:57 überholt; keine offene IAM-Störung.
- [CI #1413](https://github.com/matthias-ennen/movie-hub/actions/runs/38579598191)
  und [Android #1338](https://github.com/matthias-ennen/movie-hub/actions/runs/38579597765)
  auf dem getesteten PR-Head `b14c3462ba1309630ab13a7c7f77ea2e231ef26d` erfolgreich.
  1.130 App-Tests, sechs echte lokale HTTP-Eingangsprüfungen, 35 Rules-Tests,
  Infrastruktur-Simulationen und Browserprüfung. Merge-Tree
  `d277c84984ee82c81a66906ccd232c15421ec5a9` geprüft.
- Mail-Abhängigkeiten: keine hohen/kritischen Auditfunde im geprüften Gate;
  drei moderate transitive Meldungen waren dokumentiert. Keine Null-Funde behaupten.
- `--verify-active` prüft Metadaten und die zustandslose GET-Aktionsseite, keinen
  echten Empfang. `--refresh-events` ist bereits erledigt und kein nächster
  Pflichtschritt. Den ausgeschalteten Prepare-Workflow nicht auf die aktive
  Installation anwenden. Ein normaler Hosting-Deploy aktualisiert keine Mailfunktion.
- Fortsetzung: [Mailvertrag](../EMAIL_NOTIFICATIONS.md),
  [Deploymentverlauf](../EMAIL_DEPLOYMENT.md),
  [archivierter Issue-Verlauf](EMAIL_384_ISSUE_HISTORY_2026-10-14.md).

## Historischer Verlauf vor dem Tagesabschluss

Die nachfolgenden Abschnitte bewahren die damaligen Zwischenstände. Aussagen
wie „Versand aus“ oder „noch nicht eingerichtet“ gelten für ihren damaligen
Zeitpunkt; maßgeblich für die Fortsetzung sind die Abschnitte oben.

## Auftrag und Grenzen

Matthias hat die Vorbereitung während der Registrierung von
`moviehubgermany.de` bei netcup beauftragt. Resend-Konto vorhanden; Domain,
DNS und Versandzugang noch nicht eingerichtet. In der ersten Stufe wurde der
Entwurf isoliert vorbereitet. Mit dem anschließenden „Weiter“ wird jetzt die
prüfbare Oberfläche samt Besitzerregeln über den bestehenden Hosting-Deploy
bereitgestellt. Keine echten E-Mails, keine neuen Mail-Functions und keine
DNS-/IAM-/Secret-Änderungen in dieser Stufe.

Unter Profile & Konto folgt auf den Profilnamen die editierbare E-Mail-Adresse
und „Mitteilungen auch per E-Mail erhalten“. Hauptprofil initial mit
Konto-Adresse, Unterprofile leer. Explizit leere/geänderte Werte erhalten.
Anmeldung unverändert. Alle drei persönlichen Phasen aus den bestehenden
Beobachtungen nutzen einen gemeinsamen optionalen Kanal.

## Kontrollierte Umsetzung

1. Gemeinsamer Profilkontaktvertrag, transaktionales Speichern und gezielter
   Echtzeitstatus ausschließlich auf der Profilseite. Keine Titel-/Posterabfragen.
2. Besitzer darf nur validierte Wünsche speichern. Bestätigungen, Tokenstatus
   und Versandaufträge ausschließlich serverseitig. Adresse für Versand bewusst
   serverlesbar unter privatem UID-/Profilpfad, Firestore-Verschlüsselung im
   Ruhezustand; keine Wiederverwendung der nur nativ lesbaren Notizverschlüsselung.
3. Getrennte Servermodule für Bestätigung, feste HTML-/Textvorlagen und Resend.
   Transport standardmäßig aus; aktiv nur mit expliziter Konfiguration.
4. Ereignisbezug und neue Opt-ins prüfen; Wiederholungen, Adresswechsel,
   ausgeschaltete Optionen und abgelaufene TV-Ereignisse berücksichtigen.
5. Eigenständige vorbereitete Function-Quelle. Bestehenden privaten
   TV-Minutenprüfer und normalen Hosting-Deploy nicht verändern.
6. Gezielte Tests, Firestore-Regeltests, Build und visuelle Komponentenprüfung;
   anschließend prüfbaren Entwurf auf GitHub sichern.

## Offene Einrichtung nach Domainfreischaltung

Vorheriger begrenzter Test ohne Domain ist inzwischen beauftragt. Matthias hat
die Hauptprofilanzeige bestätigt und die Mailoption aktiviert. Um 10:40 Uhr
bestätigte er die sichere Ablage eines neuen Resend-Schlüssels als
`RESEND_API_KEY`. Nach der um 10:55 Uhr bestätigten Secret-Viewer-Freigabe
erkennt Prüflauf `38537750613`, Versuch 2, technisch eine aktive Version.
Schlüsselgültigkeit und Resend-Versandberechtigung sind damit noch nicht belegt.
Ein eigener ausschließlich lesender Infrastruktur-Prüflauf ermittelt den
tatsächlichen Bestand über den vorhandenen GitHub-Deploy-Zugang. Keine Secrets
auslesen, keine IAM-/Cloud-Änderung und keine Testmail durch diesen Prüflauf.
Testempfänger muss zur Resend-Konto-Adresse passen; bisher nicht festgestellt.

Cloud-Grundlage: Matthias' Screenshot um 11:34 Uhr bestätigt den erfolgreichen
Lauf von `setup-profile-email-cloud.py`: vier Mailkonten, Rollen und beide
Secret-Metadaten rückgeprüft, Versand weiterhin aus. Die unabhängige
GitHub-Prüfung scheiterte danach an `null` statt eines `disabled`-Statusobjekts.
Korrigiert: exakte Kontoidentität mitlesen, leere/fehlerhafte Metadaten ohne
Abbruch des gesamten Berichts ausweisen. Vier lokale Regressionstests bestanden.

Nächster vorbereiteter Schritt: `--build-access --apply` desselben Skripts prüft
Projekt, Buildkonto, beide festen Frankfurt-Quell-Buckets und die Docker-Registry,
bevor es ausschließlich drei direkte Builder-Bindungen ergänzt. Keine
Speicheranlage, Secret-Zugriffe, Functions, Indizes oder Zeitplanjobs.
20 lokale Cloud-Simulationstests bestanden. Die unabhängige Cloud-Prüfung
bestätigt inzwischen die Grundlage. Screenshot 11:52 bestätigt beide
Frankfurt-Buckets; im Upload-Namen steht zwischen Projektnummer und Region
ein Punkt. Der vorherige Bindestrich im Setup/Preflight wurde korrigiert.
Die tatsächlichen Bucket-Namen stehen jetzt unabhängig vom Setup-Code in der
Cloud-Test-Fixture. Screenshot 12:00 bestätigt nun **BUILDRECHTE ERFOLGREICH**.
Die drei direkten Speicherrechte sind eingerichtet/rückgeprüft, Versand aus.
Exakte PR-/Laufnachweise in #384.
Umfang und Anleitung: [EMAIL_CLOUD_SETUP.md](../EMAIL_CLOUD_SETUP.md).

Nächster vorbereiteter Schritt: eigener manueller GitHub-Workflow für genau vier
private Mailfunktionen in Frankfurt, dedizierte Build-/Laufzeit-/Eventidentitäten,
numerische Secret-Referenzen und fest ausgeschalteter Versand. Schutz vor
Überschreiben aktivierter Dienste/Bestandszeitpläne sowie Metadaten-/IAM-Rückprüfung
nach jedem Deploy. Retry ist jetzt ein privater POST-Einstieg ohne impliziten
Scheduler. Index, Aufrufrechte, Minutenjob und Testaktivierung folgen danach.
Bedienung und Grenzen: [EMAIL_DEPLOYMENT.md](../EMAIL_DEPLOYMENT.md).

- Domain in Resend verifizieren; DNS-Einträge exakt aus Resend übernehmen.
- Absender festlegen; Vorschlag `MovieHub <mitteilungen@moviehubgermany.de>`.
- API-Schlüssel und Token-Schlüssel ausschließlich im Secret Manager.
- Neue Mail-Functions, IAM, HTTP-Routing und Retry-Job kontrolliert bereitstellen.
- Versandstartzeit festlegen; keine vorher erzeugten Meldungen nachversenden.
- Explizit freigegebener Mailtest; Smartphone/Fire TV und echter Empfang.
- #384 erst nach technischer Prüfung und Matthias' Abnahme schließen.

Offizielle Referenzen: [Firestore-Ereignisse](https://firebase.google.com/docs/functions/firestore-events),
[Resend-Versand](https://resend.com/docs/api-reference/emails/send-email),
[Resend-Idempotenz](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Umgesetzter Entwurf und Nachweise

- Profilformular, Versionsvertrag, gezielte Echtzeitlistener und Besitzerregeln.
- Serverseitige Konto-Adressprüfung, signierte Bestätigungs-/Abmeldelinks und
  handlungslose GET-Seite; echte Änderungen erst nach ausdrücklichem Buttonklick.
- Drei feste HTML-/Textvorlagen, strukturierte Anbieterergänzung an neuen
  Inklusivereignissen, unveränderte bestehende Meldungslogik.
- Dauerhaftes Versandledger mit Transaktionslease, eingefrorenen Wiederholungen,
  Einwilligungs-/Zeitprüfung und Startbudgets. Eigenständige, ausgeschaltete
  Gen2-Codebase einschließlich Lockfile, Vorbereitungsskript und CI-Prüfung.
- Betrieb, Datenvertrag und verbleibende Freischaltung:
  [EMAIL_NOTIFICATIONS.md](../EMAIL_NOTIFICATIONS.md).

Lokal erfolgreich: 1.070 Anwendungstests plus drei zusätzliche Renderprüfungen,
33 Firestore-Emulator-/Regeltests einschließlich echter konkurrierender
Transaktionen, Produktionsbuild, Import der vier isolierten Functions,
keine npm-Audit-Funde in den produktiven Abhängigkeiten der Mail-Codebase.

Die anfängliche Browserblockade wurde mit einem ohne Grafikbeschleunigung
gestarteten Chromium behoben. `npm run test:email:browser` prüft die echten
Profilkomponenten und Speicher-/Listenerlogik mit lokalem Firestore-Emulator,
synthetischen Profilen und blockierten externen Browseranfragen. Die Profilwahl
ist eine Fixture; ein echter Login und physische Geräte werden nicht simuliert.

Bestanden: Haupt-/Unterprofilvorbelegung, getrennte Empfänger und Einwilligungen,
unveränderte Loginadresse, Speichern/Neuladen, bewusst leeres Hauptprofil,
Synchronisierung zweier Ansichten, Erhalt eines Entwurfs bei Revisionskonflikt,
sichtbarer Live-Bestätigungsstatus sowie die echte D-Pad-Navigation. Vier Ansichten
(390, 768, 1280 und 1920 Pixel) und alle vier Mailvorlagen wurden geprüft und die
Screenshots visuell gesichtet. Browserprüfung und synthetische Screenshots sind
auch in CI aufgenommen. Kein Nachweis für echte Mailclients oder native Geräte.

Dabei behoben: verdeckter Status nach dem Speichern, veralteter Snapshot nach
einem erfolgreichen Speichervorgang und übersprungener Mail-Schalter bei D-Pad
nach oben. Danach erneut 1.073 Anwendungstests und Produktionsbuild erfolgreich.

Die Veröffentlichung umfasst Oberfläche und Firestore-Regeln über den vorhandenen
Workflow, ausdrücklich keinen Mail-Function-/Index-Deploy. Exakte Build- und
Deploymentnachweise werden in #384 festgehalten. DNS/IAM/Secrets, echter Mailversand
und Matthias' Smartphone-/Fire-TV-Abnahme bleiben offen; #384 bleibt offen.
# Diagnose nach erstem privaten Mail-Deploy (14.10.2026, 12:30)

Lauf [38549712845](https://github.com/matthias-ennen/movie-hub/actions/runs/38549712845)
auf `93d9cf7`: `profileEmailAction` und `profileEmailRetry` erfolgreich bereitgestellt
und privat/ausgeschaltet rückgeprüft. `profileEmailPreferences` scheitert beim
Cloud-Befehl mit nicht genauer benanntem Berechtigungsfehler; vierte Function nicht
begonnen. Lesende Vorgangs-/Dienstkonto-Diagnose ergänzt; keine spekulative
Rechtevergabe, kein automatischer erneuter Deploy. Konkrete Ursache und nächste
Maßnahme nach dem Diagnosebericht festlegen. Versand bleibt aus, #384 offen.
