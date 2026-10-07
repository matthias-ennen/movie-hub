# Movie Hub – Issue-Plan

Stand: 7. Oktober 2026

## Arbeitsprinzip

Die aktive Planung enthält nur noch echte Arbeitspakete. Historische Bestandsaufnahmen werden nach Überführung ihrer Restpunkte geschlossen. Große Sammelissues werden vermieden, wenn ein klarer technischer Rest als kleineres Paket separat geführt werden kann.

## Bereinigter Status

Am 26.09.2026 wurden folgende Planungsaltlasten bereinigt:

- #225 nach bestätigter Fire-TV-Abnahme geschlossen
- #254 und #255 geschlossen; verbliebene Trailer-/Teaser-Themen nach #328 verschoben
- #260 nach vollständiger Abnahme der produktiven 228-Sender-Stufe geschlossen
- #329 für die verbleibende Waipu-Restklassifizierung angelegt
- Fire-TV-Abnahme für #312/#118 dokumentiert
- Fire-TV-Abnahme der ersten Top-100-Stufe aus #7 dokumentiert

## Aktuelle Priorisierung

### 1. #314 – Mitteilungen und Benachrichtigungen

**Aktuelles großes Produktpaket seit 03.10.2026.** Die verbindlichen
Produktentscheidungen und Abnahmekriterien stehen in #314. #312 und #118
bleiben darin als offene Teilpakete erhalten.

Konkrete Reihenfolge:

1. #380 – aktuellen Server-/IAM-Pfad prüfen und einen kontrollierten echten
   Beobachtungsfall nachweisen; notwendige Fehlerbehebung und Entkopplung
   vom Publikationsabschluss. Der aktuelle Code-Deploy lässt `alerts:check` aus
   und schließt diesen Punkt deshalb nicht.
2. #381 + #118 – einmalige Erfüllung, automatische Deaktivierung, Gültigkeit,
   Hard-TTL und endlicher Posteingang.
3. #382 – TV-Fund über 14 Tage sowie zweite In-App-Erinnerung fünf Minuten
   vor Beginn; kleiner unabhängiger Zeitprüfer ohne neue Quellenimporte.
4. #383 – aktive Beobachtungen in den Einstellungen verwalten.
5. #312 – verbleibende Ende-zu-Ende-/Mehrgeräte-Abnahme. Admin-Schreibfunktionen
   werden im getrennten Movie-Hub-Admin-Paket behandelt.
6. #384/#385 – optionalen E-Mail-Kanal und weitere Anlässe separat bewerten.

### 2. Betriebsnachtrag Waipu/Joyn vom 07.10.2026

Auf ausdrücklichen Auftrag von Matthias vorgezogen; unter #271 als Ergänzung
zu den abgeschlossenen #280/#315 dokumentiert, ohne neues eigenes Issue.

- Joyn-Vollaufbau über 14 Tage und 56 Fenster erfolgreich veröffentlicht;
- dauerhafte Checkpoints und inkrementeller TMDB-Pfad;
- gespeicherter Fehlerschutz, differenzierter Bericht und fünf öffentliche Prüfpunkte;
- Restore des größeren vollständigen Joyn-Titelbestands korrigiert;
- 837 Unit-Tests, 17 Firestore-Regeltests, CI, APK und finaler Code-Deploy erfolgreich.

**Noch offen:** regulärer Nachtlauf am 08.10.2026 (Sollstart 00:17 Uhr
Europe/Berlin) mit normalen Budgets, gesicherten Checkpoints, vollständigem
TMDB-Verbraucherabschluss und frischen gemeinsamen öffentlichen Daten.
Nachweise: [DATA_WORKFLOW_RELIABILITY.md](DATA_WORKFLOW_RELIABILITY.md).
Dieser Betriebspunkt ersetzt die Produkt-Hauptstrecke #314 nicht.

### 3. #271 – Quellenplattform und weitere Adapter danach

Die erste gemeinsame Waipu-/Joyn-Stufe ist belegt; #280 ist abgeschlossen.
Weitere Quellen bleiben getrennte Recherche-/Pilotpakete, unter anderem:

- #336 – DVB-I-Pilot;
- #388 – YouTube-Playlist-/Publisher-Quellen;
- #391 – Prime-Video-GTI-Links und möglicher Adapter;
- weitere offizielle Free-TV-/FAST-Quellen nach Zugangs- und Datenvertragsprüfung.

Die Anlage eines Quellenissues priorisiert es nicht automatisch vor #314.

### 4. Verfügbarkeitsdarstellung als Produktkern

Nach den ersten zusätzlichen Adaptern ein eigenes Paket bilden für die konsistente Darstellung und Priorisierung von:

- flatrate
- free
- ads
- rent
- buy
- kommende TV-Ausstrahlung
- laufende TV-Ausstrahlung
- eigener Movie-Hub-Inhalt

Ziel: Ein Nutzer erkennt unmittelbar, ob ein Titel ohne Einzelkauf verfügbar ist oder bald kostenlos im TV läuft.

## Parallel / nicht blockierend

- #329 – Waipu-Restklassifizierung
- #386 – verbleibende Fire-TV-Navigations-Freezes; eigenes Folgepaket nach #346
- #387 – Inventur, Fokus und Navigation der Einstellungen
- #7 – Empfehlungen/Automatisierung; Top-100-Stufe bereits abgenommen
- #328 – Trailer/Teaser-Finish
- #327 – TMDB-Kontosynchronisation, später
- #129 – Deutsch/Englisch, später
- #223 – Provisorien/Rückbau
- #8 – Ideensammlung
- #308 – Zukunftsvision

## Release 1.0

Vor öffentlicher Veröffentlichung:

- ausreichend breites und ausfallsicheres Quellenfundament
- klare Verfügbarkeitsdarstellung
- stabile Nachtläufe und Adapterzustände
- Geräteabnahmen auf Smartphone, Tablet und Fire TV
- wesentliche Provisorien bereinigt
- #112 Compliance vollständig bearbeitet bzw. extern freigegeben, wo erforderlich

## Aktuelle Abhängigkeitskette

`#314 (#380 → #381/#118 → #382 → #383 → offene Abnahmen; #384/#385 optional) → #271/weitere Adapter → Verfügbarkeitsdarstellung und Produkt-Finish → #112 → 1.0`

#280, #315 und #346 bleiben abgeschlossen. Die Nachtlauf-Bestätigung des
Betriebsnachtrags wird separat geprüft. #329 bleibt Wartung; Movie Hub Admin
wird als getrenntes späteres Paket behandelt.
