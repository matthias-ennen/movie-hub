# Titelbezogene Mitteilungen – Stand 08.10.2026

## Bedienung

Film-/Seriendetails → Meine Einstellungen → Benachrichtigen: „Wenn inklusive“ und
„Wenn im TV“ sind getrennte, profilbezogene Schalter. Die Glocke vereint diese
persönlichen Meldungen mit den globalen Admin-Mitteilungen. Beim Öffnen eines
persönlichen Treffers wird er gelesen und führt zur Titel-Detailansicht.
Es gibt weder Betriebssystem-Push noch E-Mail oder ein Startfenster für diese
beiden Anlässe.

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
  deaktivierten Senders innerhalb der nächsten 36 Stunden ergibt eine
  Meldung mit Uhrzeit, Sender und gegebenenfalls Staffel/Folge. Derselbe Termin und weitere Termine
  derselben Serie innerhalb von sieben Tagen erzeugen keine zweite Meldung.
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

## #382 – TV-Fundstufe auf 14 Tage (Entwicklungsstand, noch nicht produktiv)

Die Entwicklung von #382 erfolgt getrennt von der abgeschlossenen #381-Basis.
Die erste Phase erweitert Client und vertrauenswürdigen Server gemeinsam:
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

**Noch nicht in dieser Phase:** Ein zeitnaher, zuverlässiger Scheduler
für das 5-Minuten-Endereignis, Terminverschiebung/-ausfall und finaler
atomarer Watch-Abschluss. Diese Schritte sind vor der Gesamtfreigabe von
#382 einschließlich IAM- und produktiver Ende-zu-Ende-Tests nötig.

## #382 – zweite TV-Phase: Enderinnerungs-Prüfer (vorbereitet, NICHT aktiviert)

`scripts/check-tv-final-reminders.mjs` ist ein separater, zeitkurzer
Firestore-Admin-Prüfer, der **keine** externen Programmdaten oder TMDB-Daten
abruft. Er sucht über einen eng begrenzten Collection-Group-Index nur
`notifications` mit `phase: tv-found` und `airingStartAt` innerhalb
des aktuellen 5-Minuten-Erinnerungsfensters. Der konkrete Termin kommt
aus der **persönlichen ersten Meldung**, auch wenn diese direkt beim
Einschalten und vor dem nächsten Nachtlauf geschrieben wurde.

Pro Beobachtung ist die End-Nachricht unter `-final` fest mit der
Aktivierungs-ID verknüpft. Vor dem Schreiben prüft eine Firestore-
Transaktion erneut, ob der Watch aktiv ist und zum ersten Ereignis gehört.
Sie legt die V2-Nachricht mit `phase: tv-final` an und setzt
`titleAlerts.status: completed` sowie den Abschluss unter
`titleAlertState` atomar. Wiederholungen und nachträglich
deaktivierte oder neu aktivierte Beobachtungen dürfen keine zusätzlichen
Endmeldungen erzeugen. Kleinere Scheduler-Verzögerungen führen zu
einer angepassten Formulierung („läuft jetzt“) statt einer falschen
Behauptung „in fünf Minuten“. Bei zu alten oder abgelaufenen
Terminen erzeugt der Prüfer **keine** falsche Erinnerung.

**Abnahme- und Release-Gates:** Der vorgesehene separate GCP-Zeitgeber,
seine Identität/Berechtigungen, Firestore-Collection-Group-Index und
laufende Kosten bedürfen einer **expliziten Freigabe**. Kein Cron-Trigger,
keine Cloud Function und keine Produktionsausführung wurden mit diesem
PR eingerichtet. Die Script-CLI `npm run alerts:tv:final:check` steht
nur für spätere autorisierte Ausführung bereit. Noch offen: Abgleich/
Neubindung verschobener oder ausgefallener Sendetermine, langfristige
Ausfallwiederholung über das kurze Toleranzfenster hinaus sowie
echter End-to-End-Test mit zwei verschiedenen Geräten.

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
- Nur `included-found` und (später in #382) `tv-final` sind terminal.
  `tv-found` darf die Beobachtung **nicht** abschalten.
- Eine bewusste neue Aktivierung erhält eine **andere** `activationId`;
  Wiederholungen der alten Aktivierung dürfen kein neues Ereignis erzeugen.
- Geplante Hard-TTL für neue persönliche Nachrichten: 30 Tage ab Erstellung
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
weitere Randfälle und die abschließende Geräte-/Mehrgeräteabnahme offen.
Insbesondere kein globales Firestore-Delete-Recht und keine ungeprüfte
Massenmigration. Die TV-Endphase und fünfminütige Erinnerung folgen
gesondert in #382.
