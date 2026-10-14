# #384 – Profilbezogene E-Mail-Mitteilungen

Stand: 14.10.2026 · Umsetzung auf isoliertem Branch, noch nicht veröffentlicht.

## Auftrag und Grenzen

Matthias hat die Vorbereitung während der Registrierung von
`moviehubgermany.de` bei netcup beauftragt. Resend-Konto vorhanden; Domain,
DNS und Versandzugang noch nicht eingerichtet. Keine echten E-Mails senden,
keine Cloud-Ressourcen ändern, kein produktiver Versand in dieser Stufe.

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

Die versuchte Browser-Sichtprüfung ist in dieser Umgebung blockiert: Der
offizielle Browserdownload liefert kein gültiges Archiv; ein separat verfügbarer
Chromium-Runtime scheitert beim Grafikstart. Daher **keine** bestandene Sichtprüfung,
Vier-Größen-Prüfung oder Smartphone-/Fire-TV-Abnahme behaupten. Reale React-
Formularausgabe (Vorbelegung, Unterprofil, Fokusattribute, Lade-/Bestätigungsstatus)
ist automatisiert geprüft; die visuelle/physische Abnahme bleibt offen.

Kein produktives Deployment, keine DNS-/IAM-/Secret-Änderung und kein echter
Mailversand. #384 bleibt bis zur vollständigen Abnahme offen.
