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
