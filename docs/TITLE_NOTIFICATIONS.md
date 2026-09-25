# Titelbezogene Mitteilungen – erster Umfang

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
  beobachtete Titel einzeln bei TMDB. Ein erster vorhandener Einschluss löst
  ebenfalls aus. Erst wenn das Angebot bei allen aktivierten Anbietern
  tatsächlich verschwunden ist, kann sein späteres Wiederkommen erneut
  melden. Eine Änderung der Anbieterauswahl erzeugt allein keine Meldung.
- „Wenn im TV“ nutzt ausschließlich eine vollständige, höchstens 48 Stunden
  alte Waipu-Generation. Der früheste Termin eines nicht deaktivierten Senders
  innerhalb der nächsten 36 Stunden ergibt eine Meldung mit Uhrzeit, Sender
  und gegebenenfalls Staffel/Folge. Derselbe Termin und weitere Termine
  derselben Serie innerhalb von sieben Tagen erzeugen keine zweite Meldung.
  Die Serienbeobachtung gilt im ersten Umfang für die Serie als Ganzes.
  Beim Einschalten prüft die App den aktuellen veröffentlichten TV-Stand auch
  sofort, damit ein Termin am selben Abend nicht bis zum nächsten Nachtlauf
  übersehen wird. Der Nachtlauf teilt dieselbe Termin-ID und meldet ihn nicht
  ein zweites Mal.
- Der Server speichert Übergangszustände unter `titleAlertState` und Meldungen
  unter `notifications`; das Gerät speichert seinen Lesestatus getrennt unter
  `notificationReads`. Firestore Rules begrenzen Clients auf das eigene Konto;
  der vertrauenswürdige Datenlauf verwendet sein bestehendes Dienstkonto.
  Client und Server verwenden dieselbe ID für den ersten Einschlusstreffer,
  damit eine erneute Prüfung keine zweite Meldung schreibt.

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
