# Titelbezogene Mitteilungen – Stand 12.10.2026

## Produktiv- und Abnahmestand

#380 (Server/IAM) ist abgeschlossen. #381 einschließlich Kontotrennung aus
PR #404 und beide TV-Phasen #382 sind produktiv. Der private Minutenprüfer wurde
am 10.10.2026 aktiviert; der letzte belegte Cloud-Lognachweis stammt von diesem
Tag. Smartphone-/Fire-TV-Bedienung, persönlicher Profilwechsel und
geräteübergreifender Lesestatus sind in #381 bestätigt. #382 ist am 12.10.2026
nach ausdrücklicher Nutzerabnahme geschlossen: Film-/Serien-Erinnerungskette,
frühe Fundmeldung mit Termin/Sender, Titelöffnung, Deduplizierung und Erinnerung
bei geschlossener App; Zeitverhalten und automatischer Abschluss sind ebenfalls
bestätigt. Globale Admin-/Kontowechsel-Restabnahme und Gesamtfreigabe von #381
sowie fachliche #118-/#312-Restpunkte bleiben offen. #383 ergänzt die zentrale
Verwaltung unter Einstellungen → Mitteilungen; die manuelle Geräteabnahme ist offen.

## Bedienung

Film-/Seriendetails → Meine Einstellungen → Benachrichtigen: „Wenn inklusive“ und
„Wenn im TV“ sind getrennte, profilbezogene Schalter. Die Glocke vereint diese
persönlichen Meldungen mit den globalen Admin-Mitteilungen. Beim Öffnen eines
persönlichen Treffers wird er gelesen und führt zur Titel-Detailansicht.
Es gibt weder Betriebssystem-Push noch E-Mail oder ein Startfenster für diese
beiden Anlässe.

## #383 – Aktive Beobachtungen in den Einstellungen

Der Bereich **Mitteilungen** steht direkt am Anfang der vorhandenen
Einstellungsseite. Er übernimmt deren Profilkennzeichnung, Panels, Zeilen und
Ein/Aus-Schalter. Jede aktive Beobachtung zeigt Titel, Film/Serie, Anlass und
bei TV den gespeicherten Termin mit Sender (Europe/Berlin). Ohne Termin steht
sie wartend in der Liste; erledigte Beobachtungen werden nicht angezeigt.
Ein leerer Bereich erklärt den Einstieg über „Benachrichtigen“ am Titel.

**Daten und Performance:** Detailseite und Verwaltung verwenden denselben
konten-/profilgebundenen Watch-Listener. Die Abfrage lädt aktive V2- sowie
Legacy-V1-Beobachtungen statt abgeschlossener V2-Historie. Nur während die
Einstellungen geöffnet sind werden zusätzlich die deterministischen
`-initial`-Nachrichten der aktiven TV-Aktivierungen in Gruppen von höchstens
30 Dokument-IDs beobachtet. Damit erscheinen auch Client-Soforttreffer und
serverseitige Terminänderungen. Keine neuen TV-/TMDB-Abfragen, keine neue
Collection, keine zusätzlichen Firestore-Regeln oder Indizes.

**Ausschalten:** Eine Transaktion prüft die angezeigte Aktivierungs-ID und
beendet nur diesen noch aktiven Auftrag. Bereits abgeschlossene/entfernte
Aufträge bleiben unverändert, zwischenzeitliche Neuaktivierungen werden nicht
gelöscht. Ein Profil-/Kontowechsel oder das Verlassen der Verwaltung verhindert
ausstehende Schreibentscheidungen aus der alten Ansicht. Nachrichten und
Lesestände bleiben erhalten. Die vorhandenen Listener übertragen Änderungen
auf andere Geräte. Lade-/Speicherfehler werden angezeigt; es gibt kein
optimistisches Verschwinden bei fehlgeschlagenem Ausschalten.

**Bedienung und Abnahme:** Alle Schalter sind per Touch und D-Pad erreichbar.
Beim Entfernen der fokussierten Zeile geht der Fokus zum nächsten Eintrag,
bei leerer Liste zur Bereichsüberschrift. Die Geräteabnahme in #383 prüft
Liste/Termin, Ausschalten, Profilwechsel und Synchronisierung auf Smartphone
und realem Fire TV. Die Glocke bleibt ausschließlich Posteingang.

## Daten und Auslöser

- `users/{uid}/profiles/{profileId}/titleAlerts/{type-tmdbId-kind}` enthält
  beobachteten Medientyp, TMDB-ID, Titel, Anlass und Aktivierungs-ID. Nur das
  angemeldete Konto kann eine Beobachtung erstellen, lesen und löschen.
