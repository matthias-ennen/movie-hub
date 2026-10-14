# #384 – Profilbezogene E-Mail-Mitteilungen

Stand: 14.10.2026 · Oberfläche und Regeln mit `a790327` veröffentlicht;
Vorbereitung des provisorischen Versands, Mail-Infrastruktur noch nicht aktiv.

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