- Beim Einschalten von „Wenn inklusive“ entsteht sofort ein erster Treffer,
  sofern die aktuell veröffentlichten Titelangebote bei einem aktivierten
  Anbieter `flatrate`, `free` oder `ads` zeigen. `rent`, `buy` und ein bloßer
  Platzhalter `catalog` zählen nicht. Ein fehlender Angebotsnachweis
  wird im nächsten zentralen Prüflauf gezielt anhand der TMDB-ID geprüft.
- Der planmäßige Datenlauf prüft nach erfolgreicher Veröffentlichung
  aktive Beobachtungen einzeln bei TMDB. Ein erster inklusive verfügbarer
  Titel löst **genau eine** persönliche Nachricht aus und markiert die
  Beobachtung als `completed`. Eine spätere Rückkehr beim selben Watch
  löst keine weitere Nachricht aus. Erst eine **bewusste neue Aktivierung**
  mit anderer Aktivierungs-ID erlaubt einen neuen einmaligen Treffer.
  Rent/Buy, reine Katalog-Platzhalter, ungewählte Anbieter und fehlgeschlagene
  TMDB-Abrufe führen nicht zum Abschluss.
- „Wenn im TV“ nutzt die vollständigen, höchstens 48 Stunden alten
  Generationen von **Waipu und Joyn**. Der früheste Termin eines nicht
  deaktivierten Senders innerhalb des veröffentlichten 14-Tage-Horizonts ergibt
  eine erste Meldung mit Uhrzeit, Sender und gegebenenfalls Staffel/Folge.
  Pro Aktivierung gibt es genau eine Fundmeldung und eine abschließende
  Erinnerung zum gebundenen Termin; kein allgemeiner Sieben-Tage-Cooldown.
  Die Serienbeobachtung gilt im ersten Umfang für die Serie als Ganzes.
  Beim Einschalten prüft die App den aktuellen veröffentlichten TV-Stand auch
  sofort, damit ein Termin am selben Abend nicht bis zum nächsten Nachtlauf
  übersehen wird. Der Nachtlauf teilt dieselbe Termin-ID und meldet ihn nicht
  ein zweites Mal.
- Der Server speichert Übergangszustände unter `titleAlertState` und Meldungen
  unter `notifications`; der erste geräteübergreifende Lesestatus liegt unter
  `notificationReads` (**einmaliges `readAt`, niemals überschreibbar**).
  Firestore Rules begrenzen Clients auf das eigene Konto; innerhalb der App
  werden Meldungen und Lesestatus zusätzlich vor Anzeige auf die aktive
  Konto-/Profil-Kombination gefiltert. Der vertrauenswürdige Datenlauf
  verwendet sein bestehendes Dienstkonto.
  Client und Server verwenden dieselbe ID für den ersten Einschlusstreffer,
  damit eine erneute Prüfung keine zweite Meldung schreibt.
- Die Glocke zeigt gültige persönliche V1-/V2-Ereignisse und veröffentlichte
  globale Admin-Mitteilungen unabhängig voneinander. Für neue inklusive
  Nachrichten gilt ein Hard-TTL von 30 Tagen; bei V2-Ereignissen mit erstem
  `readAt` **und** `completedAt` bleibt die Meldung längstens sieben Tage
  nach dem späteren dieser Zeitpunkte sichtbar, niemals über das Hard-TTL.
  Ungelesene oder noch nicht abgeschlossene Meldungen behalten ihre Frist;
  bestehende V1-Nachrichten behalten ihre ursprüngliche `expiresAt`.
- Beim Einschalten von **„Wenn inklusive“** bleibt der Schalter in der
  gerade geöffneten Detailansicht optisch `Ein`, selbst bei sofortigem
  erfolgreichem Abschluss. Der echte Firestore-Status ist bereits `completed`.
  Erst nach Schließen und erneutem Öffnen zeigt er deshalb `Aus`.
  Kein Erfolgshinweis und kein Timer. Die TV-Beobachtung ist unabhängig.

## #382 – TV-Fundstufe auf 14 Tage (produktiv)

PR #405 erweitert Client und vertrauenswürdigen Server gemeinsam.
Die technische #381-Basis ist produktiv; deren Gesamtabnahme bleibt separat offen:
- Auswahl des frühesten passenden TV-Termins im **veröffentlichten 14-Tage-Horizont**,
  mit den im Benutzerkonto eingeschalteten Waipu-/Joyn-Sendern;
- **ein** erstes `tv-found`-Ereignis pro Aktivierung, unabhängig von erneuten
  Datenläufen, zusätzlichen Ausstrahlungen oder Waipu-/Joyn-Überschneidungen;
- stabile `-initial`-Benachrichtigungs-ID; alte `-airing-<timestamp>`-Ereignisse
  bleiben lesbar. Vorhandene clientseitige Erstmeldungen werden vom Nachtlauf
  übernommen statt nochmals angelegt;
- strukturierter Termin (`airingStartAt`, optional `airingEndsAt`,
  `stationName`) in neuen Erstmeldungen sowie serverseitige Terminbindung
  (`firstAiringStart`, `finalReminderAt`, `firstNotificationId`) im
  `titleAlertState`. Die erste Nachricht bleibt auch nach dem Sendebeginn
  bis höchstens sieben Tage nach Sendeende gültig (Hard-TTL maximal 30 Tage);
- Der TV-Watch bleibt nach der Erstmeldung **aktiv**.

**Terminänderungen:** Der vertrauenswürdige
Nachtlauf vergleicht den bereits gebundenen ersten TV-Termin mit beiden
vollständig verfügbaren Waipu-/Joyn-Generationen. Vor Sendebeginn korrigiert
er Beginn, Ende und Sender **innerhalb derselben Erstmeldung** ohne neue
Aktivierung, weitere Erstmeldung oder Zurücksetzen des Lesestatus. Ein
entfallener Termin wird bei vollständigen Quellen als `cancelled` markiert,
und der Minutenprüfer erzeugt dazu keine falsche Enderinnerung. Taucht
eine passende Ausstrahlung später wieder auf, wird dieselbe Erstmeldung
neu gebunden. Unvollständige Quellen führen ausdrücklich **nicht** zur
automatischen Stornierung. Bereits laufende Sendungen werden nicht rückwirkend
auf eine andere Ausstrahlung verlegt.

Terminabgleich und atomarer Watch-Abschluss sind implementiert; der unabhängige
Minutendienst ist aktiviert. Die reale Erinnerungskette wurde durch Matthias
am 12.10.2026 fachlich abgenommen; #382 ist geschlossen.

## #382 – zweite TV-Phase: Enderinnerungs-Prüfer (aktiviert)

`scripts/check-tv-final-reminders.mjs` ist ein separater, zeitkurzer
Firestore-Admin-Prüfer, der **keine** externen Programmdaten oder TMDB-Daten
abruft. Er sucht über einen eng begrenzten Collection-Group-Index nur
`notifications` mit `phase: tv-found`, `scheduleStatus: scheduled` und
`airingStartAt` im 5-Minuten-Vorlauf bzw. innerhalb von maximal sechs
Stunden nach geplantem Beginn. Die zusätzliche Statusbedingung verhindert,
dass erledigte oder abgesagte Erstmeldungen bei jedem Minutenlauf erneut
gelesen werden. Der konkrete Termin kommt
aus der **persönlichen ersten Meldung**, auch wenn diese direkt beim
Einschalten und vor dem nächsten Nachtlauf geschrieben wurde.

Pro Beobachtung ist die End-Nachricht unter `-final` fest mit der
Aktivierungs-ID verknüpft. Vor dem Schreiben prüft eine Firestore-
Transaktion erneut, ob der Watch aktiv ist und zum ersten Ereignis gehört.
Sie legt die V2-Nachricht mit `phase: tv-final` an und setzt
`titleAlerts.status: completed` sowie den Abschluss unter
`titleAlertState` atomar. Wiederholungen und nachträglich
deaktivierte oder neu aktivierte Beobachtungen dürfen keine zusätzlichen
Endmeldungen erzeugen. Beim erfolgreichen Abschluss wird außerdem der
Ersttermin aus der Minuten-Abfrage entfernt (`scheduleStatus: completed`).
Ist der Scheduler verspätet, sendet er während der **noch laufenden**
Ausstrahlung „läuft jetzt“ statt einer falschen Fünf-Minuten-Aussage.
Ist die Sendung bereits beendet, gibt es keine rückwirkende Falschmeldung:
Der Ersttermin wird als `expired` markiert, die aktive Beobachtung kann beim
nächsten bestätigten EPG-Termin neu gebunden werden – ohne zweite Fundmeldung.

**Cloud-Setup produktiv:** PR #407 ersetzt den historischen Draft #406;
PR #409/#410 liefern den privaten HTTP-/OIDC-Pfad. Der freigegebene
[Aktivierungslauf 38064584915](https://github.com/matthias-ennen/movie-hub/actions/runs/38064584915)
hat `movie-hub-tv-final-1min` in `europe-west3` mit `* * * * *` aktiviert.
Die in #382 dokumentierten Cloud-Logs vom 10.10., 17:46–17:48 Uhr Europe/Berlin,
belegen wiederholte Ausführung mit `failed=0`, aber `finalCreated=0`.
Diese historischen Logs allein belegen keinen fälligen Enderinnerungsfall.
Den realen Film-/Serien-Ablauf hat Matthias am 12.10.2026 separat abgenommen;
konkrete Testtitel, Messzeiten oder neue Cloud-Logwerte wurden nicht mitgeteilt.

**Timing und bestätigte Abnahme:** Der Worker erlaubt die Endmeldung erst ab
`airingStartAt - 5 Minuten`. Der nächste Minutentakt kann bis knapp 60 Sekunden
später liegen; zusätzliche Scheduler-/Firestore-Latenz ist möglich. Bei einer
gemeldeten Verspätung zuerst unterscheiden: `Bald im TV` (Entdeckung) oder
`Gleich im TV`/`Jetzt im TV` (Enderinnerung). Titel, Sender, Sendestart und
beobachtete Erscheinungszeit erfassen und mit Erzeugungszeit/Worker-Logs abgleichen.
Matthias hat das aktuelle Zeitverhalten am 12.10.2026 als passend bestätigt;
ein Vorlaufpuffer ist derzeit nicht erforderlich und wurde nicht implementiert.

Der normale Hosting-Deploy aktualisiert diese private Function nicht.
`prepare` blockiert bei vorhandenem Scheduler; die bereits erfolgte Aktivierung
wird nicht wiederholt. Vorgehen und Update-Grenzen stehen im
[TV-Scheduler-Runbook](TV_FINAL_SCHEDULER_RUNBOOK.md). Die fachliche Abnahme von
Film, ganzer Serie, Deduplizierung und automatischem Abschluss ist in #382
für den 12.10.2026 dokumentiert.

## Grenzen und Prüfung

Die persönliche TMDB-ID und der Titel liegen wie vorhandene persönliche
Titelreferenzen unter der UID in Firestore, sind dort aber **nicht Ende-zu-Ende
verschlüsselt**. Ein zentraler Prüflauf kann nur beobachtete IDs prüfen, die
sein Dienstkonto lesen darf. Persönliche Notizen bleiben getrennt verschlüsselt.
Vor einer weitergehenden Verschlüsselungszusage muss dieses Datenmodell mit
Matthias geklärt werden.

Automatische Tests prüfen Angebotstypen, echten Zustandswechsel,
Provideränderung, TV-Zeitfenster und Deduplizierung. Firestore-Regeln werden
in der GitHub-CI mit Java 21 getestet. Die manuelle Geräteabnahme und ein
echter geplanter Lauf bleiben eigene Prüfpunkte in #118 und #314.

## Lebenszyklus V2 – #381, Phasen A–D produktiv

Der reine Zustands- und Zeitvertrag liegt in
`src/notifications/titleAlertLifecycleModel.js` und ist inzwischen mit
Firestore-Regeln, dem Client, dem Nachtlauf und dem Posteingang verbunden.
Die Prüfungen einschließlich einer bereits vorhandenen V1-Meldung
(„Die zwei Türme“) waren erfolgreich; der vorhandene Meldungstext und der
erste Lesestatus wurden dabei nicht ersetzt.

- V1-`titleAlerts` ohne `status` bleiben lesbar und fachlich **aktiv**.
  V2 verwendet `status: active/completed`; Abschluss speichert
  `completedAt` und die deterministische `completionNotificationId`.
- Nur `included-found` und `tv-final` sind terminal.
  `tv-found` darf die Beobachtung **nicht** abschalten.
- Eine bewusste neue Aktivierung erhält eine **andere** `activationId`;
  Wiederholungen der alten Aktivierung dürfen kein neues Ereignis erzeugen.
- Hard-TTL für neue persönliche Nachrichten: 30 Tage ab Erstellung
  für „inklusive“. TV: höchstens 30 Tage ab Erstellung, bevorzugt sieben Tage
  nach Sendeende; bei fehlender Endezeit sieben Tage ab Erstellung.
  **Bestehende V1-Nachrichten behalten ihre bereits gespeicherte `expiresAt`.**
- Sind `readAt` **und** `completedAt` vorhanden, endet die Sichtbarkeit
  spätestens sieben Tage nach dem späteren Zeitpunkt, jedoch niemals nach
  der harten `expiresAt`. Ungelesene, unerledigte und ältere V1-Meldungen
  bleiben bis zu ihrer vorhandenen Hard-TTL gültig. Ein Lesen allein löscht
  niemals eine Nachricht.
- Zeitpunkte werden als UTC-Instants verglichen (Firestore Timestamp, JS Date
  oder Millisekunden), ohne lokale Sommerzeit-Arithmetik.
- Globale Admin-Mitteilungen bleiben getrennt und unverändert.

Die Phasen B–D sind integriert und produktiv ausgerollt. #381 bleibt für
die globale Admin-/Kontowechsel-Restabnahme und ausdrückliche Gesamtfreigabe offen.
Bestätigte persönliche Profil-, Fire-TV- und Zwei-Geräte-Tests bleiben abgenommen.
Insbesondere kein globales Firestore-Delete-Recht und keine ungeprüfte
Massenmigration. Die produktive TV-Endphase ist in #382 seit 12.10.2026 abgenommen.
